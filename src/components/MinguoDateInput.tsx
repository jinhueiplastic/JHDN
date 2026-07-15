"use client";

import { formatMinguoSlash } from "@/types/order";

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

// <input type="date"> always renders the Gregorian calendar and its
// displayed text follows the browser/OS locale — neither can be restyled to
// show a Minguo year. So the native input stays functional (for the actual
// picker) but invisible, layered under a label showing our own formatted
// text; clicking the label clicks through to the native input beneath it.
export default function MinguoDateInput({ value, onChange, className = "", disabled = false }: Props) {
  return (
    <div
      className={`input relative flex items-center justify-center whitespace-nowrap ${
        disabled ? "opacity-60" : ""
      } ${className}`}
    >
      {value ? formatMinguoSlash(value) : "選擇日期"}
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}
