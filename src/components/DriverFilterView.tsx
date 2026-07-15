"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Order, formatOrderNumber } from "@/types/order";
import { Driver } from "@/types/driver";
import StatusBadge from "@/components/StatusBadge";

const TABLE = "JHDN_orders";
const DRIVERS_TABLE = "JHDN_drivers";

export default function DriverFilterView() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDrivers() {
    const { data, error } = await supabase
      .from(DRIVERS_TABLE)
      .select("*")
      .order("name", { ascending: true });
    if (!error) setDrivers(data as Driver[]);
  }

  async function loadOrdersForDriver(name: string) {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("driver_name", name)
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
  }, [selectedDriver]);

  function handleSelectDriver(name: string) {
    setOrders([]);
    setSelectedDriver(name);
  }

  const priceSummary = (o: Order) =>
    [
      o.order_price != null && `填單價 ${o.order_price}`,
      o.cash_sale_price != null && `現銷價 ${o.cash_sale_price}`,
      o.invoice_price != null && `發票 ${o.invoice_price}`,
    ]
      .filter(Boolean)
      .join("、") || "-";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold">依司機查詢</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        {drivers.map((d) => (
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
        {drivers.length === 0 && (
          <p className="text-sm text-neutral-400">還沒有司機資料</p>
        )}
      </div>

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
                    <td className="px-3 py-2">{o.order_date}</td>
                    <td className="px-3 py-2 font-mono text-lg font-semibold">
                      {formatOrderNumber(o.order_number)}
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-2 py-2">{o.out_of_county ? "是" : "否"}</td>
                    <td className="px-2 py-2 text-neutral-600">{priceSummary(o)}</td>
                    <td className="px-3 py-2">{o.unreturned_date ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
