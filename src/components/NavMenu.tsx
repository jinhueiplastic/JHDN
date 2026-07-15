"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const LINKS = [
  { href: "/", label: "首頁" },
  { href: "/daily", label: "每日訂單管理" },
  { href: "/filter", label: "依司機查詢" },
  { href: "/order", label: "依單號查詢" },
  { href: "/report", label: "列印報表" },
];

// Renders inline wherever it's placed (normal document flow, not fixed) so
// it can sit inside a page's own sticky header without needing separate
// offset math to keep the two in sync.
export default function NavMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="選單"
        className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50"
      >
        <span className="text-lg leading-none">☰</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-40 mt-1 w-48 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
