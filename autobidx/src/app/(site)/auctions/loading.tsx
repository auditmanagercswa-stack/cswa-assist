import { CardSkeletonGrid } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><div className="mb-6 h-9 w-72 animate-pulse rounded bg-slate-200" /><CardSkeletonGrid count={9} /></div>;
}
