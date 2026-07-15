"use client";

import { useState } from "react";
import { formatOrderNumber, Order, OrderInput, OrderStatus } from "@/types/order";
import { Driver } from "@/types/driver";
import StatusBadge from "@/components/StatusBadge";

type PriceField = "order_price" | "cash_sale_price" | "invoice_price";
type FieldOption = PriceField | "shipped_date";

const PRICE_LABELS: Record<PriceField, string> = {
  order_price: "填單價",
  cash_sale_price: "現銷價",
  invoice_price: "發票金額",
};

const CELL = "border-b border-neutral-100 px-2 py-2";

function currentFieldOption(order: Order): FieldOption | "" {
  if (order.order_price != null) return "order_price";
  if (order.cash_sale_price != null) return "cash_sale_price";
  if (order.invoice_price != null) return "invoice_price";
  if (order.shipped_date != null) return "shipped_date";
  return "";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  order: Order;
  drivers: Driver[];
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onUpdate: (order: Order, patch: Partial<OrderInput>) => Promise<void>;
  onFilterJump: (status: OrderStatus) => void;
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
  onFilterJump,
  onDelete,
}: Props) {
  const [fieldOption, setFieldOption] = useState<FieldOption | "">(currentFieldOption(order));
  const [priceValue, setPriceValue] = useState(
    fieldOption && fieldOption !== "shipped_date" ? (order[fieldOption]?.toString() ?? "") : ""
  );
  const [shippedDate, setShippedDate] = useState(order.shipped_date ?? "");
  const [editingDriver, setEditingDriver] = useState(false);
  const [pendingDriver, setPendingDriver] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);

  const isReturned = order.status === "returned";
  const isUnreturned = order.status === "unreturned";
  const displayedDriver = pendingDriver ?? order.driver_name;

  async function handleDriverSelect(name: string) {
    if (isUnreturned) {
      // Picking a driver on a 未回單 row is how staff confirms the slip
      // came back, so it doubles as the unreturned -> 已回單 transition.
      // Show the pill as selected for a beat before the row flips away so
      // it's clear which driver was picked.
      setPendingDriver(name);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await onUpdate(order, { driver_name: name, status: "returned" });
      setPendingDriver(null);
      onFilterJump("returned");
      return;
    }

    // Already 已回單: only reachable once "編輯" was clicked, and still
    // needs an explicit confirm since this corrects a settled record.
    if (!confirm(`確定要把司機改成「${name}」嗎？`)) return;
    await onUpdate(order, { driver_name: name });
    setEditingDriver(false);
  }

  async function handlePromote() {
    // Same one-beat pause as the driver-pick transition, so the row's new
    // badge is visible for a moment before it jumps away to the 未回單 tab.
    setPromoting(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await onUpdate(order, { status: "unreturned" });
    setPromoting(false);
    onFilterJump("unreturned");
  }

  function handleFieldOptionChange(next: string) {
    const nextOption = next as FieldOption | "";
    setFieldOption(nextOption);

    if (nextOption === "shipped_date") {
      // Picking 實際出貨日 defaults it to today right away (still editable).
      const value = order.shipped_date || todayStr();
      setShippedDate(value);
      if (!order.shipped_date) void onUpdate(order, { shipped_date: value });
    } else {
      setPriceValue(nextOption ? (order[nextOption]?.toString() ?? "") : "");
    }
  }

  function commitPriceValue(raw: string) {
    if (!fieldOption || fieldOption === "shipped_date") return;
    const parsed = raw === "" ? null : Number(raw);
    void onUpdate(order, {
      order_price: fieldOption === "order_price" ? parsed : null,
      cash_sale_price: fieldOption === "cash_sale_price" ? parsed : null,
      invoice_price: fieldOption === "invoice_price" ? parsed : null,
    });
  }

  function commitShippedDate(value: string) {
    setShippedDate(value);
    void onUpdate(order, { shipped_date: value || null });
  }

  const priceSummary = [
    order.order_price != null && `填單價 ${order.order_price}`,
    order.cash_sale_price != null && `現銷價 ${order.cash_sale_price}`,
    order.invoice_price != null && `發票 ${order.invoice_price}`,
    order.shipped_date != null && `出貨日 ${order.shipped_date}`,
  ].filter(Boolean);

  return (
    <>
      <div className={CELL}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(order.id)}
          className="h-4 w-4 rounded border-neutral-300"
        />
      </div>

      <div className={`${CELL} whitespace-nowrap font-mono text-lg font-semibold`}>
        {formatOrderNumber(order.order_number)}
      </div>

      <div className={CELL}>
        {order.status === null ? (
          <button
            type="button"
            disabled={promoting}
            onClick={() => void handlePromote()}
            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60"
          >
            未回單
          </button>
        ) : (
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
        )}
      </div>

      <div className={`${CELL} text-center`}>
        <input
          type="checkbox"
          checked={order.out_of_county}
          disabled={!isUnreturned}
          onChange={(e) => void onUpdate(order, { out_of_county: e.target.checked })}
          className="h-4 w-4 rounded border-neutral-300"
        />
      </div>

      <div className={CELL}>
        <div className="flex max-w-[280px] flex-wrap gap-2">
          {drivers.map((d) => (
            <button
              type="button"
              key={d.id}
              disabled={(!isUnreturned && !editingDriver) || pendingDriver !== null}
              onClick={() => void handleDriverSelect(d.name)}
              className={`rounded-full border px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                displayedDriver === d.name
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
      </div>

      <div className={CELL}>
        {isUnreturned ? (
          <div className="flex items-center gap-1">
            <select
              value={fieldOption}
              onChange={(e) => handleFieldOptionChange(e.target.value)}
              className="input py-1 text-sm"
            >
              <option value="">(未選擇)</option>
              <option value="order_price">填單價</option>
              <option value="cash_sale_price">現銷價</option>
              <option value="invoice_price">發票金額</option>
              <option value="shipped_date">實際出貨日</option>
            </select>
            {fieldOption === "shipped_date" ? (
              <input
                type="date"
                value={shippedDate}
                onChange={(e) => commitShippedDate(e.target.value)}
                className="input w-32 py-1 text-sm"
              />
            ) : (
              fieldOption && (
                <input
                  type="number"
                  step="0.01"
                  value={priceValue}
                  onChange={(e) => setPriceValue(e.target.value)}
                  onBlur={(e) => commitPriceValue(e.target.value)}
                  placeholder={PRICE_LABELS[fieldOption]}
                  className="input w-20 py-1 text-sm"
                />
              )
            )}
          </div>
        ) : (
          <span className="text-neutral-500">
            {priceSummary.length > 0 ? priceSummary.join("、") : "-"}
          </span>
        )}
      </div>

      <div className={CELL}>{order.unreturned_date ?? "-"}</div>

      <div className={CELL}>
        {isReturned ? (
          <button
            type="button"
            onClick={() => setEditingDriver((v) => !v)}
            className="text-xs text-neutral-500 hover:underline"
          >
            {editingDriver ? "取消編輯" : "編輯"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onDelete(order)}
            className="text-xs text-red-600 hover:underline"
          >
            刪除
          </button>
        )}
      </div>
    </>
  );
}
