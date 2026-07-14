/**
 * JHDN 出貨單管理 -- Supabase -> Google Sheet 同步腳本
 *
 * 用途：即時把 Supabase 的 "JHDN_orders" 資料表同步到這份 Google Sheet 當報表/備份。
 * 資料的來源永遠是網站 -> Supabase，這個腳本只負責「讀取後覆寫」，不會反過來把
 * Sheet 的修改寫回 Supabase。
 *
 * 這個檔案有兩種同步方式：
 *   1. 即時同步（推薦）：doPost() 接收 Supabase Database Webhook，網站每次寫入
 *      Supabase 後幾乎立刻反映到 Sheet，一筆一筆更新，不需要等時間排程。
 *   2. 手動全量同步：syncFromSupabase()，從 Sheet 選單「JHDN 同步」->「立即同步」
 *      手動整批重新拉一次，適合第一次建表後拿來對一次資料，或懷疑漏掉某幾筆時用。
 *
 * ===== 設定步驟 =====
 *
 * 1. 開啟你的 Google Sheet -> 擴充功能 -> Apps Script，把這個檔案的內容整份貼進去。
 * 2. 左側「專案設定」(齒輪圖示) -> 指令碼屬性 (Script Properties)，新增：
 *      SUPABASE_URL       = https://xxxx.supabase.co
 *      SUPABASE_ANON_KEY  = (你的 anon public key)
 *      SHEET_NAME         = (選填) 要寫入的分頁名稱，不設定的話腳本會
 *                           自動建立/使用「Supabase同步(勿手動編輯)」分頁。
 *                           如果你已經有「出貨單」「Data」等手動操作的分頁，
 *                           不要把 SHEET_NAME 設成那些名字，避免被整批覆寫。
 *      WEBHOOK_TOKEN      = 自己隨便設一組不容易猜到的字串（例如一串亂碼），
 *                           用來驗證是 Supabase 呼叫的，不是別人亂打進來的。
 * 3. 執行一次 syncFromSupabase()，Google 會跳出授權視窗，同意即可（這樣
 *    doPost 之後才有權限寫入試算表）。
 * 4. 部署成 Web App，讓 Supabase 可以呼叫到：
 *      左上角「部署」-> 新增部署作業 -> 類型選「網頁應用程式」
 *      -> 執行身分：我
 *      -> 具有存取權的使用者：任何人
 *      -> 部署，複製產生的網址（結尾是 /exec）
 * 5. 到 Supabase 專案 -> Database -> Webhooks -> Create a new hook：
 *      Table: JHDN_orders
 *      Events: 勾選 Insert、Update、Delete
 *      Type: HTTP Request，Method: POST
 *      URL: 貼上第 4 步的網址，後面加上 `?token=你在 WEBHOOK_TOKEN 設的字串`
 *      （例如 https://script.google.com/macros/s/xxxx/exec?token=abc123）
 *    存檔後，之後在網站上新增/修改/刪除單號，幾秒內就會反映到 Sheet。
 * 6. 之後也可以隨時從 Sheet 選單「JHDN 同步」->「立即同步」手動整批重跑一次。
 */

const STATUS_LABEL = {
  returned: "已回單",
  unreturned: "未回單",
};

// 第一欄放 Supabase 的 id，用來在即時同步時找到「這是哪一列」，
// 不要手動刪除或搬動這一欄。
const HEADERS = [
  "ID",
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

/** Supabase Database Webhook 打進來的即時同步入口 */
function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const expectedToken = props.getProperty("WEBHOOK_TOKEN");
  const givenToken = e.parameter.token;

  if (expectedToken && givenToken !== expectedToken) {
    return jsonResponse({ ok: false, error: "invalid token" });
  }

  const payload = JSON.parse(e.postData.contents);
  const sheet = getOrCreateSheet();

  if (payload.type === "DELETE") {
    const id = payload.old_record && payload.old_record.id;
    const rowIndex = id ? findRowById(sheet, id) : -1;
    if (rowIndex > 0) sheet.deleteRow(rowIndex);
  } else {
    const order = payload.record;
    const rowIndex = findRowById(sheet, order.id);
    const values = orderToRow(order);
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
  }

  return jsonResponse({ ok: true });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getOrCreateSheet() {
  const props = PropertiesService.getScriptProperties();
  // 這個分頁由腳本自動建立/整批覆寫，不要在這裡手動編輯資料——
  // 如果你已經有其他分頁（例如「出貨單」「Data」）要留給人工操作，
  // 保持這裡的預設值，讓腳本用自己專用的分頁，才不會互相覆蓋。
  const sheetName = props.getProperty("SHEET_NAME") || "Supabase同步(勿手動編輯)";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sheet;
}

function findRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2; // +2: 1-indexed, plus header row
  }
  return -1;
}

function orderToRow(o) {
  return [
    o.id,
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
  ];
}

/** 手動整批重新同步（選單「立即同步」或第一次建表後執行一次） */
function syncFromSupabase() {
  const props = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty("SUPABASE_URL");
  const anonKey = props.getProperty("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "請先在「指令碼屬性」設定 SUPABASE_URL 與 SUPABASE_ANON_KEY，參考檔案開頭的設定步驟。"
    );
  }

  const orders = fetchAllOrders(supabaseUrl, anonKey);
  const sheet = getOrCreateSheet();

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  if (orders.length > 0) {
    const rows = orders.map(orderToRow);
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }
  sheet.autoResizeColumns(1, HEADERS.length);
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

function formatOrderNumber(n) {
  return String(n).padStart(4, "0");
}
