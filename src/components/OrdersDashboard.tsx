"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  formatOrderNumber,
  Order,
  ORDER_STATUS_LABEL,
  OrderInput,
  OrderStatus,
} from "@/types/order";
import { Driver } from "@/types/driver";
import OrderRow from "@/components/OrderRow";
import BatchCreateModal from "@/components/BatchCreateModal";
import NavMenu from "@/components/NavMenu";
import MinguoDateInput from "@/components/MinguoDateInput";

const TOTAL_ORDER_NUMBERS = 200;
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

function isSunday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

type FilterTab = "all" | OrderStatus | "needs_price" | "everything" | "needs_fee";

const VALID_FILTERS: FilterTab[] = [
  "all",
  "unreturned",
  "returned",
  "voided",
  "needs_price",
  "everything",
  "needs_fee",
];

function isValidFilterTab(value: string): value is FilterTab {
  return (VALID_FILTERS as string[]).includes(value);
}

// Someone picked 填單價 in the price dropdown but never actually typed a
// number in — distinct from never having touched the dropdown at all.
function needsPrice(o: Order): boolean {
  return o.status !== "voided" && o.price_field_option === "order_price" && o.order_price == null;
}

// 外縣市 orders that still haven't had a 運費 filled in.
function needsFee(o: Order): boolean {
  return o.status !== "voided" && o.out_of_county && o.out_of_county_fee == null;
}

const DATE_STORAGE_KEY = "jhdn_daily_order_date";
const FILTER_STORAGE_KEY = "jhdn_daily_filter";
const SCROLL_STORAGE_PREFIX = "jhdn_daily_scroll_";

// Finds whichever order-row is currently sitting just below the sticky
// toolbar, so we know what to scroll back to after a reload.
function getVisibleOrderNumber(): number | null {
  const rows = document.querySelectorAll<HTMLElement>('[id^="order-row-"]');
  const threshold = 160;
  let bestNum: number | null = null;
  let bestDist = Infinity;
  for (const el of rows) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const num = parseInt(el.id.replace("order-row-", ""), 10);
    if (Number.isNaN(num)) continue;
    const dist = Math.abs(rect.top - threshold);
    if (dist < bestDist) {
      bestDist = dist;
      bestNum = num;
    }
  }
  return bestNum;
}

export default function OrdersDashboard() {
  const [orderDate, setOrderDate] = useState(todayStr());
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const [showOldDrivers, setShowOldDrivers] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRestoredRef = useRef(false);

  // Restore the last-viewed date/tab from a previous visit. Reading
  // localStorage only after mount (not in the initial useState) keeps the
  // very first client render matching the server-rendered markup — this
  // effect corrects it a beat later instead of causing a hydration mismatch.
  useEffect(() => {
    const savedDate = localStorage.getItem(DATE_STORAGE_KEY);
    const savedFilter = localStorage.getItem(FILTER_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedDate) setOrderDate(savedDate);
    if (savedFilter && isValidFilterTab(savedFilter)) {
      setFilter(savedFilter);
      // Keep the tucked-away 作廢/全部 tabs expanded if that's where the
      // user was, so their active tab isn't hidden behind "..." on reload.
      if (savedFilter === "voided" || savedFilter === "everything") setShowMoreTabs(true);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(DATE_STORAGE_KEY, orderDate);
  }, [orderDate, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(FILTER_STORAGE_KEY, filter);
  }, [filter, hydrated]);

  // Remember which row is near the top of the viewport as the user scrolls,
  // so a reload can jump back to roughly the same spot.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    function handleScroll() {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        const num = getVisibleOrderNumber();
        if (num != null) {
          localStorage.setItem(`${SCROLL_STORAGE_PREFIX}${orderDate}_${filter}`, String(num));
        }
      }, 300);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timeout) clearTimeout(timeout);
    };
  }, [orderDate, filter]);

  // Once the (possibly restored) date/tab has actually finished loading,
  // jump back to the remembered row a single time — not on every later
  // filter switch within the same session, only right after a reload.
  useEffect(() => {
    if (!hydrated || loading || scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    const stored = localStorage.getItem(`${SCROLL_STORAGE_PREFIX}${orderDate}_${filter}`);
    if (!stored) return;
    requestAnimationFrame(() => {
      document.getElementById(`order-row-${stored}`)?.scrollIntoView({ block: "center" });
    });
  }, [hydrated, loading, orderDate, filter]);

  useEffect(() => {
    if (!hydrated) return;
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderDate, hydrated]);

  useEffect(() => {
    void loadDrivers();
  }, []);

  async function loadDrivers() {
    const { data, error } = await supabase
      .from(DRIVERS_TABLE)
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (error) {
      setError(`讀取司機名單失敗：${error.message}`);
      return;
    }
    setDrivers(data as Driver[]);
  }

  function defaultRow(n: number): OrderInput {
    return {
      order_date: orderDate,
      order_number: n,
      status: null,
      driver_name: null,
      out_of_county: false,
      out_of_county_reason: null,
      out_of_county_count: null,
      out_of_county_fee: null,
      price_field_option: null,
      order_price: null,
      cash_sale_price: null,
      invoice_price: null,
      shipped_date: null,
      unreturned_date: null,
      void_reason: null,
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

    // A date nobody has touched yet: provision all 200 slots up front as
    // 未回單 so the whole board is ready without a separate "batch create"
    // click. Once a date has any rows, leave it alone so deletions stick.
    // Only do this for today or earlier — opening a future date shouldn't
    // create it ahead of time (the 00:01 pg_cron job handles that on the day).
    // Sundays are skipped entirely — nobody works, so no auto orders.
    if (data.length === 0 && orderDate <= todayStr() && !isSunday(orderDate)) {
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

  // "all" means 未處理 (never-promoted, status === null); "everything" is
  // the literal full list regardless of status.
  const counts = useMemo(() => {
    const c: Record<FilterTab, number> = {
      all: 0,
      returned: 0,
      unreturned: 0,
      voided: 0,
      needs_price: 0,
      everything: orders.length,
      needs_fee: 0,
    };
    for (const o of orders) {
      if (o.status) c[o.status]++;
      else c.all++;
      if (needsPrice(o)) c.needs_price++;
      if (needsFee(o)) c.needs_fee++;
    }
    return c;
  }, [orders]);

  const visibleOrders = useMemo(() => {
    if (filter === "all") return orders.filter((o) => o.status === null);
    if (filter === "everything") return orders;
    if (filter === "needs_price") return orders.filter(needsPrice);
    if (filter === "needs_fee") return orders.filter(needsFee);
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  // Deleted (archived) drivers stay out of the picker by default — showing
  // them requires the "舊司機" toggle, but past orders keep their name
  // either way since driver_name is plain text, not a foreign key.
  const activeDrivers = useMemo(() => drivers.filter((d) => d.active), [drivers]);
  const oldDrivers = useMemo(() => drivers.filter((d) => !d.active), [drivers]);
  const visibleDrivers = showOldDrivers ? [...activeDrivers, ...oldDrivers] : activeDrivers;

  const nextAvailableNumber = useMemo(() => {
    // No rows yet (e.g. a Sunday, which no longer auto-provisions) still
    // assumes the usual 200-slot day as the baseline, so batch-create
    // starts right after where the daily auto-provisioning would have
    // left off instead of starting from 1.
    if (orders.length === 0) return TOTAL_ORDER_NUMBERS + 1;
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
      out_of_county_reason: order.out_of_county_reason,
      out_of_county_count: order.out_of_county_count,
      out_of_county_fee: order.out_of_county_fee,
      price_field_option: order.price_field_option,
      order_price: order.order_price,
      cash_sale_price: order.cash_sale_price,
      invoice_price: order.invoice_price,
      shipped_date: order.shipped_date,
      unreturned_date: order.unreturned_date,
      void_reason: order.void_reason,
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

  // Scrolls to a row already on the page instead of filtering the list down
  // to it — everything else stays visible, this just jumps the viewport.
  function handleJumpToOrder(e: React.FormEvent) {
    e.preventDefault();
    const num = parseInt(jumpValue, 10);
    if (!num) return;
    setJumpValue("");

    const el = document.getElementById(`order-row-${num}`);
    if (!el) {
      alert(`目前分頁找不到單號 ${formatOrderNumber(num)}`);
      return;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-amber-400");
    setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1500);
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

  async function handleBulkReset() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !confirm(
        `確定要把選取的 ${ids.length} 筆改回原始狀態嗎？（狀態、司機、外縣市、價格、未回單日期都會被清空）`
      )
    )
      return;
    await handleBulkUpdate({
      status: null,
      driver_name: null,
      out_of_county: false,
      out_of_county_reason: null,
      out_of_county_count: null,
      out_of_county_fee: null,
      price_field_option: null,
      order_price: null,
      cash_sale_price: null,
      invoice_price: null,
      shipped_date: null,
      unreturned_date: null,
      void_reason: null,
    });
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

  // A real <table>'s <thead>/<th> renders out of place in some browsers, so
  // header + every row share a single CSS Grid to keep columns aligned. The
  // header grid lives inside the sticky toolbar itself (not sticky on its
  // own with a measured offset) so it rides along glued to the title/tabs
  // with zero gap, instead of needing its own top-offset math to stay in sync.
  const gridTemplateColumns =
    "2.5rem 5.5rem 6rem 11rem minmax(14rem,1fr) 13rem 7rem 4rem";
  const thClass = "px-2 py-2 text-neutral-500";

  return (
    <div className="mx-auto w-full max-w-[1296px] px-4 pt-8 pb-8">
      <div className="sticky top-0 z-30 -mx-4 bg-neutral-50 px-4 pb-2">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <NavMenu />
            <h1 className="text-xl font-semibold">出貨單管理</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setOrderDate(shiftDate(orderDate, -1));
                setSelectedIds(new Set());
              }}
              aria-label="前一天"
              className="flex h-11 w-11 items-center justify-center rounded-md border border-neutral-300 text-xl text-neutral-600 hover:bg-neutral-50"
            >
              ‹
            </button>
            <MinguoDateInput
              value={orderDate}
              onChange={(v) => {
                setOrderDate(v);
                setSelectedIds(new Set());
              }}
              className="w-32 text-lg font-semibold"
            />
            <button
              type="button"
              onClick={() => {
                setOrderDate(shiftDate(orderDate, 1));
                setSelectedIds(new Set());
              }}
              aria-label="後一天"
              className="flex h-11 w-11 items-center justify-center rounded-md border border-neutral-300 text-xl text-neutral-600 hover:bg-neutral-50"
            >
              ›
            </button>
          </div>
        </div>
  
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
              未處理 ({counts.all})
            </FilterButton>
            <FilterButton active={filter === "unreturned"} onClick={() => setFilter("unreturned")}>
              {ORDER_STATUS_LABEL.unreturned} ({counts.unreturned})
            </FilterButton>
            <FilterButton active={filter === "returned"} onClick={() => setFilter("returned")}>
              {ORDER_STATUS_LABEL.returned} ({counts.returned})
            </FilterButton>
            <FilterButton
              active={filter === "needs_price"}
              onClick={() => setFilter("needs_price")}
            >
              填單價 ({counts.needs_price})
            </FilterButton>
            <FilterButton active={filter === "needs_fee"} onClick={() => setFilter("needs_fee")}>
              填運費 ({counts.needs_fee})
            </FilterButton>
            <button
              type="button"
              onClick={() => setShowMoreTabs((v) => !v)}
              aria-label={showMoreTabs ? "收起更多分頁" : "更多分頁"}
              className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-500 hover:bg-neutral-50"
            >
              {showMoreTabs ? "‹" : "..."}
            </button>
            {showMoreTabs && (
              <>
                <FilterButton active={filter === "voided"} onClick={() => setFilter("voided")}>
                  {ORDER_STATUS_LABEL.voided} ({counts.voided})
                </FilterButton>
                <FilterButton
                  active={filter === "everything"}
                  onClick={() => setFilter("everything")}
                >
                  全部 ({counts.everything})
                </FilterButton>
              </>
            )}
            {oldDrivers.length > 0 && (
              <button
                type="button"
                onClick={() => setShowOldDrivers((v) => !v)}
                className="rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-400 hover:bg-neutral-50"
              >
                {showOldDrivers ? "‹ 舊司機" : "舊司機..."}
              </button>
            )}
          </div>
          <form onSubmit={handleJumpToOrder} className="flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              placeholder="跳到單號"
              className="input w-24 py-1 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              跳到
            </button>
          </form>
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
              {visibleDrivers.map((d) => (
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
              onClick={() =>
                void handleBulkUpdate({
                  out_of_county: false,
                  out_of_county_reason: null,
                  out_of_county_count: null,
                  out_of_county_fee: null,
                })
              }
              className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-white"
            >
              設為非外縣市
            </button>
            <button
              type="button"
              onClick={() => void handleBulkReset()}
              className="rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-white"
            >
              設為原始狀態
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

        <div
          className="grid min-w-[970px] rounded-t-lg border border-neutral-200 bg-neutral-50 text-left text-sm"
          style={{ gridTemplateColumns }}
        >
          <div className={thClass}>
            <input
              type="checkbox"
              checked={
                visibleOrders.length > 0 &&
                visibleOrders.every((o) => selectedIds.has(o.id))
              }
              onChange={toggleSelectAllVisible}
              className="h-4 w-4 rounded border-neutral-300"
            />
          </div>
          <div className={thClass}>單號</div>
          <div className={thClass}>狀態</div>
          <div className={thClass}>外縣市</div>
          <div className={thClass}>司機</div>
          <div className={thClass}>價格</div>
          <div className={thClass}>
            {filter === "returned"
              ? "已回單日期"
              : filter === "voided"
                ? "作廢原因"
                : "未回單日期"}
          </div>
          <div className={thClass}></div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-b-lg border border-t-0 border-neutral-200 bg-white">
        <div
          className="grid min-w-[970px] text-left text-sm"
          style={{ gridTemplateColumns }}
        >
          {loading ? (
            <div
              style={{ gridColumn: "1 / -1" }}
              className="px-4 py-6 text-center text-neutral-400"
            >
              載入中…
            </div>
          ) : visibleOrders.length === 0 ? (
            <div
              style={{ gridColumn: "1 / -1" }}
              className="px-4 py-6 text-center text-neutral-400"
            >
              這一天還沒有資料
            </div>
          ) : (
            visibleOrders.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                drivers={visibleDrivers}
                selected={selectedIds.has(o.id)}
                onToggleSelect={toggleSelect}
                onUpdate={handleUpdate}
              />
            ))
          )}
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => setBatchModalOpen(true)}
          className="text-sm text-neutral-400 hover:text-neutral-600 hover:underline"
        >
          + 批次新增單號（超過 200 號時才需要）
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
