"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setFiledAction } from "@/app/actions/compliance";

export function FiledToggle({ id, filed }: { id: string; filed: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant={filed ? "ghost" : "outline"} disabled={pending} aria-pressed={filed}
      onClick={() => start(async () => { const r = await setFiledAction(id, !filed); if (!r.ok) toast.error(r.error); })}>
      {filed ? <><Check /> Filed</> : "Mark filed"}
    </Button>
  );
}
