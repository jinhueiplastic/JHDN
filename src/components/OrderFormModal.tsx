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
import DriverPicker from "@/components/DriverPicker";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  orderDate: string;
  existing: Order;
  hasNext: boolean;
  drivers: Driver[];
  onAddDriver: (name: string) => Promise<void>;
  onClose: () => void;
  onSave: (orderNumber: number, input: OrderInput) => Promise<void>;
  onSaveAndNext: (orderNumber: number, input: OrderInput) => Promise<void>;
  onDelete: () => Promise<void>;
}

export default function OrderFormModal({
  orderDate,
  existing,
  hasNext,
  drivers,
  onAddDriver,
  onClose,
  onSave,
  onSaveAndNext,
  onDelete,
}: Props) {
  const orderNumber = existing.order_number;
  const [status, setStatus] = useState<OrderStatus>(existing.status);
  const [driverName, setDriverName] = useState(existing.driver_name ?? "");
  const [outOfCounty, setOutOfCounty] = useState(existing.out_of_county);
  const [orderPrice, setOrderPrice] = useState(existing.order_price?.toString() ?? "");
  const [cashSalePrice, setCashSalePrice] = useState(
    existing.cash_sale_price?.toString() ?? ""
  );
  const [invoicePrice, setInvoicePrice] = useState(
    existing.invoice_price?.toString() ?? ""
  );
  const [unreturnedDate, setUnreturnedDate] = useState<string | null>(
    existing.unreturned_date
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleStatusChange(next: OrderStatus) {
    setStatus(next);
    if (next === "unreturned" && !unreturnedDate) {
      setUnreturnedDate(todayStr());
    }
    if (next !== "unreturned") {
      setUnreturnedDate(null);
    }
  }

  async function submit(andNext: boolean) {
    setError(null);

    if (status === "shipped" && !driverName.trim()) {
      setError("請填寫司機的名字");
      return;
    }
    if (status === "unreturned" && !driverName.trim()) {
      setError("請備注司機名字");
      return;
    }

    const input: OrderInput = {
      order_date: orderDate,
      order_number: orderNumber,
      status,
      driver_name: driverName.trim() || null,
      out_of_county: outOfCounty,
      order_price: orderPrice === "" ? null : Number(orderPrice),
      cash_sale_price: cashSalePrice === "" ? null : Number(cashSalePrice),
      invoice_price: invoicePrice === "" ? null : Number(invoicePrice),
      unreturned_date: status === "unreturned" ? unreturnedDate ?? todayStr() : null,
    };

    setSaving(true);
    try {
      if (andNext) {
        await onSaveAndNext(orderNumber, input);
      } else {
        await onSave(orderNumber, input);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            單號 {formatOrderCode(orderDate, orderNumber)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-neutral-700">狀態</label>
            <div className="mt-1 flex gap-2">
              {ORDER_STATUSES.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                    status === s
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {ORDER_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {status === "shipped" && (
            <>
              <Field label="司機的名字">
                <DriverPicker
                  drivers={drivers}
                  selected={driverName}
                  onSelect={setDriverName}
                  onAddDriver={onAddDriver}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={outOfCounty}
                  onChange={(e) => setOutOfCounty(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                外縣市
              </label>
              <div className="grid grid-cols-3 gap-3">
                <Field label="填單價">
                  <input
                    type="number"
                    step="0.01"
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="當日現銷價錢">
                  <input
                    type="number"
                    step="0.01"
                    value={cashSalePrice}
                    onChange={(e) => setCashSalePrice(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="發票金額(未開免填)">
                  <input
                    type="number"
                    step="0.01"
                    value={invoicePrice}
                    onChange={(e) => setInvoicePrice(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
            </>
          )}

          {status === "returned" && (
            <div className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">
              <p>
                司機的名字：<span className="font-medium text-neutral-900">{driverName || "-"}</span>
              </p>
              <p>
                外縣市：
                <span className="font-medium text-neutral-900">
                  {outOfCounty ? "是" : "否"}
                </span>
              </p>
              <p className="mt-2 text-xs text-neutral-400">
                資料承接自出貨單，如需修改請切換回「出貨單」狀態。
              </p>
            </div>
          )}

          {status === "unreturned" && (
            <>
              <Field label="備注司機名字">
                <DriverPicker
                  drivers={drivers}
                  selected={driverName}
                  onSelect={setDriverName}
                  onAddDriver={onAddDriver}
                />
              </Field>
              <Field label="備註日期（自動）">
                <input
                  value={unreturnedDate ?? todayStr()}
                  disabled
                  className="input bg-neutral-100 text-neutral-500"
                />
              </Field>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onDelete}
              className="text-sm text-red-600 hover:underline"
            >
              刪除這筆
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? "儲存中…" : "儲存"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit(true)}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {saving ? "儲存中…" : hasNext ? "儲存並下一筆" : "儲存並關閉"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
