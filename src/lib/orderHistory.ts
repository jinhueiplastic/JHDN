import { formatMinguoSlash, ORDER_STATUS_LABEL } from "@/types/order";

// Shared by the history popup on /daily and the admin /history page.

export const HISTORY_TABLE = "JHDN_order_history";

export interface HistoryEntry {
  id: number;
  order_id: string;
  order_date: string;
  order_number: number;
  changed_at: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  device: string | null;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
}

export const FIELD_LABEL: Record<string, string> = {
  status: "狀態",
  driver_name: "司機",
  out_of_county: "外縣市",
  out_of_county_reason: "外縣市原因",
  out_of_county_count: "外縣市件數",
  out_of_county_fee: "運費",
  price_field_option: "價格選項",
  order_price: "填單價",
  cash_sale_price: "現銷價",
  invoice_price: "發票金額",
  shipped_date: "出貨日",
  unreturned_date: "未回單/已回單日期",
  void_reason: "作廢原因",
};

const PRICE_OPTION_LABEL: Record<string, string> = {
  order_price: "填單價",
  cash_sale_price: "現銷價",
  invoice_price: "發票金額",
  shipped_date: "出貨日",
};

export function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "（空）";
  if (field === "status") return ORDER_STATUS_LABEL[value as keyof typeof ORDER_STATUS_LABEL] ?? String(value);
  if (field === "out_of_county") return value ? "是" : "否";
  if (field === "price_field_option") return PRICE_OPTION_LABEL[String(value)] ?? String(value);
  if (field.endsWith("_date") && typeof value === "string") return formatMinguoSlash(value);
  return String(value);
}

export function describe(entry: HistoryEntry): string[] {
  if (entry.op === "INSERT") return ["建立單號"];
  if (entry.op === "DELETE") return ["刪除單號"];
  const changes: string[] = [];
  for (const field of Object.keys(FIELD_LABEL)) {
    const before = entry.old_row?.[field] ?? null;
    const after = entry.new_row?.[field] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push(
        `${FIELD_LABEL[field]}：${formatValue(field, before)} → ${formatValue(field, after)}`
      );
    }
  }
  return changes.length > 0 ? changes : ["（其他欄位變更）"];
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const date = formatMinguoSlash(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  );
  const time = d.toLocaleTimeString("zh-TW", { hour12: false });
  return `${date} ${time}`;
}

// The fields that "設為原始狀態" clears. An update that empties all of them
// while some had a value is worth flagging.
const RESETTABLE = [
  "status",
  "driver_name",
  "out_of_county",
  "order_price",
  "cash_sale_price",
  "invoice_price",
  "unreturned_date",
];

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || v === false;
}

export function isResetEntry(entry: HistoryEntry): boolean {
  if (entry.op !== "UPDATE" || !entry.old_row || !entry.new_row) return false;
  const after = entry.new_row;
  const before = entry.old_row;
  return (
    RESETTABLE.every((f) => isEmpty(after[f])) && RESETTABLE.some((f) => !isEmpty(before[f]))
  );
}
