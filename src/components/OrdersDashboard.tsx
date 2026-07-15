"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Order, ORDER_STATUS_LABEL, ORDER_STATUSES, OrderInput, OrderStatus } from "@/types/order";
import { Driver } from "@/types/driver";
import OrderRow from "@/components/OrderRow";
import BatchCreateModal from "@/components/BatchCreateModal";

const TOTAL_ORDER_NUMBERS = 300;
const MAX_ORDER_NUMBER = 9999;
const TABLE = "JHDN_orders";
const DRIVERS_TABLE = "JHDN_drivers";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type FilterTab = "all" | OrderStatus;

export default function OrdersDashboard() {
  const [orderDate, setOrderDate] = useState(todayStr());
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("unreturned");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchModalOpen, setBatchModalOpen] = useState(false);

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

  function defaultRow(n: number): OrderInput {
    return {
      order_date: orderDate,
      order_number: n,
      status: "unreturned",
      driver_name: null,
      out_of_county: false,
      order_price: null,
      cash_sale_price: null,
      invoice_price: null,
      unreturned_date: orderDate,
    };
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
      setLoading(false);
      return;
    }

    // A date nobody has touched yet: provision all 300 slots up front as
    // 未回單 so the whole board is ready without a separate "batch create"
    // click. Once a date has any rows, leave it alone so deletions stick.
    if (data.length === 0) {
      const rows: OrderInput[] = [];
      for (let n = 1; n <= TOTAL_ORDER_NUMBERS; n++) rows.push(defaultRow(n));

      const { data: inserted, error: insertError } = await supabase
        .from(TABLE)
        .insert(rows)
        .select();

      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }
      setOrders(
        (inserted as Order[]).sort((a, b) => a.order_number - b.order_number)
      );
      setLoading(false);
      return;
    }

    setOrders(data as Order[]);
    setLoading(false);
  }

  const counts = useMemo(() => {
    const c: Record<FilterTab, number> = {
      all: orders.length,
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

  const nextAvailableNumber = useMemo(() => {
    if (orders.length === 0) return 1;
    const maxNumber = Math.max(...orders.map((o) => o.order_number));
    return Math.min(maxNumber + 1, MAX_ORDER_NUMBER);
  }, [orders]);

  async function handleBatchCreate(start: number, end: number): Promise<number> {
    const used = new Set(orders.map((o) => o.order_number));
    const rows: OrderInput[] = [];
    for (let n = start; n <= end; n++) {
      if (n < 1 || n > MAX_ORDER_NUMBER || used.has(n)) continue;
      rows.push(defaultRow(n));
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

    // `unreturned_date` doubles as "the date this status became true": the
    // day it was flagged unreturned, or the day it was confirmed returned.
    if (merged.status === "unreturned" && !merged.unreturned_date) {
      merged.unreturned_date = todayStr();
    }
    if (merged.status === "returned") {
      merged.unreturned_date = todayStr();
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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const allSelected = visibleOrders.every((o) => prev.has(o.id));
      if (allSelected) return new Set();
      return new Set(visibleOrders.map((o) => o.id));
    });
  }

  async function handleBulkUpdate(patch: Partial<OrderInput>) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const { data, error } = await supabase.from(TABLE).update(patch).in("id", ids).select();
    if (error) {
      alert(error.message);
      return;
    }
    const updatedById = new Map((data as Order[]).map((o) => [o.id, o]));
    setOrders((prev) => prev.map((o) => updatedById.get(o.id) ?? o));
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`確定要刪除選取的 ${ids.length} 筆嗎？`)) return;
    const { error } = await supabase.from(TABLE).delete().in("id", ids);
    if (error) {
      alert(error.message);
      return;
    }
    setOrders((prev) => prev.filter((o) => !selectedIds.has(o.id)));
    setSelectedIds(new Set());
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">出貨單管理</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setOrderDate(shiftDate(orderDate, -1));
              setSelectedIds(new Set());
            }}
            aria-label="前一天"
            className="rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            ‹
          </button>
          <input
            type="date"
            value={orderDate}
            onChange={(e) => {
              setOrderDate(e.target.value);
              setSelectedIds(new Set());
            }}
            className="input w-auto"
          />
          <button
            type="button"
            onClick={() => {
              setOrderDate(shiftDate(orderDate, 1));
              setSelectedIds(new Set());
            }}
            aria-label="後一天"
            className="rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {ORDER_STATUSES.map((s) => (
          <FilterButton key={s} active={filter === s} onClick={() => setFilter(s)}>
            {ORDER_STATUS_LABEL[s]} ({counts[s]})
          </FilterButton>
        ))}
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          全部 ({counts.all})
        </FilterButton>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-300 bg-neutral-50 p-3">
          <span className="text-sm font-medium text-neutral-700">
            已選取 {selectedIds.size} 筆
          </span>

          <div className="flex flex-wrap gap-1">
            {drivers.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => void handleBulkUpdate({ driver_name: d.name })}
                className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-white"
              >
                {d.name}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              void handleBulkUpdate({ status: "unreturned", unreturned_date: todayStr() })
            }
            className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-white"
          >
            設為未回單
          </button>
          <button
            type="button"
            onClick={() =>
              void handleBulkUpdate({ status: "returned", unreturned_date: todayStr() })
            }
            className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-white"
          >
            設為已回單
          </button>
          <button
            type="button"
            onClick={() => void handleBulkUpdate({ out_of_county: true })}
            className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-white"
          >
            設為外縣市
          </button>
          <button
            type="button"
            onClick={() => void handleBulkUpdate({ out_of_county: false })}
            className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-white"
          >
            設為非外縣市
          </button>

          <button
            type="button"
            onClick={() => void handleBulkDelete()}
            className="rounded-full border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            刪除選取
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm text-neutral-400 hover:underline"
          >
            取消選取
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={
                    visibleOrders.length > 0 &&
                    visibleOrders.every((o) => selectedIds.has(o.id))
                  }
                  onChange={toggleSelectAllVisible}
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </th>
              <th className="px-3 py-2">單號</th>
              <th className="px-2 py-2">狀態</th>
              <th className="px-2 py-2">司機</th>
              <th className="px-2 py-2">外縣市</th>
              <th className="px-2 py-2">價格</th>
              <th className="px-3 py-2">{filter === "returned" ? "已回單日期" : "未回單日期"}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  載入中…
                </td>
              </tr>
            ) : visibleOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  這一天還沒有資料
                </td>
              </tr>
            ) : (
              visibleOrders.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  drivers={drivers}
                  selected={selectedIds.has(o.id)}
                  onToggleSelect={toggleSelect}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => setBatchModalOpen(true)}
          className="text-sm text-neutral-400 hover:text-neutral-600 hover:underline"
        >
          + 批次新增單號（超過 300 號時才需要）
        </button>
      </div>

      {batchModalOpen && (
        <BatchCreateModal
          orderDate={orderDate}
          minAvailable={nextAvailableNumber}
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
