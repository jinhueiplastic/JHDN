/**
 * JHDN 出貨單管理 -- Supabase -> Google Sheet 同步腳本
 *
 * 用途：把 Supabase 的 "JHDN_orders" 資料表整批讀出來，寫進這份 Google Sheet
 * 當作報表 / 備份。資料的來源永遠是網站 -> Supabase，這個腳本只負責「讀取後覆寫」，
 * 不會反過來把 Sheet 的修改寫回 Supabase。
 *
 * 設定步驟：
 * 1. 開啟你的 Google Sheet -> 擴充功能 -> Apps Script，把這個檔案的內容整份貼進去。
 * 2. 左側「專案設定」(齒輪圖示) -> 指令碼屬性 (Script Properties)，新增：
 *      SUPABASE_URL       = https://xxxx.supabase.co
 *      SUPABASE_ANON_KEY  = (你的 anon public key)
 *      SHEET_NAME         = (選填) 要寫入的分頁名稱，不設定的話腳本會
 *                           自動建立/使用「Supabase同步(勿手動編輯)」分頁。
 *                           如果你已經有「出貨單」「Data」等手動操作的分頁，
 *                           不要把 SHEET_NAME 設成那些名字，避免被整批覆寫。
 * 3. 執行一次 syncFromSupabase()，Google 會跳出授權視窗，同意即可。
 * 4. 左側「觸發條件」(時鐘圖示) -> 新增觸發條件 -> 選擇函式 syncFromSupabase
 *    -> 事件來源選「時間驅動」-> 依需求選「每 5 分鐘」或「每小時」等頻率。
 * 5. 之後也可以直接從 Sheet 選單「JHDN 同步」->「立即同步」手動跑一次。
 */

const STATUS_LABEL = {
  returned: "已回單",
  unreturned: "未回單",
};

const HEADERS = [
  "日期",
  "單號",
  "狀態",
  "司機姓名",
  "外縣市",
  "填單價",
  "當日現銷價錢",
  "發票金額",
  "未回單日期",
  "建立時間",
  "更新時間",
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("JHDN 同步")
    .addItem("立即同步", "syncFromSupabase")
    .addToUi();
}

function syncFromSupabase() {
  const props = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty("SUPABASE_URL");
  const anonKey = props.getProperty("SUPABASE_ANON_KEY");
  // 這個分頁由腳本自動建立/整批覆寫，不要在這裡手動編輯資料——
  // 如果你已經有其他分頁（例如「出貨單」「Data」）要留給人工操作，
  // 保持這裡的預設值，讓腳本用自己專用的分頁，才不會互相覆蓋。
  const sheetName = props.getProperty("SHEET_NAME") || "Supabase同步(勿手動編輯)";

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "請先在「指令碼屬性」設定 SUPABASE_URL 與 SUPABASE_ANON_KEY，參考檔案開頭的設定步驟。"
    );
  }

  const rows = fetchAllOrders(supabaseUrl, anonKey);
  writeToSheet(sheetName, rows);
}

/** 分頁抓取 JHDN_orders 全部資料，依日期、單號排序 */
function fetchAllOrders(supabaseUrl, anonKey) {
  const pageSize = 1000;
  let offset = 0;
  let all = [];

  while (true) {
    const url =
      `${supabaseUrl}/rest/v1/JHDN_orders` +
      `?select=*&order=order_date.asc,order_number.asc` +
      `&offset=${offset}&limit=${pageSize}`;

    const response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() >= 300) {
      throw new Error(
        `Supabase 讀取失敗 (HTTP ${response.getResponseCode()}): ${response.getContentText()}`
      );
    }

    const batch = JSON.parse(response.getContentText());
    all = all.concat(batch);

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

function writeToSheet(sheetName, orders) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  if (orders.length === 0) return;

  const rows = orders.map((o) => [
    o.order_date,
    formatOrderNumber(o.order_number),
    STATUS_LABEL[o.status] || o.status,
    o.driver_name || "",
    o.out_of_county ? "是" : "否",
    o.order_price ?? "",
    o.cash_sale_price ?? "",
    o.invoice_price ?? "",
    o.unreturned_date || "",
    o.created_at,
    o.updated_at,
  ]);

  sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  sheet.autoResizeColumns(1, HEADERS.length);
}

function formatOrderNumber(n) {
  return String(n).padStart(4, "0");
}
