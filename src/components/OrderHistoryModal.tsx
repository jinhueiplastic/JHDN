"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatMinguoSlash, formatOrderNumber, Order, ORDER_STATUS_LABEL } from "@/types/order";

const HISTORY_TABLE = "JHDN_order_history";

interface HistoryEntry {
  id: number;
  changed_at: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  device: string | null;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
}

const FIELD_LABEL: Record<string, string> = {
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

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "（空）";
  if (field === "status") return ORDER_STATUS_LABEL[value as keyof typeof ORDER_STATUS_LABEL] ?? String(value);
  if (field === "out_of_county") return value ? "是" : "否";
  if (field === "price_field_option") return PRICE_OPTION_LABEL[String(value)] ?? String(value);
  if (field.endsWith("_date") && typeof value === "string") return formatMinguoSlash(value);
  return String(value);
}

function describe(entry: HistoryEntry): string[] {
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

function formatTime(iso: string): string {
  const d = new Date(iso);
  const date = formatMinguoSlash(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  );
  const time = d.toLocaleTimeString("zh-TW", { hour12: false });
  return `${date} ${time}`;
}

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
