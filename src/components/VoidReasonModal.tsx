"use client";

import { useState } from "react";
import { formatOrderNumber, Order } from "@/types/order";

type ReasonKind = "duplicate" | "mistake" | "customer_cancel" | "other";

const REASON_LABEL: Record<ReasonKind, string> = {
  duplicate: "重複",
  mistake: "打錯了",
  customer_cancel: "客人取消",
  other: "其他",
};

const REASON_ORDER: ReasonKind[] = ["duplicate", "mistake", "customer_cancel", "other"];

function notePlaceholder(kind: ReasonKind): string {
  if (kind === "duplicate") return "單號（選填）";
  if (kind === "other") return "請說明原因（必填）";
  return "說明（選填）";
}

interface Props {
  order: Order;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function VoidReasonModal({ order, onClose, onConfirm }: Props) {
  const [reasonKind, setReasonKind] = useState<ReasonKind | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noteRequired = reasonKind === "other";
  const canSubmit = reasonKind !== null && (!noteRequired || note.trim() !== "");

  function selectReason(kind: ReasonKind) {
    setReasonKind(kind);
    setNote("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reasonKind) return;
    if (noteRequired && note.trim() === "") {
      setError("請填寫原因");
      return;
    }

    const label = REASON_LABEL[reasonKind];
    const reason = note.trim() ? `${label}（${note.trim()}）` : label;

    setError(null);
    setSaving(true);
    try {
      await onConfirm(reason);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作廢失敗");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            作廢單號 {formatOrderNumber(order.order_number)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {REASON_ORDER.map((kind) => (
            <div key={kind} className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                <input
                  type="radio"
                  name="void-reason"
                  checked={reasonKind === kind}
                  onChange={() => selectReason(kind)}
                  className="h-4 w-4"
                />
                {REASON_LABEL[kind]}
              </label>
              {reasonKind === kind && (
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={notePlaceholder(kind)}
                  className="input flex-1 py-1 text-sm"
                />
              )}
            </div>
          ))}

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
              disabled={!canSubmit || saving}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "處理中…" : "確認作廢"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
