"use client";

import { useEffect, useState } from "react";
import {
  DEVICE_NAME_EVENT,
  getDeviceName,
  MAX_DEVICE_NAME_LENGTH,
  setDeviceName,
} from "@/lib/device";

export const OPEN_DEVICE_NAME_EVENT = "jhdn-open-device-name";

// Asks once per browser what this computer should be called, so every
// change made here can be traced back to it. Also reopens on demand
// (NavMenu's「這台電腦」entry) to rename.
export default function DeviceNameGate() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [hasName, setHasName] = useState(true);

  useEffect(() => {
    const current = getDeviceName();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasName(!!current);
    if (!current) setOpen(true);

    function handleOpen() {
      setValue(getDeviceName() ?? "");
      setHasName(!!getDeviceName());
      setOpen(true);
    }
    window.addEventListener(OPEN_DEVICE_NAME_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_DEVICE_NAME_EVENT, handleOpen);
  }, []);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setDeviceName(value);
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="mb-2 text-lg font-semibold">這台電腦叫什麼？</h2>
        <p className="mb-4 text-sm text-neutral-500">
          之後在這台電腦做的每一次修改，都會記下這個名字，方便查是哪一台處理的。
          例如：櫃台、倉庫、辦公室1。
        </p>
        <input
          autoFocus
          type="text"
          value={value}
          maxLength={MAX_DEVICE_NAME_LENGTH}
          onChange={(e) => setValue(e.target.value)}
          placeholder="電腦名稱"
          className="input mb-4 w-full"
        />
        <div className="flex justify-end gap-2">
          {hasName && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
            >
              取消
            </button>
          )}
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            儲存
          </button>
        </div>
      </form>
    </div>
  );
}

/** Current name, kept in sync when it's renamed anywhere on the page. */
export function useDeviceName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(getDeviceName());
    const update = () => setName(getDeviceName());
    window.addEventListener(DEVICE_NAME_EVENT, update);
    return () => window.removeEventListener(DEVICE_NAME_EVENT, update);
  }, []);
  return name;
}
