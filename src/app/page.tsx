import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">JHDN 出貨單管理</h1>
      <div className="flex w-full flex-col gap-3">
        <Link
          href="/daily"
          className="rounded-md bg-neutral-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-neutral-800"
        >
          每日訂單管理
        </Link>
        <Link
          href="/filter"
          className="rounded-md border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          依司機查詢
        </Link>
        <Link
          href="/order"
          className="rounded-md border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          依單號查詢
        </Link>
      </div>
    </div>
  );
}
