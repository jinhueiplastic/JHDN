"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Order, ORDER_STATUS_LABEL, ORDER_STATUSES, OrderInput, OrderStatus } from "@/types/order";
import { Driver } from "@/types/driver";
import OrderRow from "@/components/OrderRow";
import BatchCreateModal from "@/components/BatchCreateModal";
import DriverManager from "@/components/DriverManager";

const TOTAL_ORDER_NUMBERS = 300;
const TABLE = "JHDN_orders";
const DRIVERS_TABLE = "JHDN_drivers";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

type FilterTab = "all" | OrderStatus;

export default function OrdersDashboard() {
  const [orderDate, setOrderDate] = useState(todayStr());
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderDate]);

  useEffect(() => {
    void loadDrivers();
  }, []);

  async function loadDrivers() {
    const { data, error } = await supabase
      .from(DRIVERS_TABLE)
      .select("*")
      .order("name", { ascending: true });
    if (!error) setDrivers(data as Driver[]);
  }

  async function handleAddDriver(name: string) {
    const { error } = await supabase
      .from(DRIVERS_TABLE)
      .upsert({ name }, { onConflict: "name", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    await loadDrivers();
  }

  async function handleDeleteDriver(driver: Driver) {
    if (!confirm(`確定要刪除司機「${driver.name}」嗎？`)) return;
    const { error } = await supabase.from(DRIVERS_TABLE).delete().eq("id", driver.id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadDrivers();
  }

  async function loadOrders() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("order_date", orderDate)
      .order("order_number", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setOrders(data as Order[]);
    }
    setLoading(false);
  }

  const counts = useMemo(() => {
    const c: Record<FilterTab, number> = {
      all: orders.length,
      shipped: 0,
      returned: 0,
      unreturned: 0,
    };
    for (const o of orders) c[o.status]++;
    return c;
  }, [orders]);

  const visibleOrders = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  const availableOrderNumbers = useMemo(() => {
    const used = new Set(orders.map((o) => o.order_number));
    const result: number[] = [];
    for (let n = 1; n <= TOTAL_ORDER_NUMBERS; n++) {
      if (!used.has(n)) result.push(n);
    }
    return result;
  }, [orders]);

  async function handleBatchCreate(start: number, end: number): Promise<number> {
    const used = new Set(orders.map((o) => o.order_number));
    const rows: OrderInput[] = [];
    for (let n = start; n <= end; n++) {
      if (n < 1 || n > TOTAL_ORDER_NUMBERS || used.has(n)) continue;
      rows.push({
        order_date: orderDate,
        order_number: n,
        status: "shipped",
        driver_name: null,
        out_of_county: false,
        order_price: null,
        cash_sale_price: null,
        invoice_price: null,
        unreturned_date: null,
      });
    }
    if (rows.length === 0) return 0;

    const { error } = await supabase.from(TABLE).insert(rows);
    if (error) throw new Error(error.message);
    await loadOrders();
    return rows.length;
  }

  async function handleUpdate(order: Order, patch: Partial<OrderInput>) {
    const merged: OrderInput = {
      order_date: order.order_date,
      order_number: order.order_number,
      status: order.status,
      driver_name: order.driver_name,
      out_of_county: order.out_of_county,
      order_price: order.order_price,
      cash_sale_price: order.cash_sale_price,
      invoice_price: order.invoice_price,
      unreturned_date: order.unreturned_date,
      ...patch,
    };

    if (merged.status === "unreturned" && !merged.unreturned_date) {
      merged.unreturned_date = todayStr();
    }
    if (merged.status !== "unreturned") {
      merged.unreturned_date = null;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(merged)
      .eq("id", order.id)
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === order.id ? (data as Order) : o)));
  }

  async function handleDelete(order: Order) {
    if (!confirm(`確定要刪除單號 ${order.order_number} 嗎？`)) return;
    const { error } = await supabase.from(TABLE).delete().eq("id", order.id);
    if (error) {
      alert(error.message);
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">出貨單管理</h1>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="input w-auto"
          />
          <button
            onClick={() => setBatchModalOpen(true)}
            disabled={availableOrderNumbers.length === 0}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            + 批次新增單號
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          全部 ({counts.all})
        </FilterButton>
        {ORDER_STATUSES.map((s) => (
          <FilterButton key={s} active={filter === s} onClick={() => setFilter(s)}>
            {ORDER_STATUS_LABEL[s]} ({counts[s]})
          </FilterButton>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-3 py-2">單號</th>
              <th className="px-2 py-2">狀態</th>
              <th className="px-2 py-2">司機</th>
              <th className="px-2 py-2">外縣市</th>
              <th className="px-2 py-2">填單價</th>
              <th className="px-2 py-2">現銷價</th>
              <th className="px-2 py-2">發票金額</th>
              <th className="px-3 py-2">未回單日期</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
                  載入中…
                </td>
              </tr>
            ) : visibleOrders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
                  這一天還沒有資料
                </td>
              </tr>
            ) : (
              visibleOrders.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  drivers={drivers}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <DriverManager drivers={drivers} onAdd={handleAddDriver} onDelete={handleDeleteDriver} />

      {batchModalOpen && (
        <BatchCreateModal
          orderDate={orderDate}
          minAvailable={availableOrderNumbers[0] ?? 1}
          maxAvailable={TOTAL_ORDER_NUMBERS}
          onClose={() => setBatchModalOpen(false)}
          onCreate={handleBatchCreate}
        />
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}
