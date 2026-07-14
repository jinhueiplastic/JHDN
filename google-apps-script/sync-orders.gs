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
 * 5. 到 Supabase SQL Editor 執行 supabase/migrations/0005_orders_webhook_trigger.sql
 *    （把裡面的網址、token 換成你自己的），存檔後，之後在網站上新增/修改/刪除
 *    單號，幾秒內就會反映到 Sheet。
 * 6. 之後也可以隨時從 Sheet 選單「JHDN 同步」->「立即同步」手動整批重跑一次。
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

/** Supabase Database Webhook (或 SQL 觸發器) 打進來的即時同步入口 */
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
    const old = payload.old_record;
    const code = old ? formatOrderCode(old.order_date, old.order_number) : null;
    const rowIndex = code ? findRowByCode(sheet, code) : -1;
    if (rowIndex > 0) sheet.deleteRow(rowIndex);
  } else {
    const order = payload.record;
    const code = formatOrderCode(order.order_date, order.order_number);
    const rowIndex = findRowByCode(sheet, code);
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
  // Always re-stamp the header row so it can never drift out of sync with
  // HEADERS (e.g. after adding/reordering a column in this script) — this
  // only touches row 1, never the data rows below it.
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  return sheet;
}

/** 用「單號」欄（民國年月日+序號的完整代碼）找出這是哪一列，天生不會重複 */
function findRowByCode(sheet, code) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const codes = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let i = 0; i < codes.length; i++) {
    if (String(codes[i][0]) === code) return i + 2; // +2: 1-indexed, plus header row
  }
  return -1;
}

function orderToRow(o) {
  return [
    o.order_date,
    formatOrderCode(o.order_date, o.order_number),
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

/** 完整單號代碼，例如 "11507140001"（民國年 + 月 + 日 + 4 位序號），跟網站上顯示的一致 */
function formatOrderCode(dateStr, orderNumber) {
  const parts = dateStr.split("-");
  const minguoYear = parseInt(parts[0], 10) - 1911;
  return `${minguoYear}${parts[1]}${parts[2]}${formatOrderNumber(orderNumber)}`;
}
