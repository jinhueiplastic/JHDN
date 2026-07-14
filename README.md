# JHDN 出貨單管理

出貨單 / 已回單 / 未回單 追蹤網站。前端用 Next.js，資料存在 Supabase，另外提供一個
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
2. 依序貼上並執行這兩個檔案的完整內容：
   - [`supabase/migrations/0001_init_orders.sql`](./supabase/migrations/0001_init_orders.sql)（出貨單主表）
   - [`supabase/migrations/0002_drivers.sql`](./supabase/migrations/0002_drivers.sql)（司機名單，網站上用點選的司機清單就是存在這張表）
3. 每個都 Run 一次即可（之後改版只要新增新的 migration 檔案，重新貼上執行）

資料表 `JHDN_orders` 結構（一列 = 一個日期 + 一個單號）：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `order_date` | date | 日期 |
| `order_number` | smallint (1-300) | 單號，畫面上會補零顯示成 0001-0300 |
| `status` | text | `shipped`(出貨單) / `returned`(已回單) / `unreturned`(未回單) |
| `driver_name` | text | 司機姓名（出貨單/未回單狀態下可填寫） |
| `out_of_county` | boolean | 是否外縣市 |
| `order_price` | numeric | 填單價 |
| `cash_sale_price` | numeric | 當日現銷價錢 |
| `invoice_price` | numeric | 有開發票的價錢（沒開發票就留空） |
| `unreturned_date` | date | 標記「未回單」當下自動記錄的日期 |
| `created_at` / `updated_at` | timestamptz | 自動填寫 |

## 3. 網站功能對照需求

- **出貨單**：可填司機姓名、外縣市、填單價、當日現銷價錢、發票金額
- **已回單**：唯讀顯示司機姓名、是否外縣市（資料承接自出貨單）
- **未回單**：可備注司機姓名，切到這個狀態時自動填上今天日期（`unreturned_date`）

畫面上方可依日期查詢、依狀態（全部/出貨單/已回單/未回單）篩選，點一列資料即可編輯。

## 4. Google Sheet 同步（Apps Script）

程式在 [`google-apps-script/sync-orders.gs`](./google-apps-script/sync-orders.gs)。
它會呼叫 Supabase REST API 把 `JHDN_orders` 整批讀出來，寫進 Google Sheet 專用的
分頁（預設分頁名稱 `Supabase同步(勿手動編輯)`，每次執行整批覆寫，不要在這個分頁
手動輸入資料）。你自己的「出貨單」「Data」分頁不受影響。

寫入的欄位順序：

| 欄 | 欄位名稱 | 對應資料 |
|---|---|---|
| A | 日期 | order_date |
| B | 單號 | order_number（補零成 0001-0300） |
| C | 狀態 | 出貨單 / 已回單 / 未回單 |
| D | 司機姓名 | driver_name |
| E | 外縣市 | 是 / 否 |
| F | 填單價 | order_price |
| G | 當日現銷價錢 | cash_sale_price |
| H | 發票金額 | invoice_price |
| I | 未回單日期 | unreturned_date |
| J | 建立時間 | created_at |
| K | 更新時間 | updated_at |

設定步驟：

1. Google Sheet -> 擴充功能 -> Apps Script，把 `sync-orders.gs` 整份貼進去
2. 左側「專案設定」(齒輪) -> 指令碼屬性，新增：
   - `SUPABASE_URL` = `https://duypvottqpjsmvlclyit.supabase.co`
   - `SUPABASE_ANON_KEY` = 你的 anon public key
   - `SHEET_NAME`（選填，不填就用預設分頁名稱）
3. 執行一次 `syncFromSupabase`，同意授權視窗
4. 左側「觸發條件」(時鐘) -> 新增觸發條件 -> 選 `syncFromSupabase` -> 時間驅動 ->
   選你要的頻率（例如每 15 分鐘、每小時）
5. 之後也能從 Sheet 選單「JHDN 同步」->「立即同步」手動跑一次

之後如果要多加欄位，跟我說一聲，我會同時更新 Supabase 資料表、網站表單、跟這個
Apps Script 的欄位對照表。

## 5. 部署

站台建議用 Vercel：把這個 repo import 進 Vercel，環境變數設定
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`，即可部署。
