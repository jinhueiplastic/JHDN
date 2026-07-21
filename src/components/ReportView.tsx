"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  formatMinguoSlash,
  formatOrderNumber,
  formatOutOfCounty,
  Order,
  ORDER_STATUS_LABEL,
} from "@/types/order";
import { Driver } from "@/types/driver";
import NavMenu from "@/components/NavMenu";

const TABLE = "JHDN_orders";
const DRIVERS_TABLE = "JHDN_drivers";

type Mode = "day" | "driver";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportView() {
  const [mode, setMode] = useState<Mode>("day");
  const [reportDate, setReportDate] = useState(todayStr());
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDrivers() {
      const { data, error } = await supabase
        .from(DRIVERS_TABLE)
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (!error) setDrivers(data as Driver[]);
    }
    void loadDrivers();
  }, []);

  async function fetchOrders(): Promise<Order[]> {
    if (mode === "day") {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("order_date", reportDate)
        .order("order_number", { ascending: true });
      if (error) throw new Error(error.message);
      return data as Order[];
    }

    if (!selectedDriver) throw new Error("請先選擇司機");
    let query = supabase.from(TABLE).select("*").eq("driver_name", selectedDriver);
    if (startDate) query = query.gte("order_date", startDate);
    if (endDate) query = query.lte("order_date", endDate);
    const { data, error } = await query
      .order("order_date", { ascending: true })
      .order("order_number", { ascending: true });
    if (error) throw new Error(error.message);
    return data as Order[];
  }

  function priceCells(o: Order): [string, string, string] {
    return [
      o.order_price != null ? String(o.order_price) : "",
      o.cash_sale_price != null ? String(o.cash_sale_price) : "",
      o.invoice_price != null ? String(o.invoice_price) : "",
    ];
  }

  function reportFilename(): string {
    if (mode === "day") return `出貨單報表_${reportDate}.xlsx`;
    const range = startDate || endDate ? `_${startDate || "起"}~${endDate || "訖"}` : "";
    return `出貨單報表_${selectedDriver}${range}.xlsx`;
  }

  async function handleDownload() {
    setError(null);
    setGenerating(true);
    try {
      const orders = await fetchOrders();
      if (orders.length === 0) {
        setError("這個條件沒有任何資料");
        return;
      }

      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("出貨單報表");

      const headers = [
        "日期",
        "單號",
        "狀態",
        "司機姓名",
        "外縣市",
        "填單價",
        "現銷價",
        "發票金額",
        "未回單/已回單日期",
      ];
      sheet.addRow(headers).font = { bold: true };
      sheet.columns = headers.map(() => ({ width: 14 }));

      for (const o of orders) {
        const [orderPrice, cashSalePrice, invoicePrice] = priceCells(o);
        const row = sheet.addRow([
          formatMinguoSlash(o.order_date),
          formatOrderNumber(o.order_number),
          o.status ? ORDER_STATUS_LABEL[o.status] : "沒有狀態",
          o.driver_name ?? "",
          formatOutOfCounty(o),
          orderPrice,
          cashSalePrice,
          invoicePrice,
          o.unreturned_date ? formatMinguoSlash(o.unreturned_date) : "",
        ]);

        if (o.status === "unreturned") {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFD9F2D9" },
          };
        }
        if (o.out_of_county) {
          row.font = { bold: true, color: { argb: "FFCC0000" } };
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFilename();
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "產生報表失敗");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1296px] px-4 pt-8 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <NavMenu />
        <h1 className="text-xl font-semibold">列印報表</h1>
      </div>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("day")}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
            mode === "day"
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          單日報表
        </button>
        <button
          type="button"
          onClick={() => setMode("driver")}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
            mode === "driver"
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          依司機報表
        </button>
      </div>

      {mode === "day" ? (
        <div className="mb-6">
          <label className="block text-sm font-medium text-neutral-700">選擇日期</label>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="input mt-1 w-auto"
          />
        </div>
      ) : (
        <div className="mb-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">選擇司機</label>
            <div className="flex flex-wrap gap-2">
              {drivers.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => setSelectedDriver(d.name)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    selectedDriver === d.name
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {d.name}
                </button>
              ))}
              {drivers.length === 0 && (
                <p className="text-sm text-neutral-400">還沒有司機資料</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-neutral-500">起始日期（選填）</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input w-auto"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500">結束日期（選填）</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input w-auto"
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={generating || (mode === "driver" && !selectedDriver)}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {generating ? "產生中…" : "下載 Excel"}
      </button>

      <p className="mt-4 text-xs text-neutral-400">
        報表中「未回單」的列會是淺綠色底色，「外縣市」的訂單會是粗體紅字。
      </p>
    </div>
  );
}
