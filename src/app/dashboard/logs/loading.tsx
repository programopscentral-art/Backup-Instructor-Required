import { TableSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return <TableSkeleton rows={9} cols={4} />;
}
