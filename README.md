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
2. 依序貼上並執行下面這些檔案的完整內容：
   - [`supabase/migrations/0001_init_orders.sql`](./supabase/migrations/0001_init_orders.sql)（訂單主表）
   - [`supabase/migrations/0002_drivers.sql`](./supabase/migrations/0002_drivers.sql)（司機名單，網站上用點選的司機清單就是存在這張表）
   - [`supabase/migrations/0003_drop_shipped_status.sql`](./supabase/migrations/0003_drop_shipped_status.sql)（把狀態簡化成只剩未回單/已回單兩種）
   - [`supabase/migrations/0004_backfill_missing_status.sql`](./supabase/migrations/0004_backfill_missing_status.sql)（把現有資料裡沒有正確狀態的舊資料都補成未回單）
   - [`supabase/migrations/0005_orders_webhook_trigger.sql`](./supabase/migrations/0005_orders_webhook_trigger.sql)（建立資料異動觸發器）
   - [`supabase/migrations/0006_orders_sync_queue.sql`](./supabase/migrations/0006_orders_sync_queue.sql)（把觸發器改成寫入同步佇列，見下面第 4 節）
   - [`supabase/migrations/0007_daily_order_provisioning.sql`](./supabase/migrations/0007_daily_order_provisioning.sql)（每天凌晨 00:01 台北時間自動建立當天的單號，見下面第 3 節）
   - [`supabase/migrations/0008_raise_order_number_limit.sql`](./supabase/migrations/0008_raise_order_number_limit.sql)（單號上限從 300 提高到 9999，給批次新增超過每日預設量用）
   - [`supabase/migrations/0009_shipped_date.sql`](./supabase/migrations/0009_shipped_date.sql)（新增「實際出貨日」欄位）
   - [`supabase/migrations/0010_status_defaults_to_none.sql`](./supabase/migrations/0010_status_defaults_to_none.sql)（新單號預設沒有狀態，見下面第 3 節）
   - [`supabase/migrations/0011_daily_order_count_200.sql`](./supabase/migrations/0011_daily_order_count_200.sql)（每天自動建立的單號數量從 300 改成 200）
   - [`supabase/migrations/0012_void_orders.sql`](./supabase/migrations/0012_void_orders.sql)（新增「作廢」狀態跟作廢原因欄位，取代原本的刪除功能）
   - [`supabase/migrations/0013_skip_sunday_provisioning.sql`](./supabase/migrations/0013_skip_sunday_provisioning.sql)（星期天不自動建立單號）
   - [`supabase/migrations/0014_out_of_county_count.sql`](./supabase/migrations/0014_out_of_county_count.sql)（新增「外縣市件數」欄位）
   - [`supabase/migrations/0015_out_of_county_reason.sql`](./supabase/migrations/0015_out_of_county_reason.sql)（新增「外縣市原因」欄位）
   - [`supabase/migrations/0016_price_field_option.sql`](./supabase/migrations/0016_price_field_option.sql)（記錄「價格」下拉選單實際選了哪個選項，跟有沒有填數字分開記錄）
   - [`supabase/migrations/0017_out_of_county_fee.sql`](./supabase/migrations/0017_out_of_county_fee.sql)（新增「外縣市運費」欄位）
3. 每個都依序 Run 一次即可（之後改版只要新增新的 migration 檔案，重新貼上執行）

資料表 `JHDN_orders` 結構（一列 = 一個日期 + 一個單號）：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `order_date` | date | 日期 |
| `order_number` | smallint (1-9999) | 單號，畫面上會補零顯示成 0001-9999 |
| `status` | text，可為 null | null(新單號預設，沒有狀態) / `unreturned`(未回單) / `returned`(已回單) / `voided`(作廢) |
| `driver_name` | text | 司機姓名 |
| `out_of_county` | boolean | 是否外縣市 |
| `out_of_county_reason` | text | 外縣市原因，勾選「外縣市」後可以額外填寫 |
| `out_of_county_count` | integer | 外縣市件數，勾選「外縣市」後可以額外填寫 |
| `out_of_county_fee` | numeric | 外縣市運費，可以之後才補填 |
| `price_field_option` | text | 「價格」下拉選單實際選的是哪一個（填單價/現銷價/發票金額/實際出貨日），跟底下對應的值有沒有真的填數字是分開記錄的 |
| `order_price` | numeric | 填單價（跟現銷價、發票金額三選一） |
| `cash_sale_price` | numeric | 當日現銷價錢 |
| `invoice_price` | numeric | 有開發票的價錢 |
| `shipped_date` | date | 實際出貨日，「價格」欄的下拉選單第 4 個選項，選了自動填今天，之後可自行更改 |
| `unreturned_date` | date | 標記未回單/確認已回單當下自動記錄的日期 |
| `void_reason` | text | 作廢原因，按「作廢」按鈕時填寫 |
| `created_at` / `updated_at` | timestamptz | 自動填寫 |

## 3. 網站功能對照需求

「外縣市」勾選、「價格」下拉選單（填單價/現銷價/發票金額/實際出貨日，四選一，選實際
出貨日會跳出日期，預設今天，可自行更改）這兩欄在未處理、未回單、已回單三個分頁都可以
直接編輯，不會因為狀態不同被鎖住。「已回單日期」欄位（未回單分頁顯示「未回單日期」）
現在每一列都可以直接手動改日期。

勾選「外縣市」後下面會多出「原因:」「件數:」「運費:」三個輸入框跟一個「儲存」按鈕，
填完要按「儲存」才會真的寫入（不會像其他欄位打完字、點掉就自動存檔），取消勾選
外縣市時三個欄位會自動清空；三個輸入框按 Enter 會依序跳到下一個（原因→件數→
運費），在「運費」按 Enter 等於直接按「儲存」。運費常常要晚一點才知道金額，
沒有的話可以先不填、之後再補上。

- **（新單號預設）沒有狀態**：只在「未處理」分頁看得到，狀態欄是空的。點選司機姓名，
  （等 1 秒後）會直接轉成已回單；如果還不知道司機是誰、只想先標記還沒回單，可以按
  司機姓名選擇區下方的「未回單」按鈕（一樣等 1 秒後才轉成未回單狀態）。不管走哪一條，
  都只是那一列自己從「未處理」消失、換去符合它新狀態的分頁，畫面本身還是留在
  「未處理」，不會自動跳頁
- **未回單**：點選司機姓名（等 1 秒後）會自動轉成已回單，一樣是那一列自己換分頁，
  畫面留在「未回單」；轉成未回單當下自動記錄 `unreturned_date`
- **已回單**：司機姓名預設鎖住，要先按「編輯」才能改，選了會跳出確認視窗（避免不小心
  點錯已經確認過的紀錄）；如果點錯狀態可以用「改回未回單」修正（一樣要等 1 秒才會
  真的轉換、跳走）；`unreturned_date` 這欄位在已回單頁面會改標示成「已回單日期」，
  記錄確認回單的日期；已回單狀態下修改「價格」欄不會像其他狀態一樣馬上自動存檔，
  要另外按「儲存」才會真的寫入，避免手滑改到已經確認過的金額

沒有真正的「刪除」功能了，只有「未處理」分頁的每一列有「作廢」按鈕（取代原本的
刪除），按下會跳出選原因的視窗：重複/打錯了/客人取消（三個都可以選填備註，例如
重複可以填對應的單號）、其他（一定要填）。確認後這筆會轉成「作廢」狀態，出現在
新增的「作廢」分頁，資料還是保留在資料庫、可以查到原因；如果作廢錯了，「作廢」
分頁裡每一列有「恢復」可以改回「未處理」。未回單、已回單分頁都不會出現任何
刪除/作廢按鈕。

全選訂單後，批次操作列有「設為原始狀態」，會把選取的訂單狀態、司機、外縣市、三種
價格、實際出貨日、未回單日期、作廢原因全部清空，等於變回剛新增時的樣子，重新出現
在「未處理」。

畫面上方可依日期查詢、依狀態篩選，分頁順序是：未處理/未回單/已回單/作廢/填單價/全部/
填運費，預設打開「未處理」。「填單價」是價格下拉選單選了「填單價」、但還沒有實際填
數字的訂單（選了現銷價或發票金額的不會算在這裡，要選過填單價才算）；「全部」是不分
狀態的完整清單；「填運費」是勾選外縣市、但運費還沒填的訂單。每一列直接在表格上編輯，
不需要另外開視窗。

篩選分頁旁邊有「跳到單號」輸入框，輸入單號（例如 116）按「跳到」，畫面會捲動到那一
列並短暫用琥珀色框線標記出來——這只是在目前分頁畫面上捲動定位，不會篩選/隱藏其他
列；如果要跳去的單號不在目前分頁的篩選範圍內會找不到，可以先切到「全部」再跳。

重新整理網頁會記住重新整理前的日期、篩選分頁，還有大概捲動到的那一列（例如原本
在看 0119 號附近，重新整理後會自動捲回附近），不用每次重新整理都要重新選日期、
重新切分頁、重新往下捲。這是存在瀏覽器的 localStorage，只在同一台電腦/瀏覽器上
有效，換一台電腦看不會記得。

頁面最下方有「+ 批次新增單號」，平常用不到（每天會自動建好 0001-0200，星期天除外），
只有某一天需要超過 200 號時才用這個手動補上去（可以填到 9999）。

當天的 200 個單號不用等有人打開網站才建立——Supabase 有一個排程（`pg_cron`），
每天台北時間 00:01 自動建立好（沒有狀態，跟手動建立的一樣，星期天不會建立），這樣
Google Sheet 那邊也有時間在大家開始上班前先同步完（見下面第 4 節同步佇列的說明）。
網站上原本「選到還沒建立過的日期就自動建立 200 筆」的邏輯還在，當備援用（例如排程
萬一沒跑成功），星期天一樣不會自動建立；如果星期天真的需要單號，可以用「+ 批次
新增單號」手動補。

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

選日期時如果選到還沒到的未來日期，不會自動建立那天的 200 個單號（只有今天或
過去的日期，或是每天 00:01 的排程，才會自動建立）；星期天則是不管哪種方式都
不會自動建立。

## 4. Google Sheet 同步（Apps Script，自動排隊處理）

程式在 [`google-apps-script/sync-orders.gs`](./google-apps-script/sync-orders.gs)。
網站每次寫入 Supabase，資料庫觸發器會把這筆異動記錄進一個佇列表
（`JHDN_sync_queue`），這一步很快，不會卡住網站。接著 Apps Script 設定一個
「每分鐘」自動執行的時間觸發條件，依序、一列一列把佇列清空、寫進 Google Sheet
專用的分頁（預設分頁名稱 `Supabase同步(勿手動編輯)`，不要在這個分頁手動輸入
資料）。你自己的「出貨單」「Data」分頁不受影響。

這樣設計是因為：如果每次異動都「立刻」直接呼叫 Google（例如選一個新日期一次
建立 200 個單號），會瞬間送出幾百個請求，Google Apps Script 處理不了這麼多
「同時」的請求，資料會遺漏、順序也會錯亂。改成排隊 + 每分鐘自動清空，不管一次
異動幾筆都不會出錯，也完全不需要手動點任何按鈕——一般情況下新資料大約 1 分鐘
內就會出現在 Sheet 上，一次異動很多筆的話，全部同步完可能要多等個幾分鐘。

寫入的欄位順序：

| 欄 | 欄位名稱 | 對應資料 |
|---|---|---|
| A | 日期 | order_date |
| B | 單號 | 完整代碼，例如 `11507140001`（跟網站上顯示的一致，也是即時同步比對是哪一列用的欄位，不要刪掉這欄） |
| C | 狀態 | 未回單 / 已回單 / 作廢 |
| D | 司機姓名 | driver_name |
| E | 外縣市 | 是 / 否 |
| F | 外縣市原因 | out_of_county_reason |
| G | 外縣市件數 | out_of_county_count |
| H | 外縣市運費 | out_of_county_fee |
| I | 填單價 | order_price |
| J | 當日現銷價錢 | cash_sale_price |
| K | 發票金額 | invoice_price |
| L | 未回單日期 | unreturned_date（未回單狀態顯示標記未回單的日期，已回單狀態顯示確認回單的日期） |
| M | 作廢原因 | void_reason |
| N | 建立時間 | created_at |
| O | 更新時間 | updated_at |

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
