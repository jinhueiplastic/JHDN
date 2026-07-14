"use client";

import { useState } from "react";
import { formatMinguoDate, formatOrderNumber } from "@/types/order";

interface Props {
  orderDate: string;
  minAvailable: number;
  maxAvailable: number;
  onClose: () => void;
  onCreate: (start: number, end: number) => Promise<number>;
}

export default function BatchCreateModal({
  orderDate,
  minAvailable,
  maxAvailable,
  onClose,
  onCreate,
}: Props) {
  const [start, setStart] = useState(minAvailable);
  const [end, setEnd] = useState(maxAvailable);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (start > end) {
      setError("起始單號不能大於結束單號");
      return;
    }

    setSaving(true);
    try {
      const created = await onCreate(start, end);
      if (created === 0) {
        setError("這個區間的單號都已經建立過了");
        setSaving(false);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">批次新增單號</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm text-neutral-500">
          日期：<span className="font-medium text-neutral-900">{orderDate}</span>
          （民國 {formatMinguoDate(orderDate)}）
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700">起始單號</label>
              <input
                type="number"
                min={1}
                max={300}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">結束單號</label>
              <input
                type="number"
                min={1}
                max={300}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                className="input"
              />
            </div>
          </div>

          <p className="text-xs text-neutral-400">
            將建立 {formatMinguoDate(orderDate)}-{formatOrderNumber(start)} ~{" "}
            {formatMinguoDate(orderDate)}-{formatOrderNumber(end)}
            之間尚未建立的單號（已存在的不會被覆蓋），狀態預設為「出貨單」，之後可以逐筆點進去編輯。
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
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
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? "建立中…" : "建立"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
