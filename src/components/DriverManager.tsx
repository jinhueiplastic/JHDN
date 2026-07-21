"use client";

import { useState } from "react";
import { Driver } from "@/types/driver";

interface Props {
  drivers: Driver[];
  onAdd: (name: string) => Promise<void>;
  onDelete: (driver: Driver) => Promise<void>;
  onRestore: (driver: Driver) => Promise<void>;
  onReorder: (driver: Driver, direction: "up" | "down") => Promise<void>;
}

export default function DriverManager({ drivers, onAdd, onDelete, onRestore, onReorder }: Props) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeDrivers = drivers.filter((d) => d.active);
  const archivedDrivers = drivers.filter((d) => !d.active);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd(trimmed);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">司機名單管理</h2>

      <p className="mb-2 text-xs text-neutral-400">
        用 ↑↓ 調整順序，會套用到所有選司機的地方（依這個順序顯示按鈕）。
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {activeDrivers.length === 0 && (
          <p className="text-sm text-neutral-400">還沒有司機，請在下面新增。</p>
        )}
        {activeDrivers.map((d, i) => (
          <span
            key={d.id}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-2 py-1 text-sm text-neutral-700"
          >
            <button
              type="button"
              onClick={() => void onReorder(d, "up")}
              disabled={i === 0}
              className="text-neutral-400 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={`把 ${d.name} 往前移`}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => void onReorder(d, "down")}
              disabled={i === activeDrivers.length - 1}
              className="text-neutral-400 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={`把 ${d.name} 往後移`}
            >
              ↓
            </button>
            <span className="px-1">{d.name}</span>
            <button
              type="button"
              onClick={() => void onDelete(d)}
              className="text-neutral-400 hover:text-red-600"
              aria-label={`刪除 ${d.name}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新司機姓名"
          className="input max-w-xs"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "新增中…" : "新增司機"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </form>

      {archivedDrivers.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <p className="mb-2 text-xs text-neutral-400">
            已刪除的司機（舊單號還是留著這個名字，這裡可以恢復）
          </p>
          <div className="flex flex-wrap gap-2">
            {archivedDrivers.map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-3 py-1 text-sm text-neutral-400"
              >
                {d.name}
                <button
                  type="button"
                  onClick={() => void onRestore(d)}
                  className="text-neutral-400 hover:text-neutral-700"
                  aria-label={`恢復 ${d.name}`}
                >
                  ↺
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
