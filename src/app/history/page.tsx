import OrderRestoreView from "@/components/OrderRestoreView";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const date = typeof params.date === "string" ? params.date : "";
  const no = typeof params.no === "string" ? params.no : "";
  return <OrderRestoreView initialDate={date} initialNumber={no} />;
}
