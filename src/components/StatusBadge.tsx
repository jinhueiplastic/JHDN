import { ORDER_STATUS_LABEL, OrderStatus } from "@/types/order";

const STYLES: Record<OrderStatus, string> = {
  returned: "bg-green-100 text-green-800 border-green-300",
  unreturned: "bg-amber-100 text-amber-800 border-amber-300",
  voided: "bg-neutral-200 text-neutral-600 border-neutral-300",
};

export default function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
