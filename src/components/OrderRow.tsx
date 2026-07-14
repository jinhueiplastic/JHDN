"use client";

import { useState } from "react";
import {
  formatOrderCode,
  Order,
  ORDER_STATUS_LABEL,
  ORDER_STATUSES,
  OrderInput,
  OrderStatus,
} from "@/types/order";
import { Driver } from "@/types/driver";

interface Props {
  order: Order;
  drivers: Driver[];
  onUpdate: (order: Order, patch: Partial<OrderInput>) => Promise<void>;
  onDelete: (order: Order) => void;
}

// Local text-input state only ever changes via this row's own typing/commit
// (each field commits independently to the row's own `order`), so it never
// needs to resync from the `order` prop after the initial mount.
export default function OrderRow({ order, drivers, onUpdate, onDelete }: Props) {
  const [orderPrice, setOrderPrice] = useState(order.order_price?.toString() ?? "");
  const [cashSalePrice, setCashSalePrice] = useState(order.cash_sale_price?.toString() ?? "");
  const [invoicePrice, setInvoicePrice] = useState(order.invoice_price?.toString() ?? "");

  const isShipped = order.status === "shipped";
  const isReturned = order.status === "returned";
  const isUnreturned = order.status === "unreturned";

  function commitNumber(
    field: "order_price" | "cash_sale_price" | "invoice_price",
    raw: string
  ) {
    const parsed = raw === "" ? null : Number(raw);
    if (parsed === order[field]) return;
    void onUpdate(order, { [field]: parsed });
  }

  return (
    <tr className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
        {formatOrderCode(order.order_date, order.order_number)}
      </td>

      <td className="px-2 py-2">
        <select
          value={order.status}
          onChange={(e) => void onUpdate(order, { status: e.target.value as OrderStatus })}
          className="input py-1 text-sm"
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>

      <td className="px-2 py-2">
        <select
          value={order.driver_name ?? ""}
          disabled={isReturned}
          onChange={(e) => void onUpdate(order, { driver_name: e.target.value || null })}
          className="input py-1 text-sm disabled:bg-neutral-100 disabled:text-neutral-400"
        >
          <option value="">(未選擇)</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </td>

      <td className="px-2 py-2 text-center">
        {isUnreturned ? (
          <span className="text-neutral-400">-</span>
        ) : (
          <input
            type="checkbox"
            checked={order.out_of_county}
            disabled={isReturned}
            onChange={(e) => void onUpdate(order, { out_of_county: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300"
          />
        )}
      </td>

      <td className="px-2 py-2">
        {isShipped ? (
          <input
            type="number"
            step="0.01"
            value={orderPrice}
            onChange={(e) => setOrderPrice(e.target.value)}
            onBlur={(e) => commitNumber("order_price", e.target.value)}
            className="input w-24 py-1 text-sm"
          />
        ) : (
          order.order_price ?? "-"
        )}
      </td>

      <td className="px-2 py-2">
        {isShipped ? (
          <input
            type="number"
            step="0.01"
            value={cashSalePrice}
            onChange={(e) => setCashSalePrice(e.target.value)}
            onBlur={(e) => commitNumber("cash_sale_price", e.target.value)}
            className="input w-24 py-1 text-sm"
          />
        ) : (
          order.cash_sale_price ?? "-"
        )}
      </td>

      <td className="px-2 py-2">
        {isShipped ? (
          <input
            type="number"
            step="0.01"
            value={invoicePrice}
            onChange={(e) => setInvoicePrice(e.target.value)}
            onBlur={(e) => commitNumber("invoice_price", e.target.value)}
            className="input w-24 py-1 text-sm"
          />
        ) : (
          order.invoice_price ?? "-"
        )}
      </td>

      <td className="px-3 py-2">{order.unreturned_date ?? "-"}</td>

      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => onDelete(order)}
          className="text-xs text-red-600 hover:underline"
        >
          刪除
        </button>
      </td>
    </tr>
  );
}
