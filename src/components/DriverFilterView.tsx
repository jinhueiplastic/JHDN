"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Order, formatMinguoSlash, formatOrderNumber, formatOutOfCounty } from "@/types/order";
import { Driver } from "@/types/driver";
import StatusBadge from "@/components/StatusBadge";
import DriverManager from "@/components/DriverManager";
import NavMenu from "@/components/NavMenu";

const TABLE = "JHDN_orders";
const DRIVERS_TABLE = "JHDN_drivers";

export default function DriverFilterView() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [showOldDrivers, setShowOldDrivers] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

  async function loadDrivers() {
    const { data, error } = await supabase
      .from(DRIVERS_TABLE)
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (!error) setDrivers(data as Driver[]);
  }

  async function handleAddDriver(name: string) {
    // New (or reactivated) drivers land at the end of the order, ready to
    // be moved with the ↑/↓ buttons if needed.
    const nextOrder = drivers.reduce((max, d) => Math.max(max, d.sort_order ?? -1), -1) + 1;
    const { error } = await supabase
      .from(DRIVERS_TABLE)
      .upsert({ name, active: true, sort_order: nextOrder }, { onConflict: "name" });
    if (error) throw new Error(error.message);
    await loadDrivers();
  }

  async function handleReorderDriver(driver: Driver, direction: "up" | "down") {
    const active = drivers
      .filter((d) => d.active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const index = active.findIndex((d) => d.id === driver.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= active.length) return;

    const other = active[swapIndex];
    const driverOrder = driver.sort_order ?? index;
    const otherOrder = other.sort_order ?? swapIndex;

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from(DRIVERS_TABLE).update({ sort_order: otherOrder }).eq("id", driver.id),
      supabase.from(DRIVERS_TABLE).update({ sort_order: driverOrder }).eq("id", other.id),
    ]);
    if (e1 || e2) {
      alert((e1 ?? e2)?.message);
      return;
    }
    await loadDrivers();
  }

  async function handleDeleteDriver(driver: Driver) {
    if (!confirm(`確定要刪除司機「${driver.name}」嗎？`)) return;
    const { error } = await supabase
      .from(DRIVERS_TABLE)
      .update({ active: false })
      .eq("id", driver.id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadDrivers();
  }

  async function handleRestoreDriver(driver: Driver) {
    const { error } = await supabase
      .from(DRIVERS_TABLE)
      .update({ active: true })
      .eq("id", driver.id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadDrivers();
  }

  async function loadOrdersForDriver(name: string) {
    setLoading(true);
    setError(null);
    let query = supabase.from(TABLE).select("*").eq("driver_name", name);
    if (startDate) query = query.gte("order_date", startDate);
    if (endDate) query = query.lte("order_date", endDate);
    const { data, error } = await query
      .order("order_date", { ascending: false })
      .order("order_number", { ascending: true });

    if (error) setError(error.message);
    else setOrders(data as Order[]);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDrivers();
  }, []);

  useEffect(() => {
    if (selectedDriver) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadOrdersForDriver(selectedDriver);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDriver, startDate, endDate]);

  function handleSelectDriver(name: string) {
    setOrders([]);
    setSelectedDriver(name);
  }

  const activeDrivers = drivers.filter((d) => d.active);
  const oldDrivers = drivers.filter((d) => !d.active);

  const priceSummary = (o: Order) =>
    [
      o.order_price != null && `填單價 ${o.order_price}`,
      o.cash_sale_price != null && `現銷價 ${o.cash_sale_price}`,
      o.invoice_price != null && `發票 ${o.invoice_price}`,
    ]
      .filter(Boolean)
      .join("、") || "-";

  return (
    <div className="mx-auto w-full max-w-[1296px] px-4 pt-8 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <NavMenu />
        <h1 className="text-xl font-semibold">依司機查詢</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {activeDrivers.map((d) => (
          <button
            type="button"
            key={d.id}
            onClick={() => handleSelectDriver(d.name)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              selectedDriver === d.name
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {d.name}
          </button>
        ))}
        {activeDrivers.length === 0 && (
          <p className="text-sm text-neutral-400">還沒有司機資料，請到頁面最下方新增</p>
        )}
        {oldDrivers.length > 0 && (
          <button
            type="button"
            onClick={() => setShowOldDrivers((v) => !v)}
            className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-50"
          >
            {showOldDrivers ? "‹" : "舊司機..."}
          </button>
        )}
        {showOldDrivers &&
          oldDrivers.map((d) => (
            <button
              type="button"
              key={d.id}
              onClick={() => handleSelectDriver(d.name)}
              className={`rounded-full border border-dashed px-3 py-1.5 text-sm font-medium ${
                selectedDriver === d.name
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-400 hover:bg-neutral-50"
              }`}
            >
              {d.name}
            </button>
          ))}
      </div>

      {selectedDriver && (
        <div className="mb-6 flex flex-wrap items-end gap-3">
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
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="text-sm text-neutral-400 hover:underline"
            >
              清除日期篩選
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {!selectedDriver ? (
        <p className="text-sm text-neutral-400">請先選擇一位司機</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-3 py-2">日期</th>
                <th className="px-3 py-2">單號</th>
                <th className="px-2 py-2">狀態</th>
                <th className="px-2 py-2">外縣市</th>
                <th className="px-2 py-2">價格</th>
                <th className="px-3 py-2">未回單/已回單日期</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                    載入中…
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                    這位司機還沒有任何單號
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                  >
                    <td className="px-3 py-2">{formatMinguoSlash(o.order_date)}</td>
                    <td className="px-3 py-2 font-mono text-lg font-semibold">
                      {formatOrderNumber(o.order_number)}
                    </td>
                    <td className="px-2 py-2">
                      {o.status ? <StatusBadge status={o.status} /> : "-"}
                    </td>
                    <td className="px-2 py-2">{formatOutOfCounty(o)}</td>
                    <td className="px-2 py-2 text-neutral-600">{priceSummary(o)}</td>
                    <td className="px-3 py-2">
                      {o.unreturned_date ? formatMinguoSlash(o.unreturned_date) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-10 border-t border-neutral-200 pt-4">
        <button
          type="button"
          onClick={() => setManagerOpen((v) => !v)}
          className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-600"
        >
          <span className={`transition-transform ${managerOpen ? "rotate-180" : ""}`}>▾</span>
          司機名單管理
        </button>
        {managerOpen && (
          <div className="mt-3">
            <DriverManager
              drivers={drivers}
              onAdd={handleAddDriver}
              onDelete={handleDeleteDriver}
              onRestore={handleRestoreDriver}
              onReorder={handleReorderDriver}
            />
          </div>
        )}
      </div>
    </div>
  );
}
