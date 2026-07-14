"use client";

import { useState } from "react";
import { Driver } from "@/types/driver";

interface Props {
  drivers: Driver[];
  onAdd: (name: string) => Promise<void>;
  onDelete: (driver: Driver) => Promise<void>;
}

export default function DriverManager({ drivers, onAdd, onDelete }: Props) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      <div className="mb-3 flex flex-wrap gap-2">
        {drivers.length === 0 && (
          <p className="text-sm text-neutral-400">還沒有司機，請在下面新增。</p>
        )}
        {drivers.map((d) => (
          <span
            key={d.id}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1 text-sm text-neutral-700"
          >
            {d.name}
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
    </div>
  );
}
