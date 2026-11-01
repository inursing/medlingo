# MedLingo — 架設說明（GitHub Pages ＋ Google 登入 ＋ Google 試算表）

這個資料夾有兩個檔案要用到：

| 檔案 | 放哪裡 | 作用 |
|---|---|---|
| `index.html` | GitHub（GitHub Pages） | 學生使用的網頁 |
| `apps-script/Code.gs` | 你的 Google 試算表 → Apps Script | 接收學生紀錄、存進試算表 |

**不設定也能用**：`index.html` 直接放上 GitHub 就能使用，只是紀錄存在各自的瀏覽器，你看不到學生資料。
完成下面 4 個步驟後，學生用 Google 帳號登入，紀錄就會跨裝置同步，並寫進你的試算表。

整個設定大約 20–30 分鐘，只需要做一次。

---

## 步驟 1　把網頁放上 GitHub Pages

1. 登入 GitHub → 右上角 **+** → **New repository**。名稱例如 `medlingo`，選 **Public** → **Create repository**。
2. 在新 repo 頁面按 **uploading an existing file**，把 `index.html` 拖進去 → **Commit changes**。
3. 到 repo 的 **Settings → Pages**：
   - Source 選 **Deploy from a branch**
   - Branch 選 **main**、資料夾 **/ (root)** → **Save**
4. 等 1–2 分鐘，頁面上方會出現網址，例如：
   `https://你的帳號.github.io/medlingo/`
   打開確認網頁能用。

> 記下 **網域部分**：`https://你的帳號.github.io`（不含 `/medlingo/`），步驟 2 會用到。

---

## 步驟 2　建立 Google 登入用的 Client ID

1. 打開 <https://console.cloud.google.com/>，用你的學校 Google 帳號登入。
2. 上方選擇專案 → **新增專案**，名稱例如 `MedLingo` → 建立，並切換到這個專案。
3. 左側選單 **API 和服務 → OAuth 同意畫面**（新版介面叫 **Google Auth Platform → 品牌塑造 / 目標對象**）：
   - **使用者類型**：
     - 若只給學校帳號用，且學校 Google Workspace 允許，選 **內部（Internal）**。
     - 否則選 **外部（External）**。
   - 應用程式名稱：`MedLingo`；使用者支援電子郵件、開發人員聯絡資訊：填你的信箱 → 儲存。
   - 若選了「外部」，到 **目標對象（Audience）** 按 **發布應用程式（Publish app）**，改成「實際運作中」。
     只用基本登入資訊（姓名、Email），**不需要** Google 審查；沒發布的話只有測試使用者能登入。
4. 左側 **憑證（Credentials）** → **建立憑證 → OAuth 用戶端 ID**：
   - 應用程式類型：**網頁應用程式（Web application）**
   - **已授權的 JavaScript 來源**：新增 `https://你的帳號.github.io`（步驟 1 記下的網域，**結尾不要斜線、不要加 /medlingo**）
   - 「已授權的重新導向 URI」留空 → **建立**
5. 複製畫面上的 **用戶端 ID**，長得像：
   `1234567890-abcdefg.apps.googleusercontent.com`

---

## 步驟 3　建立試算表和 Apps Script

1. 到 <https://sheets.new> 建立新試算表，命名例如 `MedLingo 學生紀錄`。
2. 選單 **擴充功能 → Apps Script**。
3. 刪掉編輯器裡原本的內容，把 `apps-script/Code.gs` **整份貼上**。
4. 修改最上面的設定：
   ```js
   const CLIENT_ID = '貼上步驟 2 的用戶端 ID';
   const TEACHERS = [
     'janeliu@g-mail.nsysu.edu.tw',   // 可以看教師後台的帳號，可加多位助教
   ];
   const ALLOWED_DOMAIN = 'g-mail.nsysu.edu.tw';  // 只接受學校帳號；留 '' 則任何 Google 帳號都可
   ```
5. 按 💾 儲存。
6. 右上 **部署 → 新增部署作業**：
   - 齒輪選 **網頁應用程式**
   - **執行身分**：**我**
   - **誰可以存取**：**所有人（Anyone）**
   - 按 **部署** → 依指示 **授權存取**（可能出現「Google 尚未驗證這個應用程式」→ 進階 → 前往（不安全）→ 允許。這是你自己的程式，屬正常）。
7. 複製 **網頁應用程式網址**，結尾是 `/exec`：
   `https://script.google.com/macros/s/AKfy...../exec`
8. （建議）在同一個試算表**新增工作表**，命名為 **`Roster`**，貼上修課名單：

   | A 欄 | B 欄 |
   |---|---|
   | Student ID | Name |
   | B123456789 | 陳美玲 |
   | B123456790 | 王小明 |

   第 1 列是標題，從第 2 列開始放學生。有這張名單時，學生填的學號必須在名單上、姓名也要相同才能綁定；
   沒有這張工作表就不檢查，學生填什麼就記什麼。

> 「誰可以存取：所有人」是讓網頁能把資料送過來；每一筆資料都會先向 Google 驗證登入身分，學生只能寫自己的那一列，也看不到別人的紀錄。

---

## 步驟 4　把設定填進 index.html

1. 在 GitHub repo 點 `index.html` → 右上鉛筆 ✏️ 編輯。
2. 按 `Ctrl+F` 搜尋 `CONFIG`，找到：
   ```js
   const CONFIG={
     GOOGLE_CLIENT_ID:'',
     SCRIPT_URL:'',
     REQUIRE_SIGN_IN:false,
   };
   ```
3. 填入：
   ```js
   const CONFIG={
     GOOGLE_CLIENT_ID:'1234567890-abcdefg.apps.googleusercontent.com',
     SCRIPT_URL:'https://script.google.com/macros/s/AKfy...../exec',
     REQUIRE_SIGN_IN:false,   // 改成 true：學生必須先登入才能使用
   };
   ```
4. **Commit changes**。約 1 分鐘後重新整理網頁。

---

## 學生怎麼對應到學號、姓名

- 學生**第一次**用 Google 登入後，會跳出表單請他填 **學號** 與 **姓名**，送出後就和這個 Google 帳號綁定。
  若學校信箱開頭就是學號（例如 `b123456789@...`），表單會自動帶入學號。
- 綁定後**學生自己不能再修改**，避免亂改或冒用。學生按 Later 跳過也能使用，但首頁會一直提醒他補填；教師後台會用紅字標示「no student ID」。
- 有放 `Roster` 名單時：學號不在名單上、姓名不符、或這個學號已被另一個 Google 帳號綁定，都會被擋下並顯示原因，請學生找老師處理。
- **你可以直接在試算表修正**：`Usage` 工作表的 **Student ID**（B 欄）和 **Name**（C 欄）以你填的為準，之後學生的使用紀錄更新也不會覆蓋。
  要讓學生重新綁定（例如換了 Google 帳號），把那一列的 B、C 兩格清空，或刪除整列即可。

## 完成後怎麼確認

1. 用**學生帳號**（或另一個非教師帳號）打開網頁 → 首頁上方按 **Sign in with Google** → 填學號姓名 → 學一兩張卡、考一次試。
2. 打開試算表，會多一個 **Usage** 工作表，每個學生一列：
   Email、學號、姓名、Google 名稱、第一次／最後使用時間、造訪次數、看過幾張卡、測驗次數、答對率、不熟單字數，以及各單元的卡片數、測驗次數、最高分。
3. 用**教師帳號**登入網頁，首頁上方會出現 **📊 Teacher Dashboard**：列出「姓名 · 學號」，可依最後使用時間或學號排序、展開各單元明細、匯出 CSV（依學號排序）。
   教師帳號自己的操作不會被記錄。

最右邊的 `Data (do not edit)` 欄是同步用的完整資料，請不要手動修改。可以另開工作表做統計或圖表。

---

## 常見問題

- **按了登入沒反應／出現 `origin_mismatch`**：步驟 2 的「已授權的 JavaScript 來源」要和網址的網域一模一樣，例如 `https://你的帳號.github.io`，不能有結尾斜線或路徑。修改後要等幾分鐘生效。
- **登入後顯示 "Please sign in with your school Google account"**：該帳號不是 `ALLOWED_DOMAIN` 指定的學校網域。
- **登入後顯示 "Could not reach the server"**：檢查 `SCRIPT_URL` 是否以 `/exec` 結尾，以及部署的「誰可以存取」是否為「所有人」。
- **改了 Code.gs 沒生效**：Apps Script 要重新部署。**部署 → 管理部署作業 → ✏️ → 版本選「新版本」→ 部署**。網址不會變。
- **只有我自己能登入**：OAuth 同意畫面還在「測試中」，到「目標對象」按「發布應用程式」。
- **學生沒登入也能用嗎？** 可以，`REQUIRE_SIGN_IN:false` 時未登入照常使用，只是紀錄只存在該瀏覽器、你也看不到。之後登入，會把這台裝置的紀錄一起上傳。
- **隱私**：試算表內有學生 Email 與學習紀錄，只有你（和你分享試算表的人）看得到，請勿公開分享試算表。

---
最後更新：2026-11-01（Supp 2 各系統解剖用語、課本拼字修正、Cloudflare Worker AI proxy）
