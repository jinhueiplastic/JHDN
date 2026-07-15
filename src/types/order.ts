export type OrderStatus = "returned" | "unreturned";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  returned: "已回單",
  unreturned: "未回單",
};

export const ORDER_STATUSES: OrderStatus[] = ["unreturned", "returned"];

export interface Order {
  id: string;
  order_date: string; // YYYY-MM-DD
  order_number: number; // 1-300, display zero-padded
  status: OrderStatus | null; // null = 新進來還沒設定狀態

  driver_name: string | null;
  out_of_county: boolean;
  order_price: number | null;
  cash_sale_price: number | null;
  invoice_price: number | null;
  shipped_date: string | null; // 實際出貨日

  unreturned_date: string | null;

  created_at: string;
  updated_at: string;
}

export type OrderInput = Pick<
  Order,
  | "order_date"
  | "order_number"
  | "status"
  | "driver_name"
  | "out_of_county"
  | "order_price"
  | "cash_sale_price"
  | "invoice_price"
  | "shipped_date"
  | "unreturned_date"
>;

export function formatOrderNumber(n: number): string {
  return String(n).padStart(4, "0");
}

/** 民國年 MMDD，例如 2026-07-14 -> "1150714" */
export function formatMinguoDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const minguoYear = y - 1911;
  return `${minguoYear}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

/** 完整單號代碼，例如 "11507140001" */
export function formatOrderCode(dateStr: string, orderNumber: number): string {
  return `${formatMinguoDate(dateStr)}${formatOrderNumber(orderNumber)}`;
}

function parseMinguoDatePrefix(digits: string): string | null {
  const minguoYear = parseInt(digits.slice(0, 3), 10);
  const month = digits.slice(3, 5);
  const day = digits.slice(5, 7);
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
  return `${minguoYear + 1911}-${month}-${day}`;
}

/**
 * 解析完整單號代碼（例如 "11507140001"）回日期 + 單號。
 * 格式固定為 3 位民國年 + 2 位月 + 2 位日 + 4 位單號，共 11 碼。
 */
export function parseOrderCode(
  code: string
): { order_date: string; order_number: number } | null {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 11) return null;

  const order_date = parseMinguoDatePrefix(digits);
  if (!order_date) return null;

  return { order_date, order_number: parseInt(digits.slice(7, 11), 10) };
}

/**
 * 查詢輸入可以是完整 11 碼單號（找單筆），也可以只打 7 碼日期
 * （民國年月日，例如 "1150714"，找當天全部單號）。
 */
export function parseOrderQuery(
  input: string
): { type: "order"; order_date: string; order_number: number } | { type: "date"; order_date: string } | null {
  const digits = input.replace(/\D/g, "");

  if (digits.length === 11) {
    const parsed = parseOrderCode(digits);
    return parsed ? { type: "order", ...parsed } : null;
  }

  if (digits.length === 7) {
    const order_date = parseMinguoDatePrefix(digits);
    return order_date ? { type: "date", order_date } : null;
  }

  return null;
}
