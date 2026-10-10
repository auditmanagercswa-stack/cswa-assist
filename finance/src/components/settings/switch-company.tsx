"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setCompanyAction } from "@/app/actions/prefs";

export function SwitchCompany({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <Button size="sm" variant="outline" className="w-fit" disabled={pending} onClick={() => start(async () => { await setCompanyAction(id); router.push("/"); })}>Open company</Button>;
}
