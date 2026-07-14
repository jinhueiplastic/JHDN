"use client";

import { useState } from "react";
import { Driver } from "@/types/driver";

interface Props {
  drivers: Driver[];
  selected: string;
  onSelect: (name: string) => void;
  onAddDriver: (name: string) => Promise<void>;
}

export default function DriverPicker({ drivers, selected, onSelect, onAddDriver }: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await onAddDriver(name);
      onSelect(name);
      setNewName("");
      setAdding(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {drivers.map((d) => (
        <button
          type="button"
          key={d.id}
          onClick={() => onSelect(d.name)}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
            selected === d.name
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          {d.name}
        </button>
      ))}

      {adding ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
              if (e.key === "Escape") {
                setAdding(false);
                setNewName("");
              }
            }}
            placeholder="新司機姓名"
            className="input w-32 py-1.5"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleAdd()}
            className="rounded-full bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            新增
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50"
        >
          + 新增司機
        </button>
      )}
    </div>
  );
}
