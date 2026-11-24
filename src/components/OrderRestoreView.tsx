"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { adminSupabase } from "@/lib/supabase/adminClient";
import {
  describe,
  FIELD_LABEL,
  formatTime,
  formatValue,
  HISTORY_TABLE,
  HistoryEntry,
  isResetEntry,
} from "@/lib/orderHistory";
import { formatMinguoSlash, formatOrderNumber, Order } from "@/types/order";
import StatusBadge from "@/components/StatusBadge";

const ORDERS_TABLE = "JHDN_orders";
const ADMINS_TABLE = "JHDN_admins";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  initialDate: string;
  initialNumber: string;
}

// Admin page: look up one order, see every change to it, and put it back
// the way it was at any point. Sign-in is a Supabase Auth user listed in
// JHDN_admins; the everyday pages don't need (or see) this login.
export default function OrderRestoreView({ initialDate, initialNumber }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [adminChecked, setAdminChecked] = useState(false);

  useEffect(() => {
    void adminSupabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = adminSupabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      const { data } = await adminSupabase
        .from(ADMINS_TABLE)
        .select("display_name")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      setAdminName(data?.display_name ?? null);
      setAdminChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function handleLogout() {
    await adminSupabase.auth.signOut();
    setAdminName(null);
    setAdminChecked(false);
  }

  if (!authReady) {
    return <Shell><p className="text-neutral-400">載入中…</p></Shell>;
  }
  if (!session) {
    return <Shell><LoginForm /></Shell>;
  }
  if (!adminChecked) {
    return <Shell><p className="text-neutral-400">確認權限中…</p></Shell>;
  }
  if (!adminName) {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-xl border border-neutral-200 bg-white p-6">
          <p className="mb-4">這個帳號（{session.user.email}）沒有管理員權限。</p>
          <button type="button" onClick={handleLogout} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
            登出
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      right={
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <span>管理員：{adminName}</span>
          <button type="button" onClick={handleLogout} className="rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 hover:bg-neutral-50">
            登出
          </button>
        </div>
      }
    >
      <RestorePanel adminName={adminName} initialDate={initialDate} initialNumber={initialNumber} />
    </Shell>
  );
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 text-neutral-900 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">訂單紀錄與復原</h1>
            <Link href="/daily" className="text-sm text-neutral-500 underline hover:text-neutral-800">
              回每日訂單管理
            </Link>
          </div>
          {right}
        </div>
        {children}
      </div>
    </main>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await adminSupabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError("登入失敗，請確認 Email 和密碼。");
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-8">
      <div>
        <h2 className="text-xl font-bold">管理員登入</h2>
        <p className="mt-1 text-sm text-neutral-500">登入後才能看修改紀錄和復原訂單</p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm text-neutral-700">
        Email
        <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-neutral-700">
        密碼
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="h-12 rounded-md bg-neutral-900 font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
        {busy ? "登入中…" : "登入"}
      </button>
    </form>
  );
}

function priceText(o: Record<string, unknown>): string {
  for (const f of ["order_price", "cash_sale_price", "invoice_price"]) {
    if (o[f] !== null && o[f] !== undefined && o[f] !== "") {
      return `${FIELD_LABEL[f]} ${Number(o[f]).toLocaleString()}`;
    }
  }
  return "（空）";
}

function RestorePanel({
  adminName,
  initialDate,
  initialNumber,
}: {
  adminName: string;
  initialDate: string;
  initialNumber: string;
}) {
  const [dateInput, setDateInput] = useState(initialDate || localToday());
  const [numberInput, setNumberInput] = useState(initialNumber);
  const [query, setQuery] = useState<{ date: string; no: number } | null>(() => {
    const n = parseInt(initialNumber, 10);
    return initialDate && n > 0 ? { date: initialDate, no: n } : null;
  });
  const [order, setOrder] = useState<Order | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<HistoryEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (q: { date: string; no: number }) => {
    setLoading(true);
    setError(null);
    const [orderRes, historyRes] = await Promise.all([
      adminSupabase.from(ORDERS_TABLE).select("*").eq("order_date", q.date).eq("order_number", q.no).maybeSingle(),
      adminSupabase
        .from(HISTORY_TABLE)
        .select("*")
        .eq("order_date", q.date)
        .eq("order_number", q.no)
        .order("changed_at", { ascending: false })
        .order("id", { ascending: false }),
    ]);
    setLoading(false);
    if (orderRes.error || historyRes.error) {
      setError((orderRes.error ?? historyRes.error)!.message);
      return;
    }
    setOrder((orderRes.data as Order) ?? null);
    setEntries(historyRes.data as HistoryEntry[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (query) void load(query);
  }, [query, load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(numberInput, 10);
    if (!dateInput || !(n > 0)) {
      setError("請輸入日期和單號");
      return;
    }
    setNotice(null);
    setQuery({ date: dateInput, no: n });
    window.history.replaceState(null, "", `/history?date=${dateInput}&no=${n}`);
  }

  async function handleRestore(entry: HistoryEntry) {
    const { error } = await adminSupabase.rpc("jhdn_restore_order_version", { p_history_id: entry.id });
    if (error) throw new Error(error.message);
    setConfirming(null);
    setNotice(`已復原成 ${formatTime(entry.changed_at)} 的樣子。`);
    if (query) await load(query);
  }

  const current = order as unknown as Record<string, unknown> | null;
  const latestId = entries?.[0]?.id;

  return (
    <>
      <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-5">
        <label className="flex flex-col gap-1.5 text-sm text-neutral-600">
          日期
          <input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} className="input h-11" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-neutral-600">
          單號
          <input type="text" inputMode="numeric" value={numberInput} onChange={(e) => setNumberInput(e.target.value)} placeholder="例如 5" className="input h-11 w-32" />
        </label>
        <button type="submit" className="h-11 rounded-md bg-neutral-900 px-6 font-medium text-white hover:bg-neutral-700">
          查詢
        </button>
      </form>

      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
      {loading && <p className="text-neutral-400">載入中…</p>}

      {query && entries && !loading && (
        <>
          <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                <span className="font-mono text-2xl">{formatOrderNumber(query.no)}</span>
                　{formatMinguoSlash(query.date)}　目前內容
              </h2>
              {order?.updated_by && (
                <span className="text-sm text-neutral-500">
                  最後修改：{order.updated_by}　{formatTime(order.updated_at)}
                </span>
              )}
            </div>
            {current ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Field label="狀態">{order?.status ? <StatusBadge status={order.status} /> : "（空）"}</Field>
                <Field label="司機">{formatValue("driver_name", current.driver_name)}</Field>
                <Field label="外縣市">{formatValue("out_of_county", current.out_of_county)}</Field>
                <Field label="價格">{priceText(current)}</Field>
                <Field label="回單日期">{formatValue("unreturned_date", current.unreturned_date)}</Field>
              </div>
            ) : (
              <p className="text-neutral-500">這個單號目前不存在（可能被刪除了）。</p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              修改紀錄
              <span className="ml-3 text-sm font-normal text-neutral-500">
                最新的在最上面。按「復原成這個樣子」會把這張單改回那次修改完後的內容。
              </span>
            </h2>
            {entries.length === 0 ? (
              <p className="rounded-xl border border-neutral-200 bg-white p-5 text-neutral-500">
                這張單還沒有紀錄（115/11/24 下午之後的修改才會出現）。
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
                {entries.map((entry) => {
                  const reset = isResetEntry(entry);
                  const isCurrent = entry.id === latestId && entry.op !== "DELETE" && !!order;
                  return (
                    <li
                      key={entry.id}
                      className={`flex flex-wrap items-center gap-4 px-5 py-4 ${
                        entry.op === "DELETE" ? "bg-red-50" : reset ? "bg-orange-50" : ""
                      }`}
                    >
                      <div className="flex w-36 flex-col">
                        <span className="font-medium">{formatTime(entry.changed_at)}</span>
                        <span className="text-sm text-neutral-600">{entry.device ?? "未知"}</span>
                      </div>
                      <div className="min-w-0 flex-1 basis-72 leading-relaxed">
                        {reset && (
                          <span className="mb-1 inline-block rounded bg-orange-200 px-2 text-xs text-orange-900">
                            改回原始狀態
                          </span>
                        )}
                        {describe(entry).map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </div>
                      {isCurrent ? (
                        <span className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-sm text-neutral-600">目前的樣子</span>
                      ) : entry.op === "DELETE" ? null : (
                        <button
                          type="button"
                          onClick={() => setConfirming(entry)}
                          className="h-10 rounded-full border border-neutral-900 bg-white px-4 text-sm hover:bg-neutral-100"
                        >
                          復原成這個樣子
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-sm text-neutral-500">
              復原後會多一筆「還原（{adminName}）」的紀錄，復原錯了也可以再復原回來。
            </p>
          </section>
        </>
      )}

      {confirming && (
        <ConfirmRestoreModal
          entry={confirming}
          current={current}
          adminName={adminName}
          onCancel={() => setConfirming(null)}
          onConfirm={() => handleRestore(confirming)}
        />
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-xs text-neutral-500">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function ConfirmRestoreModal({
  entry,
  current,
  adminName,
  onCancel,
  onConfirm,
}: {
  entry: HistoryEntry;
  current: Record<string, unknown> | null;
  adminName: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = entry.new_row ?? {};
  const rows = Object.keys(FIELD_LABEL)
    .map((f) => ({
      field: f,
      label: FIELD_LABEL[f],
      before: current ? formatValue(f, current[f]) : "（不存在）",
      after: formatValue(f, target[f]),
      changed: !current || JSON.stringify(current[f] ?? null) !== JSON.stringify(target[f] ?? null),
    }))
    .filter((r) => r.changed);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="flex w-full max-w-xl flex-col gap-5 rounded-xl bg-white p-7 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-xl font-bold">
            把單號 {formatOrderNumber(entry.order_number)} 復原成 {formatTime(entry.changed_at)} 的樣子？
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            {formatMinguoSlash(entry.order_date)}　{entry.device ?? "未知"} 在這個時間改完後的內容
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-4 py-3 text-neutral-600">內容跟現在一樣，不需要復原。</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full border-collapse text-left">
              <thead className="bg-neutral-50 text-sm text-neutral-600">
                <tr>
                  <th className="px-4 py-2.5 font-medium">欄位</th>
                  <th className="px-4 py-2.5 font-medium">目前</th>
                  <th className="px-4 py-2.5 font-medium">復原後</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.field} className="border-t border-neutral-100 bg-orange-50">
                    <td className="px-4 py-2.5">{r.label}</td>
                    <td className="px-4 py-2.5">{r.before}</td>
                    <td className="px-4 py-2.5 font-semibold">{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-neutral-600">
          只列出會變動的欄位。復原會留下一筆「還原（{adminName}）」的紀錄，之後可以再復原回來。
        </p>
        {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="h-11 rounded-md border border-neutral-300 px-5 hover:bg-neutral-50">
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || rows.length === 0}
            className="h-11 rounded-md bg-neutral-900 px-5 font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? "復原中…" : "確定復原"}
          </button>
        </div>
      </div>
    </div>
  );
}
