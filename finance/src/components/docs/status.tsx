import { Chip } from "@/components/ui/chip";
import type { DocStatus } from "@prisma/client";

export function DocStatusChip({ status, overdue }: { status: DocStatus; overdue?: number }) {
  if (status === "PAID") return <Chip tone="mint">Paid</Chip>;
  if (status === "CANCELLED") return <Chip>Cancelled</Chip>;
  if (status === "DRAFT") return <Chip tone="warn">Draft</Chip>;
  if (overdue !== undefined && overdue > 0) return <Chip tone="danger">{overdue}d overdue</Chip>;
  return status === "PARTIAL" ? <Chip tone="gold">Part paid</Chip> : <Chip tone="neutral">Due</Chip>;
}
