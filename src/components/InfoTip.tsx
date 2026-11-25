"use client";

import { useEffect, useRef, useState } from "react";

// A small round「!」button that shows an explanation only when clicked, so
// help text stays out of the way until someone needs it.
export default function InfoTip({
  children,
  label = "說明",
  align = "left",
}: {
  children: React.ReactNode;
  label?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
          open
            ? "border-neutral-900 bg-neutral-900 text-white"
            : "border-neutral-400 text-neutral-500 hover:border-neutral-700 hover:text-neutral-800"
        }`}
      >
        !
      </button>
      {open && (
        <span
          role="note"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-8 z-40 block w-72 rounded-lg border border-neutral-200 bg-white p-3 text-left text-sm font-normal leading-relaxed text-neutral-700 shadow-lg`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
