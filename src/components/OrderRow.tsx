"use client";

import { useState } from "react";
import { formatOrderNumber, Order, OrderInput } from "@/types/order";
import { Driver } from "@/types/driver";
import StatusBadge from "@/components/StatusBadge";

type PriceField = "order_price" | "cash_sale_price" | "invoice_price";

const PRICE_LABELS: Record<PriceField, string> = {
  order_price: "填單價",
  cash_sale_price: "現銷價",
  invoice_price: "發票金額",
};

function currentPriceType(order: Order): PriceField | "" {
  if (order.order_price != null) return "order_price";
  if (order.cash_sale_price != null) return "cash_sale_price";
  if (order.invoice_price != null) return "invoice_price";
  return "";
}

interface Props {
  order: Order;
  drivers: Driver[];
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onUpdate: (order: Order, patch: Partial<OrderInput>) => Promise<void>;
  onDelete: (order: Order) => void;
}

// Local text-input state only ever changes via this row's own typing/commit
// (each field commits independently to the row's own `order`), so it never
// needs to resync from the `order` prop after the initial mount.
export default function OrderRow({
  order,
  drivers,
  selected,
  onToggleSelect,
  onUpdate,
  onDelete,
}: Props) {
  const [priceType, setPriceType] = useState<PriceField | "">(currentPriceType(order));
  const [priceValue, setPriceValue] = useState(priceType ? (order[priceType]?.toString() ?? "") : "");
  const [editingDriver, setEditingDriver] = useState(false);

  const isReturned = order.status === "returned";
  const isUnreturned = order.status === "unreturned";

  async function handleDriverSelect(name: string) {
    if (isUnreturned) {
      // Picking a driver on a 未回單 row is how staff confirms the slip
      // came back, so it doubles as the unreturned -> 已回單 transition.
      await onUpdate(order, { driver_name: name, status: "returned" });
      return;
    }

    // Already 已回單: only reachable once "編輯" was clicked, and still
    // needs an explicit confirm since this corrects a settled record.
    if (!confirm(`確定要把司機改成「${name}」嗎？`)) return;
    await onUpdate(order, { driver_name: name });
    setEditingDriver(false);
  }

  function handlePriceTypeChange(next: string) {
    setPriceType(next as PriceField | "");
    setPriceValue("");
  }

  function commitPriceValue(raw: string) {
    if (!priceType) return;
    const parsed = raw === "" ? null : Number(raw);
    void onUpdate(order, {
      order_price: priceType === "order_price" ? parsed : null,
      cash_sale_price: priceType === "cash_sale_price" ? parsed : null,
      invoice_price: priceType === "invoice_price" ? parsed : null,
    });
  }

  const priceSummary = [
    order.order_price != null && `填單價 ${order.order_price}`,
    order.cash_sale_price != null && `現銷價 ${order.cash_sale_price}`,
    order.invoice_price != null && `發票 ${order.invoice_price}`,
  ].filter(Boolean);

  return (
    <tr className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(order.id)}
          className="h-4 w-4 rounded border-neutral-300"
        />
      </td>

      <td className="whitespace-nowrap px-3 py-2 font-mono text-lg font-semibold">
        {formatOrderNumber(order.order_number)}
      </td>

      <td className="px-2 py-2">
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={order.status} />
          {isReturned && (
            <button
              type="button"
              onClick={() => void onUpdate(order, { status: "unreturned" })}
              className="text-xs text-neutral-400 hover:underline"
            >
              改回未回單
            </button>
          )}
        </div>
      </td>

      <td className="px-2 py-2">
        <div className="flex flex-col items-start gap-1">
          <div className="flex max-w-[280px] flex-wrap gap-2">
            {drivers.map((d) => (
              <button
                type="button"
                key={d.id}
                disabled={isReturned && !editingDriver}
                onClick={() => void handleDriverSelect(d.name)}
                className={`rounded-full border px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                  order.driver_name === d.name
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {d.name}
              </button>
            ))}
            {drivers.length === 0 && (
              <span className="text-xs text-neutral-400">請先到下面新增司機</span>
            )}
          </div>
          {isReturned && !editingDriver && (
            <button
              type="button"
              onClick={() => setEditingDriver(true)}
              className="text-xs text-neutral-400 hover:underline"
            >
              編輯
            </button>
          )}
          {isReturned && editingDriver && (
            <button
              type="button"
              onClick={() => setEditingDriver(false)}
              className="text-xs text-neutral-400 hover:underline"
            >
              取消編輯
            </button>
          )}
        </div>
      </td>

      <td className="px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={order.out_of_county}
          disabled={isReturned}
          onChange={(e) => void onUpdate(order, { out_of_county: e.target.checked })}
          className="h-4 w-4 rounded border-neutral-300"
        />
      </td>

      <td className="px-2 py-2">
        {isUnreturned ? (
          <div className="flex items-center gap-1">
            <select
              value={priceType}
              onChange={(e) => handlePriceTypeChange(e.target.value)}
              className="input py-1 text-sm"
            >
              <option value="">(未選擇)</option>
              <option value="order_price">填單價</option>
              <option value="cash_sale_price">現銷價</option>
              <option value="invoice_price">發票金額</option>
            </select>
            {priceType && (
              <input
                type="number"
                step="0.01"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                onBlur={(e) => commitPriceValue(e.target.value)}
                placeholder={PRICE_LABELS[priceType]}
                className="input w-20 py-1 text-sm"
              />
            )}
          </div>
        ) : (
          <span className="text-neutral-500">
            {priceSummary.length > 0 ? priceSummary.join("、") : "-"}
          </span>
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
