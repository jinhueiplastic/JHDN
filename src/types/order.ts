export type OrderStatus = "shipped" | "returned" | "unreturned";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  shipped: "出貨單",
  returned: "已回單",
  unreturned: "未回單",
};

export const ORDER_STATUSES: OrderStatus[] = ["shipped", "returned", "unreturned"];

export interface Order {
  id: string;
  order_date: string; // YYYY-MM-DD
  order_number: number; // 1-300, display zero-padded
  status: OrderStatus;

  driver_name: string | null;
  out_of_county: boolean;
  order_price: number | null;
  cash_sale_price: number | null;
  invoice_price: number | null;

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
  | "unreturned_date"
>;

export function formatOrderNumber(n: number): string {
  return String(n).padStart(4, "0");
}
