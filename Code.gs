/**
 * MedLingo — student usage backend (Google Apps Script, bound to a Google Sheet)
 *
 * The web page (GitHub Pages) signs students in with Google and sends their
 * progress here. This script checks the sign-in with Google, then keeps ONE ROW
 * PER STUDENT in the "Usage" sheet. Teachers listed below can open the
 * Teacher Dashboard on the page; everyone else can only read/write their own row.
 *
 * Student ID + name: on first sign-in each student enters 學號 and 姓名 once; it is
 * bound to their Google account. Columns B–C ("Student ID", "Name") are YOURS:
 * students cannot change them after binding, and you may correct them by hand.
 * Optional roster: add a sheet named "Roster" with Student ID in column A and
 * Name in column B (row 1 = headers). If it has rows, only listed students whose
 * name matches can bind, and one Student ID can be bound to only one Google account.
 *
 * Setup: see README.md, step 3. After editing this file: Deploy → Manage
 * deployments → (pencil) → Version: New version → Deploy.
 */

// ── 1. Settings ──────────────────────────────────────────────────────────────
const CLIENT_ID = '159350431685-s7095o51b6o2dvfmci9obo28v67iai65.apps.googleusercontent.com';            // the same OAuth Client ID you put in index.html CONFIG
const TEACHERS = [               // Google accounts that may open the Teacher Dashboard
  'a103262003@gmail.com',
];
const ALLOWED_DOMAIN = '';       // e.g. 'g-mail.nsysu.edu.tw' to accept school accounts only; '' = any Google account
const SHEET_NAME = 'Usage';
const ROSTER_NAME = 'Roster';

// Units shown as columns in the sheet (must match the page)
const UNITS = [
  [1, 'Unit 1 Word Parts'], [2, 'Unit 2 Clinical Vocabulary'], [3, 'Unit 3 Clinical Procedures'],
  [4, 'Unit 4 Internal Medicine'], [5, 'Unit 5 Surgery'], [6, 'Unit 6 OB/GYN'], [7, 'Unit 7 Pediatrics'],
  [8, 'Unit 8 Psychiatry'], [9, 'Unit 9 Other Specialties'], [10, 'Supp 1 Healthcare Management'],
];

// ── 2. Web app entry points ──────────────────────────────────────────────────
function doGet() {
  return ContentService.createTextOutput('MedLingo API is running.');
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_request' }); }

  const who = verify_(req.token);
  if (!who) return out_({ ok: false, error: 'auth' });
  if (who.domainBlocked) return out_({ ok: false, error: 'domain' });
  const teacher = TEACHERS.map(s => s.toLowerCase()).indexOf(who.email) >= 0;

  if (req.action === 'hello') {
    if (teacher) return out_({ ok: true, teacher: true, record: null, profile: null });
    const got = getRow_(who.email);
    return out_({ ok: true, teacher: false, record: got ? got.record : null, profile: got && got.sid ? { sid: got.sid, name: got.name } : null });
  }
  if (req.action === 'profile') {
    if (teacher) return out_({ ok: false, error: 'teacher' });
    return out_(bindProfile_(who, req.sid, req.name));
  }
  if (req.action === 'save') {
    if (teacher) return out_({ ok: true });
    if (!req.record || typeof req.record !== 'object') return out_({ ok: false, error: 'bad_request' });
    const json = JSON.stringify(req.record);
    if (json.length > 45000) return out_({ ok: false, error: 'too_large' });
    saveRecord_(who, req.record, json);
    return out_({ ok: true });
  }
  if (req.action === 'all') {
    if (!teacher) return out_({ ok: false, error: 'forbidden' });
    return out_({ ok: true, rows: allRows_() });
  }
  return out_({ ok: false, error: 'unknown_action' });
}

// ── 3. Sign-in check (Google ID token) ───────────────────────────────────────
function verify_(token) {
  if (!token || !CLIENT_ID) return null;
  const cache = CacheService.getScriptCache();
  const key = 't' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const p = JSON.parse(res.getContentText());
  if (p.aud !== CLIENT_ID) return null;
  if (String(p.email_verified) !== 'true') return null;
  if (Number(p.exp) * 1000 < Date.now()) return null;

  const email = String(p.email).toLowerCase();
  const who = { email: email, name: p.name || '' };
  if (ALLOWED_DOMAIN && !email.endsWith('@' + ALLOWED_DOMAIN.toLowerCase())) who.domainBlocked = true;
  const ttl = Math.max(60, Math.min(3000, Math.floor(Number(p.exp) - Date.now() / 1000 - 60)));
  cache.put(key, JSON.stringify(who), ttl);
  return who;
}

// ── 4. Sheet storage: one row per student ────────────────────────────────────
function header_() {
  const h = ['Email', 'Student ID', 'Name', 'Google name', 'First visit', 'Last active', 'Visits', 'Cards viewed', 'Quizzes', 'Accuracy %', 'Starred words'];
  UNITS.forEach(u => h.push(u[1] + ' · cards', u[1] + ' · quizzes', u[1] + ' · best %'));
  h.push('Mixed quizzes', 'Mixed best %', 'Data (do not edit)');
  return h;
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  const h = header_();
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== 'Email') {
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setFrozenColumns(2);
  }
  return sh;
}

function findRow_(sh, email) {
  if (sh.getLastRow() < 2) return 0;
  const f = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(email).matchEntireCell(true).findNext();
  return f ? f.getRow() : 0;
}

function sum_(o) { let s = 0; Object.keys(o || {}).forEach(k => s += Number(o[k]) || 0); return s; }

function rowValues_(who, r, json, keep) {
  keep = keep || {};
  const quiz = r.quiz || {};
  let n = 0, qs = 0, correct = 0;
  Object.keys(quiz).forEach(k => { n += quiz[k].n || 0; qs += quiz[k].qs || 0; correct += quiz[k].correct || 0; });
  const v = [who.email, keep.sid || '', keep.name || '', who.name, r.firstSeen || '', r.lastSeen || '', r.sessions || 0, sum_(r.cards), n,
    qs ? Math.round(correct / qs * 100) : '', r.starred || 0];
  UNITS.forEach(u => {
    const k = String(u[0]), q = quiz[k];
    v.push((r.cards || {})[k] || 0, q ? q.n : 0, q ? q.best : '');
  });
  v.push(quiz.mix ? quiz.mix.n : 0, quiz.mix ? quiz.mix.best : '', json);
  return v;
}

function saveRecord_(who, record, json) {
  // Each student only ever writes their own row, so updates run in parallel without a lock;
  // only creating a new row is serialized (so two first saves can't create duplicate rows).
  const sh = sheet_();
  let row = findRow_(sh, who.email);
  if (row) {
    const keep = { sid: sh.getRange(row, 2).getValue(), name: sh.getRange(row, 3).getValue() };
    const vals = rowValues_(who, record, json, keep);
    sh.getRange(row, 1, 1, vals.length).setValues([vals]);
    return;
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    row = findRow_(sh, who.email);
    const keep = row ? { sid: sh.getRange(row, 2).getValue(), name: sh.getRange(row, 3).getValue() } : {};
    const vals = rowValues_(who, record, json, keep);
    if (row) sh.getRange(row, 1, 1, vals.length).setValues([vals]);
    else sh.appendRow(vals);
  } finally {
    lock.releaseLock();
  }
}

function getRow_(email) {
  const sh = sheet_();
  const row = findRow_(sh, email);
  if (!row) return null;
  const w = header_().length;
  const v = sh.getRange(row, 1, 1, w).getValues()[0];
  let record = null;
  try { record = JSON.parse(v[w - 1]); } catch (e) {}
  return { sid: String(v[1] || '').trim(), name: String(v[2] || '').trim(), record: record };
}

const norm_ = s => String(s || '').replace(/\s+/g, '').toUpperCase();

function bindProfile_(who, sid, name) {
  sid = String(sid || '').trim().toUpperCase();
  name = String(name || '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Z0-9]{4,20}$/.test(sid)) return { ok: false, error: 'bad_sid' };
  if (!name || name.length > 40) return { ok: false, error: 'bad_name' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_();
    let row = findRow_(sh, who.email);
    if (row && String(sh.getRange(row, 2).getValue()).trim()) {   // already bound: students cannot change it
      return { ok: true, profile: { sid: String(sh.getRange(row, 2).getValue()).trim(), name: String(sh.getRange(row, 3).getValue()).trim() }, locked: true };
    }
    // optional roster check
    const roster = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ROSTER_NAME);
    if (roster && roster.getLastRow() >= 2) {
      const list = roster.getRange(2, 1, roster.getLastRow() - 1, 2).getValues();
      const hit = list.find(r => norm_(r[0]) === norm_(sid));
      if (!hit) return { ok: false, error: 'not_in_roster' };
      if (norm_(hit[1]) !== norm_(name)) return { ok: false, error: 'name_mismatch' };
      name = String(hit[1]).trim();
    }
    // one Student ID per Google account
    if (sh.getLastRow() >= 2) {
      const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
      if (ids.some(r => norm_(r[1]) === sid && String(r[0]).toLowerCase() !== who.email)) return { ok: false, error: 'sid_taken' };
    }
    if (!row) {
      const now = new Date().toISOString();
      const rec = { v: 1, firstSeen: now, lastSeen: now, sessions: 0, study: {}, cards: {}, quiz: {}, starred: 0 };
      sh.appendRow(rowValues_(who, rec, JSON.stringify(rec), { sid: sid, name: name }));
    } else {
      sh.getRange(row, 2, 1, 2).setValues([[sid, name]]);
    }
    return { ok: true, profile: { sid: sid, name: name } };
  } finally {
    lock.releaseLock();
  }
}

function allRows_() {
  const sh = sheet_();
  if (sh.getLastRow() < 2) return [];
  const w = header_().length;
  return sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues()
    .filter(r => r[0])
    .map(r => { let rec = {}; try { rec = JSON.parse(r[w - 1]); } catch (e) {} return { email: r[0], sid: String(r[1] || ''), name: String(r[2] || ''), googleName: String(r[3] || ''), record: rec }; });
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
