"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  formatMinguoSlash,
  formatOrderNumber,
  formatOutOfCounty,
  Order,
  parseOrderQuery,
} from "@/types/order";
import StatusBadge from "@/components/StatusBadge";
import NavMenu from "@/components/NavMenu";

const TABLE = "JHDN_orders";

export default function OrderLookupView() {
  const [code, setCode] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOrder(null);
    setOrders(null);
    setNotFound(false);

    const parsed = parseOrderQuery(code);
    if (!parsed) {
      setError("請輸入完整 11 碼單號（例如 11507140001），或 7 碼日期（例如 1150714）查當天全部單號");
      return;
    }

    setLoading(true);

    if (parsed.type === "order") {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("order_date", parsed.order_date)
        .eq("order_number", parsed.order_number)
        .maybeSingle();

      if (error) setError(error.message);
      else if (!data) setNotFound(true);
      else setOrder(data as Order);
    } else {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("order_date", parsed.order_date)
        .order("order_number", { ascending: true });

      if (error) setError(error.message);
      else if (!data || data.length === 0) setNotFound(true);
      else setOrders(data as Order[]);
    }

    setLoading(false);
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
    <div className="mx-auto w-full max-w-[1296px] px-4 pt-8 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <NavMenu />
        <h1 className="text-xl font-semibold">依單號查詢</h1>
      </div>

      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="輸入 11507140001 查單筆，或 1150714 查當天全部"
          className="input"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "查詢中…" : "查詢"}
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {notFound && (
        <p className="mb-4 rounded-md bg-neutral-100 px-4 py-2 text-sm text-neutral-500">
          找不到符合的資料
        </p>
      )}

      {order && (
        <div className="max-w-md rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-2xl font-semibold">
              {formatOrderNumber(order.order_number)}
            </span>
            {order.status ? <StatusBadge status={order.status} /> : <span className="text-sm text-neutral-400">-</span>}
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="日期" value={formatMinguoSlash(order.order_date)} />
            <Row label="司機" value={order.driver_name ?? "-"} />
            <Row label="外縣市" value={formatOutOfCounty(order)} />
            <Row label="價格" value={priceSummary(order)} />
            <Row
              label={order.status === "returned" ? "已回單日期" : "未回單日期"}
              value={order.unreturned_date ? formatMinguoSlash(order.unreturned_date) : "-"}
            />
          </dl>
        </div>
      )}

      {orders && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-3 py-2">單號</th>
                <th className="px-2 py-2">狀態</th>
                <th className="px-2 py-2">司機</th>
                <th className="px-2 py-2">外縣市</th>
                <th className="px-2 py-2">價格</th>
                <th className="px-3 py-2">未回單/已回單日期</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                >
                  <td className="px-3 py-2 font-mono text-lg font-semibold">
                    {formatOrderNumber(o.order_number)}
                  </td>
                  <td className="px-2 py-2">
                    {o.status ? <StatusBadge status={o.status} /> : "-"}
                  </td>
                  <td className="px-2 py-2">{o.driver_name ?? "-"}</td>
                  <td className="px-2 py-2">{formatOutOfCounty(o)}</td>
                  <td className="px-2 py-2 text-neutral-600">{priceSummary(o)}</td>
                  <td className="px-3 py-2">
                    {o.unreturned_date ? formatMinguoSlash(o.unreturned_date) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-100 py-1 last:border-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
