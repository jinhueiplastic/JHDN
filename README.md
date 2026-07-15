# JHDN 出貨單管理

未回單 / 已回單 追蹤網站。前端用 Next.js，資料存在 Supabase，另外提供一個
Google Apps Script，定期把 Supabase 的資料同步一份到 Google Sheet 當報表/備份。

> Supabase 專案跟公司其他網站共用，所有這個專案專用的資料表、函式、政策都加上
> `JHDN_` / `jhdn_` 前綴，確保跟其他網站的資料完全分開、互不影響。

## 1. 本機開發

```bash
npm install
cp .env.local.example .env.local   # 填入 Supabase 專案的 URL 與 anon key
npm run dev
```

開啟 http://localhost:3000。

## 2. 建立 Supabase 資料表

這個 sandbox 環境連不到外部 Supabase（網路政策擋掉了），所以資料表要你自己手動建立：

1. 打開 Supabase 專案 -> SQL Editor -> New query
2. 依序貼上並執行這六個檔案的完整內容：
   - [`supabase/migrations/0001_init_orders.sql`](./supabase/migrations/0001_init_orders.sql)（訂單主表）
   - [`supabase/migrations/0002_drivers.sql`](./supabase/migrations/0002_drivers.sql)（司機名單，網站上用點選的司機清單就是存在這張表）
   - [`supabase/migrations/0003_drop_shipped_status.sql`](./supabase/migrations/0003_drop_shipped_status.sql)（把狀態簡化成只剩未回單/已回單兩種）
   - [`supabase/migrations/0004_backfill_missing_status.sql`](./supabase/migrations/0004_backfill_missing_status.sql)（把現有資料裡沒有正確狀態的舊資料都補成未回單）
   - [`supabase/migrations/0005_orders_webhook_trigger.sql`](./supabase/migrations/0005_orders_webhook_trigger.sql)（建立資料異動觸發器）
   - [`supabase/migrations/0006_orders_sync_queue.sql`](./supabase/migrations/0006_orders_sync_queue.sql)（把觸發器改成寫入同步佇列，見下面第 4 節）
   - [`supabase/migrations/0007_daily_order_provisioning.sql`](./supabase/migrations/0007_daily_order_provisioning.sql)（每天凌晨 00:01 台北時間自動建立當天 300 個單號，見下面第 3 節）
   - [`supabase/migrations/0008_raise_order_number_limit.sql`](./supabase/migrations/0008_raise_order_number_limit.sql)（單號上限從 300 提高到 9999，給批次新增超過 300 號用）
   - [`supabase/migrations/0009_shipped_date.sql`](./supabase/migrations/0009_shipped_date.sql)（新增「實際出貨日」欄位）
3. 每個都依序 Run 一次即可（之後改版只要新增新的 migration 檔案，重新貼上執行）

資料表 `JHDN_orders` 結構（一列 = 一個日期 + 一個單號）：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `order_date` | date | 日期 |
| `order_number` | smallint (1-9999) | 單號，畫面上會補零顯示成 0001-9999 |
| `status` | text | `unreturned`(未回單，預設) / `returned`(已回單) |
| `driver_name` | text | 司機姓名 |
| `out_of_county` | boolean | 是否外縣市 |
| `order_price` | numeric | 填單價（跟現銷價、發票金額三選一） |
| `cash_sale_price` | numeric | 當日現銷價錢 |
| `invoice_price` | numeric | 有開發票的價錢 |
| `shipped_date` | date | 實際出貨日，選了價格類型後第一次自動填今天，之後可自行更改 |
| `unreturned_date` | date | 這筆單號建立/標記未回單當下自動記錄的日期 |
| `created_at` / `updated_at` | timestamptz | 自動填寫 |

## 3. 網站功能對照需求

- **未回單**（新建立單號的預設狀態）：可點選司機姓名、勾選外縣市、選擇價格類型
  （填單價／現銷價／發票金額三選一）並填入金額；建立時自動記錄 `unreturned_date`
- **已回單**：點選司機姓名會把這筆從未回單自動轉成已回單（代表司機的單已經回來了），
  這個狀態下司機姓名、外縣市、價格都唯讀顯示，如果點錯了可以用「改回未回單」修正；
  `unreturned_date` 這欄位在已回單頁面會改標示成「已回單日期」，記錄確認回單的日期

畫面上方可依日期查詢、依狀態（全部/未回單/已回單）篩選；每一列直接在表格上編輯，
不需要另外開視窗。頁面最下方有「+ 批次新增單號」，平常用不到（每天會自動建好
0001-0300），只有某一天需要超過 300 號時才用這個手動補上去（可以填到 9999）。

當天的 300 個單號不用等有人打開網站才建立——Supabase 有一個排程（`pg_cron`），
每天台北時間 00:01 自動建立好，這樣 Google Sheet 那邊也有時間在大家開始上班前
先同步完（見下面第 4 節同步佇列的說明）。網站上原本「選到還沒建立過的日期就自動
建立 300 筆」的邏輯還在，當備援用（例如排程萬一沒跑成功）。

## 網站頁面

- **`/`**：首頁，連到下面四個頁面
- **`/daily`**（也可以用 `/daily.html`）：每日訂單管理，就是上面第 3 節說的畫面，
  日期兩側有 ‹ › 按鈕可以快速切換前一天/後一天
- **`/filter`**（也可以用 `/filter.html`）：依司機查詢，點選司機名字看他所有日期的
  單號，可以選填起始/結束日期縮小範圍；頁面最下方收合的「司機名單管理」可以新增/
  刪除司機（點旁邊的 ▾ 展開）
- **`/order`**（也可以用 `/order.html`）：依單號查詢，輸入完整 11 碼單號（例如
  `11507140001`）查單筆資料；只輸入 7 碼日期（例如 `1150714`）則查出當天全部單號
- **`/report`**（也可以用 `/report.html`）：列印報表，可以選「整月報表」（選一個
  月份，該月全部單號）或「依司機報表」（選司機，日期選填），按「下載 Excel」
  在瀏覽器本機產生 .xlsx 檔案下載；報表中「未回單」的列是淺綠色底色，「外縣市」
  的訂單是粗體紅字
- 每個頁面左上角都有 ☰ 選單按鈕，可以在五個頁面之間切換

選日期時如果選到還沒到的未來日期，不會自動建立那天的 300 個單號（只有今天或
過去的日期，或是每天 00:01 的排程，才會自動建立）。

## 4. Google Sheet 同步（Apps Script，自動排隊處理）

程式在 [`google-apps-script/sync-orders.gs`](./google-apps-script/sync-orders.gs)。
網站每次寫入 Supabase，資料庫觸發器會把這筆異動記錄進一個佇列表
（`JHDN_sync_queue`），這一步很快，不會卡住網站。接著 Apps Script 設定一個
「每分鐘」自動執行的時間觸發條件，依序、一列一列把佇列清空、寫進 Google Sheet
專用的分頁（預設分頁名稱 `Supabase同步(勿手動編輯)`，不要在這個分頁手動輸入
資料）。你自己的「出貨單」「Data」分頁不受影響。

這樣設計是因為：如果每次異動都「立刻」直接呼叫 Google（例如選一個新日期一次
建立 300 個單號），會瞬間送出幾百個請求，Google Apps Script 處理不了這麼多
「同時」的請求，資料會遺漏、順序也會錯亂。改成排隊 + 每分鐘自動清空，不管一次
異動幾筆都不會出錯，也完全不需要手動點任何按鈕——一般情況下新資料大約 1 分鐘
內就會出現在 Sheet 上，一次異動很多筆的話，全部同步完可能要多等個幾分鐘。

寫入的欄位順序：

| 欄 | 欄位名稱 | 對應資料 |
|---|---|---|
| A | 日期 | order_date |
| B | 單號 | 完整代碼，例如 `11507140001`（跟網站上顯示的一致，也是即時同步比對是哪一列用的欄位，不要刪掉這欄） |
| C | 狀態 | 未回單 / 已回單 |
| D | 司機姓名 | driver_name |
| E | 外縣市 | 是 / 否 |
| F | 填單價 | order_price |
| G | 當日現銷價錢 | cash_sale_price |
| H | 發票金額 | invoice_price |
| I | 未回單日期 | unreturned_date（未回單狀態顯示標記未回單的日期，已回單狀態顯示確認回單的日期） |
| J | 建立時間 | created_at |
| K | 更新時間 | updated_at |

設定步驟：

1. Google Sheet -> 擴充功能 -> Apps Script，把 `sync-orders.gs` 整份貼進去
   （如果之前貼過舊版，直接整份覆蓋掉）
2. 左側「專案設定」(齒輪) -> 指令碼屬性，新增：
   - `SUPABASE_URL` = `https://duypvottqpjsmvlclyit.supabase.co`
   - `SUPABASE_ANON_KEY` = 你的 anon public key
   - `SHEET_NAME`（選填，不填就用預設分頁名稱）
3. 執行一次 `syncFromSupabase`，同意授權視窗（順便把現有資料整批同步一次）
4. 左側「觸發條件」(時鐘圖示) -> 新增觸發條件：
   - 選擇要執行的函式：`drainSyncQueue`
   - 選取事件來源：時間驅動
   - 選取時間類型：分鐘計時器 -> 每分鐘
   - 儲存
5. 確認 Supabase 已經執行過 `0005_orders_webhook_trigger.sql` 跟
   `0006_orders_sync_queue.sql`（見上面第 2 節）
6. 之後在網站上新增/修改/刪除單號，會自動進佇列，`drainSyncQueue` 每分鐘
   自動清空、寫進 Sheet，完全不需要手動操作。也可以隨時從 Sheet 選單
   「JHDN 同步」->「立即同步」手動整批重跑一次（適合第一次建表、或想立刻
   整批對一次資料時用）。

這個做法不需要把 Apps Script 部署成網頁應用程式，也不需要在 Supabase 設定
Webhook 或 token——Google 這邊主動去讀佇列，Supabase 完全不用知道 Apps
Script 的網址。

之後如果要多加欄位，跟我說一聲，我會同時更新 Supabase 資料表、網站表單、跟這個
Apps Script 的欄位對照表。

## 5. 部署

站台建議用 Vercel：把這個 repo import 進 Vercel，環境變數設定
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`，即可部署。
