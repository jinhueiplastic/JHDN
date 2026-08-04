/**
 * JHDN 出貨單管理 -- Supabase -> Google Sheet 同步腳本
 *
 * 用途：把 Supabase 的 "JHDN_orders" 資料表同步到這份 Google Sheet 當報表/備份，
 * 同時把每一筆異動都額外記錄成一份「只增不減」的歷史紀錄，方便事後追查某張訂單
 * 到底何時被改成什麼樣子（例如發現資料被誤按「設為原始狀態」清空時，可以回頭查
 * 這份紀錄）。資料的來源永遠是網站 -> Supabase，這個腳本只負責「讀取後寫入
 * Sheet」，不會反過來把 Sheet 的修改寫回 Supabase。
 *
 * ===== 運作方式 =====
 *
 * 網站每次寫入 Supabase，資料庫觸發器只會把這筆異動快速記錄進一個佇列表
 * (`JHDN_sync_queue`)，不會直接呼叫 Google。這個腳本設定一個「每分鐘」的時間
 * 觸發條件執行 drainSyncQueue()，依序、一列一列（中間有間隔）把佇列清空，每一筆
 * 異動會做兩件事：(1) 更新「現況」分頁（`Supabase同步(勿手動編輯)`）裡對應那張
 * 訂單的那一列，永遠只保留最新樣子；(2) 在「異動紀錄」分頁
 * （`異動紀錄(勿手動編輯)`）多新增一列，記錄這次異動的時間、類型（新增/更新/
 * 刪除）跟當下完整的欄位內容，這份紀錄永遠只會增加，不會被覆蓋或刪除，就算現況
 * 分頁的資料被清空、改錯，也能從這份紀錄查回歷史。這樣不管一次改幾百筆（例如
 * 選一個新日期自動建立 200 個單號），也不會因為同時湧入太多請求把 Google Apps
 * Script 塞爆、造成資料遺漏或順序錯亂——全程自動，不需要手動點「立即同步」。
 *
 * 一般情況下，新資料大約 1 分鐘內就會出現在 Sheet 上；一次異動很多筆時，
 * 全部同步完可能要多等幾分鐘（處理速度大約每秒 3-4 筆）。
 *
 * ===== 設定步驟 =====
 *
 * 1. 開啟你的 Google Sheet -> 擴充功能 -> Apps Script，把這個檔案的內容整份貼進去。
 * 2. 左側「專案設定」(齒輪圖示) -> 指令碼屬性 (Script Properties)，新增：
 *      SUPABASE_URL       = https://xxxx.supabase.co
 *      SUPABASE_ANON_KEY  = (你的 anon public key)
 *      SHEET_NAME         = (選填) 現況分頁名稱，不設定的話腳本會自動建立/
 *                           使用「Supabase同步(勿手動編輯)」分頁。
 *      LOG_SHEET_NAME     = (選填) 異動紀錄分頁名稱，不設定的話腳本會自動建立/
 *                           使用「異動紀錄(勿手動編輯)」分頁。
 *                           如果你已經有「出貨單」「Data」等手動操作的分頁，
 *                           不要把上面兩個名稱設成那些名字，避免被覆寫。
 * 3. 執行一次 syncFromSupabase()，Google 會跳出授權視窗，同意即可（順便把
 *    現有資料整批同步一次到現況分頁——這一步不會寫進異動紀錄分頁，異動紀錄只
 *    記錄之後透過佇列處理的真實異動，避免每次手動整批同步都灌一堆重複紀錄）。
 * 4. 左側「觸發條件」(時鐘圖示) -> 新增觸發條件：
 *      選擇函式：drainSyncQueue
 *      事件來源：時間驅動 -> 分鐘計時器 -> 每分鐘
 * 5. 到 Supabase SQL Editor 執行 supabase/migrations/0005_orders_webhook_trigger.sql
 *    跟 supabase/migrations/0006_orders_sync_queue.sql（兩個都要，順序不能反）。
 * 6. 之後在網站上的異動都會自動進佇列，drainSyncQueue 每分鐘自動清空。也可以
 *    隨時從 Sheet 選單「JHDN 同步」->「立即同步」手動整批重跑一次（適合第一次
 *    建表、或想立刻整批對一次資料時用）。
 */

const STATUS_LABEL = {
  returned: "已回單",
  unreturned: "未回單",
  voided: "作廢",
};

const HEADERS = [
  "日期",
  "單號",
  "狀態",
  "司機姓名",
  "外縣市",
  "外縣市原因",
  "外縣市件數",
  "外縣市運費",
  "填單價",
  "當日現銷價錢",
  "發票金額",
  "未回單日期",
  "作廢原因",
  "建立時間",
  "更新時間",
];

const CHANGE_TYPE_LABEL = {
  INSERT: "新增",
  UPDATE: "更新",
  DELETE: "刪除",
};

// 這個分頁是「只增不減」的異動紀錄：每一次網站上的新增/修改/作廢，都會在這裡
// 多一列，不會覆蓋舊的紀錄，方便事後追查「這筆訂單到底什麼時候被改成什麼樣子」。
// 跟上面 HEADERS 對應的「現況」分頁不一樣，那個分頁永遠只保留每張訂單最新的樣子。
const LOG_HEADERS = ["記錄時間", "異動類型", ...HEADERS];

// 每處理一列的間隔，避免短時間內對 Sheets 送出太多寫入請求
const DRAIN_PACE_MS = 250;
// 單次執行的時間預算，接近這個時間就先結束，剩下的留給下一次（每分鐘）觸發
const DRAIN_TIME_BUDGET_MS = 4 * 60 * 1000;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("JHDN 同步")
    .addItem("立即同步", "syncFromSupabase")
    .addToUi();
}

/** 由時間觸發條件每分鐘呼叫一次：把 JHDN_sync_queue 依序清空、寫進 Sheet */
function drainSyncQueue() {
  const props = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty("SUPABASE_URL");
  const anonKey = props.getProperty("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    // 上一次的 drain 還在跑，這次先跳過，下一分鐘再繼續
    return;
  }

  try {
    const startedAt = Date.now();
    const sheet = getOrCreateSheet();
    const logSheet = getOrCreateLogSheet();

    while (Date.now() - startedAt < DRAIN_TIME_BUDGET_MS) {
      const queueItems = fetchQueueBatch(supabaseUrl, anonKey, 50);
      if (queueItems.length === 0) break;

      for (const item of queueItems) {
        applyQueueItem(sheet, item.payload);
        appendLogRow(logSheet, item.payload);
        deleteQueueItem(supabaseUrl, anonKey, item.id);
        Utilities.sleep(DRAIN_PACE_MS);

        if (Date.now() - startedAt >= DRAIN_TIME_BUDGET_MS) break;
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function fetchQueueBatch(supabaseUrl, anonKey, limit) {
  const url =
    `${supabaseUrl}/rest/v1/JHDN_sync_queue?select=id,payload&order=id.asc&limit=${limit}`;
  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() >= 300) {
    throw new Error(
      `讀取同步佇列失敗 (HTTP ${response.getResponseCode()}): ${response.getContentText()}`
    );
  }
  return JSON.parse(response.getContentText());
}

function deleteQueueItem(supabaseUrl, anonKey, id) {
  const url = `${supabaseUrl}/rest/v1/JHDN_sync_queue?id=eq.${id}`;
  UrlFetchApp.fetch(url, {
    method: "delete",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    muteHttpExceptions: true,
  });
}

function applyQueueItem(sheet, payload) {
  if (payload.type === "DELETE") {
    const old = payload.old_record;
    const code = old ? formatOrderCode(old.order_date, old.order_number) : null;
    const rowIndex = code ? findRowByCode(sheet, code) : -1;
    if (rowIndex > 0) sheet.deleteRow(rowIndex);
    return;
  }

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

/** 異動紀錄分頁：跟 getOrCreateSheet() 不一樣，這裡的資料只會用 appendRow 增加，
 *  drainSyncQueue() 以外的地方（例如 syncFromSupabase() 整批重跑）都不會動到它，
 *  避免每次手動「立即同步」都把整批現況重複灌進歷史紀錄裡。 */
function getOrCreateLogSheet() {
  const props = PropertiesService.getScriptProperties();
  const sheetName = props.getProperty("LOG_SHEET_NAME") || "異動紀錄(勿手動編輯)";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
  return sheet;
}

/** 把這次佇列項目的異動，多加一列進異動紀錄分頁（永遠是新增一列，不覆寫舊的） */
function appendLogRow(logSheet, payload) {
  const type = payload.type;
  const order = type === "DELETE" ? payload.old_record : payload.record;
  if (!order) return;

  const row = [
    new Date(),
    CHANGE_TYPE_LABEL[type] || type,
    ...orderToRow(order),
  ];
  logSheet.appendRow(row);
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
    o.out_of_county_reason || "",
    o.out_of_county_count ?? "",
    o.out_of_county_fee ?? "",
    o.order_price ?? "",
    o.cash_sale_price ?? "",
    o.invoice_price ?? "",
    o.unreturned_date || "",
    o.void_reason || "",
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
