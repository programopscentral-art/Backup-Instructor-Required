import { TableSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return <TableSkeleton rows={8} cols={6} />;
}
