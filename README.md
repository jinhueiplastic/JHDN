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
2. 依序貼上並執行這三個檔案的完整內容：
   - [`supabase/migrations/0001_init_orders.sql`](./supabase/migrations/0001_init_orders.sql)（訂單主表）
   - [`supabase/migrations/0002_drivers.sql`](./supabase/migrations/0002_drivers.sql)（司機名單，網站上用點選的司機清單就是存在這張表）
   - [`supabase/migrations/0003_drop_shipped_status.sql`](./supabase/migrations/0003_drop_shipped_status.sql)（把狀態簡化成只剩未回單/已回單兩種）
3. 每個都 Run 一次即可（之後改版只要新增新的 migration 檔案，重新貼上執行）

資料表 `JHDN_orders` 結構（一列 = 一個日期 + 一個單號）：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `order_date` | date | 日期 |
| `order_number` | smallint (1-300) | 單號，畫面上會補零顯示成 0001-0300 |
| `status` | text | `unreturned`(未回單，預設) / `returned`(已回單) |
| `driver_name` | text | 司機姓名 |
| `out_of_county` | boolean | 是否外縣市 |
| `order_price` | numeric | 填單價（跟現銷價、發票金額三選一） |
| `cash_sale_price` | numeric | 當日現銷價錢 |
| `invoice_price` | numeric | 有開發票的價錢 |
| `unreturned_date` | date | 這筆單號建立/標記未回單當下自動記錄的日期 |
| `created_at` / `updated_at` | timestamptz | 自動填寫 |

## 3. 網站功能對照需求

- **未回單**（新建立單號的預設狀態）：可點選司機姓名、勾選外縣市、選擇價格類型
  （填單價／現銷價／發票金額三選一）並填入金額；建立時自動記錄 `unreturned_date`
- **已回單**：點選司機姓名會把這筆從未回單自動轉成已回單（代表司機的單已經回來了），
  這個狀態下司機姓名、外縣市、價格都唯讀顯示，如果點錯了可以用「改回未回單」修正

畫面上方可依日期查詢、依狀態（全部/未回單/已回單）篩選；每一列直接在表格上編輯，
不需要另外開視窗。頁面最下方有司機名單管理，新增一次司機之後，每一列都能點選。

## 4. Google Sheet 同步（Apps Script，即時）

程式在 [`google-apps-script/sync-orders.gs`](./google-apps-script/sync-orders.gs)。
網站每次寫入 Supabase 後，Supabase 會透過 Database Webhook 立刻通知這個 Apps
Script，單筆單筆即時反映到 Google Sheet 專用的分頁（預設分頁名稱
`Supabase同步(勿手動編輯)`，不要在這個分頁手動輸入資料）。你自己的「出貨單」
「Data」分頁不受影響。

寫入的欄位順序：

| 欄 | 欄位名稱 | 對應資料 |
|---|---|---|
| A | ID | Supabase 的 id（用來比對是哪一列，不要刪掉這欄） |
| B | 日期 | order_date |
| C | 單號 | order_number（補零成 0001-0300） |
| D | 狀態 | 未回單 / 已回單 |
| E | 司機姓名 | driver_name |
| F | 外縣市 | 是 / 否 |
| G | 填單價 | order_price |
| H | 當日現銷價錢 | cash_sale_price |
| I | 發票金額 | invoice_price |
| J | 未回單日期 | unreturned_date |
| K | 建立時間 | created_at |
| L | 更新時間 | updated_at |

設定步驟：

1. Google Sheet -> 擴充功能 -> Apps Script，把 `sync-orders.gs` 整份貼進去
2. 左側「專案設定」(齒輪) -> 指令碼屬性，新增：
   - `SUPABASE_URL` = `https://duypvottqpjsmvlclyit.supabase.co`
   - `SUPABASE_ANON_KEY` = 你的 anon public key
   - `SHEET_NAME`（選填，不填就用預設分頁名稱）
   - `WEBHOOK_TOKEN` = 自己隨便設一組不容易猜到的字串，防止別人亂打這個網址
3. 執行一次 `syncFromSupabase`，同意授權視窗（順便把現有資料整批同步一次）
4. 左上角「部署」-> 新增部署作業 -> 類型「網頁應用程式」-> 執行身分「我」->
   具有存取權的使用者「任何人」-> 部署，複製產生的網址（結尾 `/exec`）
5. Supabase 專案 -> **Database -> Webhooks -> Create a new hook**：
   - Table：`JHDN_orders`
   - Events：勾選 Insert、Update、Delete
   - Type：HTTP Request，Method：POST
   - URL：第 4 步的網址，後面加 `?token=你在 WEBHOOK_TOKEN 設的字串`
6. 存檔後，之後在網站上新增/修改/刪除單號，幾秒內就會反映到 Sheet。之後也能
   隨時從 Sheet 選單「JHDN 同步」->「立即同步」手動整批重跑一次（適合第一次
   建表、或懷疑漏同步時用）。

之後如果要多加欄位，跟我說一聲，我會同時更新 Supabase 資料表、網站表單、跟這個
Apps Script 的欄位對照表。

## 5. 部署

站台建議用 Vercel：把這個 repo import 進 Vercel，環境變數設定
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`，即可部署。
