"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatOrderNumber, Order } from "@/types/order";
import { describe, formatTime, HISTORY_TABLE, HistoryEntry } from "@/lib/orderHistory";

export default function OrderHistoryModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from(HISTORY_TABLE)
        .select("*")
        .eq("order_id", order.id)
        .order("changed_at", { ascending: false })
        .order("id", { ascending: false });
      if (cancelled) return;
      if (error) setError(`讀取紀錄失敗：${error.message}`);
      else setEntries(data as HistoryEntry[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-lg font-semibold">
            單號 {formatOrderNumber(order.order_number)} 的處理紀錄
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="text-xl text-neutral-400 hover:text-neutral-700"
          >
            ×
          </button>
        </div>
        <div className="border-b border-neutral-100 px-5 py-2 text-right">
          <a
            href={`/history?date=${order.order_date}&no=${order.order_number}`}
            target="_blank"
            rel="noopener"
            className="text-sm font-medium text-neutral-700 underline hover:text-neutral-900"
          >
            到紀錄頁復原 →
          </a>
        </div>
        <div className="overflow-y-auto px-5 py-3 text-sm">
          {error ? (
            <p className="text-red-600">{error}</p>
          ) : entries === null ? (
            <p className="text-neutral-400">載入中…</p>
          ) : entries.length === 0 ? (
            <p className="text-neutral-400">還沒有紀錄（紀錄功能開始之後的修改才會出現）</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {entries.map((entry) => (
                <li key={entry.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{entry.device ?? "未知"}</span>
                    <span className="text-xs text-neutral-400">{formatTime(entry.changed_at)}</span>
                  </div>
                  <ul className="mt-1 text-neutral-600">
                    {describe(entry).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
