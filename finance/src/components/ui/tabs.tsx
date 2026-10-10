"use client";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = T.Content;
export function TabsList({ className, ...p }: T.TabsListProps) {
  return <T.List className={cn("inline-flex rounded-full bg-sand p-1", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: T.TabsTriggerProps) {
  return <T.Trigger className={cn("rounded-full px-4 py-1.5 text-sm text-ink-2 transition-all duration-200 data-[state=active]:bg-card data-[state=active]:text-ink data-[state=active]:shadow-sm cursor-pointer", className)} {...p} />;
}
