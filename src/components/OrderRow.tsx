"use client";

import { useRef, useState } from "react";
import { formatOrderNumber, Order, OrderInput } from "@/types/order";
import { Driver } from "@/types/driver";
import StatusBadge from "@/components/StatusBadge";
import MinguoDateInput from "@/components/MinguoDateInput";
import VoidReasonModal from "@/components/VoidReasonModal";

type PriceField = "order_price" | "cash_sale_price" | "invoice_price";
type FieldOption = PriceField | "shipped_date";

const PRICE_LABELS: Record<PriceField, string> = {
  order_price: "填單價",
  cash_sale_price: "現銷價",
  invoice_price: "發票金額",
};

const CELL = "border-b border-neutral-100 px-2 py-2";

function isFieldOption(value: string | null): value is FieldOption {
  return (
    value === "order_price" ||
    value === "cash_sale_price" ||
    value === "invoice_price" ||
    value === "shipped_date"
  );
}

function currentFieldOption(order: Order): FieldOption | "" {
  // price_field_option is the source of truth (it survives even when no
  // value has been filled in yet); fall back to inferring from whichever
  // value is actually set, for rows saved before this column existed.
  if (isFieldOption(order.price_field_option)) return order.price_field_option;
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
}: Props) {
  const [fieldOption, setFieldOption] = useState<FieldOption | "">(currentFieldOption(order));
  const [priceValue, setPriceValue] = useState(
    fieldOption && fieldOption !== "shipped_date" ? (order[fieldOption]?.toString() ?? "") : ""
  );
  const [shippedDate, setShippedDate] = useState(order.shipped_date ?? "");
  const [countValue, setCountValue] = useState(order.out_of_county_count?.toString() ?? "");
  const [reasonValue, setReasonValue] = useState(order.out_of_county_reason ?? "");
  const [feeValue, setFeeValue] = useState(order.out_of_county_fee?.toString() ?? "");
  const [unreturnedDateValue, setUnreturnedDateValue] = useState(order.unreturned_date ?? "");
  const countInputRef = useRef<HTMLInputElement>(null);
  const feeInputRef = useRef<HTMLInputElement>(null);
  const [editingDriver, setEditingDriver] = useState(false);
  const [pendingDriver, setPendingDriver] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [reverting, setReverting] = useState(false);

  const isReturned = order.status === "returned";
  const isUnreturned = order.status === "unreturned";
  const isVoided = order.status === "voided";
  const canPickDriver = order.status === null || isUnreturned;
  const displayedDriver = pendingDriver ?? order.driver_name;

  async function handleVoidConfirm(reason: string) {
    await onUpdate(order, { status: "voided", void_reason: reason });
  }

  async function handleDriverSelect(name: string) {
    if (order.status === null || isUnreturned) {
      // Picking a driver on a 未處理 (no status yet) or 未回單 row means the
      // slip has already come back, so either way it commits straight to
      // 已回單. Show the pill as selected for a beat before the row moves
      // to its new status so it's clear which driver was picked.
      setPendingDriver(name);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await onUpdate(order, { driver_name: name, status: "returned" });
      setPendingDriver(null);
      return;
    }

    // Already 已回單: only reachable once "編輯" was clicked, and still
    // needs an explicit confirm since this corrects a settled record.
    if (!confirm(`確定要把司機改成「${name}」嗎？`)) return;
    await onUpdate(order, { driver_name: name });
    setEditingDriver(false);
  }

  async function handlePromote() {
    // Same one-beat pause as the driver-pick transition, so there's a moment
    // to see the click register before the row disappears from 未處理 (the
    // active tab stays put — only the row itself moves to its new status).
    setPromoting(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await onUpdate(order, { status: "unreturned" });
    setPromoting(false);
  }

  async function handleRevertToUnreturned() {
    setReverting(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await onUpdate(order, { status: "unreturned" });
    setReverting(false);
  }

  function handleFieldOptionChange(next: string) {
    const nextOption = next as FieldOption | "";
    setFieldOption(nextOption);

    // The dropdown choice itself is recorded right away regardless of
    // whether a value gets filled in — this is what lets the 填單價 tab
    // tell "picked 填單價 but left it blank" apart from "never touched it".
    if (nextOption === "shipped_date") {
      // Picking 實際出貨日 defaults it to today right away (still editable).
      const value = order.shipped_date || todayStr();
      setShippedDate(value);
      void onUpdate(order, {
        price_field_option: nextOption || null,
        ...(!order.shipped_date ? { shipped_date: value } : {}),
      });
    } else {
      setPriceValue(nextOption ? (order[nextOption]?.toString() ?? "") : "");
      void onUpdate(order, { price_field_option: nextOption || null });
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

  // On a settled 已回單 row, price edits stage locally and only commit when
  // "儲存" is clicked — unlike other statuses, which auto-save as you type.
  function handleShippedDateChange(value: string) {
    if (isReturned) setShippedDate(value);
    else commitShippedDate(value);
  }

  function commitFieldOption() {
    if (fieldOption === "shipped_date") void onUpdate(order, { shipped_date: shippedDate || null });
    else if (fieldOption) commitPriceValue(priceValue);
  }

  function handleOutOfCountyToggle(checked: boolean) {
    if (!checked) {
      setCountValue("");
      setReasonValue("");
      setFeeValue("");
    }
    void onUpdate(order, {
      out_of_county: checked,
      out_of_county_count: checked ? order.out_of_county_count : null,
      out_of_county_reason: checked ? order.out_of_county_reason : null,
      out_of_county_fee: checked ? order.out_of_county_fee : null,
    });
  }

  // 原因/件數/運費 stage locally and only commit together when "儲存" is
  // clicked, so typing doesn't get half-saved on an accidental blur.
  function commitOutOfCountyDetails() {
    void onUpdate(order, {
      out_of_county_reason: reasonValue.trim() === "" ? null : reasonValue,
      out_of_county_count: countValue.trim() === "" ? null : Number(countValue),
      out_of_county_fee: feeValue.trim() === "" ? null : Number(feeValue),
    });
  }

  function commitUnreturnedDate(value: string) {
    setUnreturnedDateValue(value);
    void onUpdate(order, { unreturned_date: value || null });
  }

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

      <div
        id={`order-row-${order.order_number}`}
        className={`${CELL} whitespace-nowrap font-mono text-lg font-semibold`}
      >
        {formatOrderNumber(order.order_number)}
      </div>

      <div className={CELL}>
        {order.status !== null && (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={order.status} />
            {isReturned && (
              <button
                type="button"
                disabled={reverting}
                onClick={() => void handleRevertToUnreturned()}
                className="text-xs text-neutral-400 hover:underline disabled:opacity-60"
              >
                改回未回單
              </button>
            )}
          </div>
        )}
      </div>

      <div className={`${CELL} text-center`}>
        <div className="flex flex-col items-center gap-1">
          <input
            type="checkbox"
            checked={order.out_of_county}
            disabled={isVoided}
            onChange={(e) => handleOutOfCountyToggle(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          {order.out_of_county && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-xs text-neutral-400">原因:</span>
                <input
                  type="text"
                  value={reasonValue}
                  disabled={isVoided}
                  onChange={(e) => setReasonValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      countInputRef.current?.focus();
                    }
                  }}
                  className="input w-28 py-0.5 text-xs disabled:opacity-60"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-neutral-400">件數:</span>
                <input
                  ref={countInputRef}
                  type="number"
                  min={0}
                  step="1"
                  value={countValue}
                  disabled={isVoided}
                  onChange={(e) => setCountValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      feeInputRef.current?.focus();
                    }
                  }}
                  className="input w-20 py-0.5 text-xs disabled:opacity-60"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-neutral-400">運費:</span>
                <input
                  ref={feeInputRef}
                  type="number"
                  min={0}
                  step="0.01"
                  value={feeValue}
                  disabled={isVoided}
                  onChange={(e) => setFeeValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitOutOfCountyDetails();
                    }
                  }}
                  className="input w-20 py-0.5 text-xs disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                disabled={isVoided}
                onClick={commitOutOfCountyDetails}
                className="rounded-md bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
              >
                儲存
              </button>
            </>
          )}
        </div>
      </div>

      <div className={CELL}>
        <div className="flex max-w-[280px] flex-wrap gap-2">
          {drivers.map((d) => (
            <button
              type="button"
              key={d.id}
              disabled={(!canPickDriver && !editingDriver) || pendingDriver !== null}
              onClick={() => void handleDriverSelect(d.name)}
              className={`rounded-full border px-3 py-1 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${
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
        {order.status === null && (
          <button
            type="button"
            disabled={promoting}
            onClick={() => void handlePromote()}
            className="mt-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60"
          >
            未回單
          </button>
        )}
      </div>

      <div className={CELL}>
        <div className="flex flex-col items-start gap-1">
          <select
            value={fieldOption}
            disabled={isVoided}
            onChange={(e) => handleFieldOptionChange(e.target.value)}
            className="input py-1 text-sm disabled:opacity-60"
          >
            <option value="">(未選擇)</option>
            <option value="order_price">填單價</option>
            <option value="cash_sale_price">現銷價</option>
            <option value="invoice_price">發票金額</option>
            <option value="shipped_date">實際出貨日</option>
          </select>
          {fieldOption === "shipped_date" ? (
            <MinguoDateInput
              value={shippedDate}
              onChange={handleShippedDateChange}
              disabled={isVoided}
              className="w-32 py-1 text-sm"
            />
          ) : (
            fieldOption && (
              <input
                type="number"
                step="0.01"
                value={priceValue}
                disabled={isVoided}
                onChange={(e) => setPriceValue(e.target.value)}
                onBlur={(e) => {
                  if (!isReturned) commitPriceValue(e.target.value);
                }}
                placeholder={PRICE_LABELS[fieldOption]}
                className="input w-20 py-1 text-sm disabled:opacity-60"
              />
            )
          )}
          {isReturned && fieldOption && (
            <button
              type="button"
              onClick={commitFieldOption}
              className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-700"
            >
              儲存
            </button>
          )}
        </div>
      </div>

      <div className={CELL}>
        {isVoided ? (
          (order.void_reason ?? "-")
        ) : (
          <MinguoDateInput
            value={unreturnedDateValue}
            onChange={commitUnreturnedDate}
            className="w-32 py-1 text-sm"
          />
        )}
      </div>

      <div className={CELL}>
        {isReturned ? (
          <button
            type="button"
            onClick={() => setEditingDriver((v) => !v)}
            className="text-xs text-neutral-500 hover:underline"
          >
            {editingDriver ? "取消編輯" : "編輯"}
          </button>
        ) : order.status === null ? (
          <button
            type="button"
            onClick={() => setVoidModalOpen(true)}
            className="text-xs text-red-600 hover:underline"
          >
            作廢
          </button>
        ) : isVoided ? (
          <button
            type="button"
            onClick={() => void onUpdate(order, { status: null, void_reason: null })}
            className="text-xs text-neutral-400 hover:underline"
          >
            恢復
          </button>
        ) : null}
      </div>

      {voidModalOpen && (
        <VoidReasonModal
          order={order}
          onClose={() => setVoidModalOpen(false)}
          onConfirm={handleVoidConfirm}
        />
      )}
    </>
  );
}
