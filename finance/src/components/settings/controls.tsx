"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Moon, Sun, Lock, Unlock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { setThemeAction } from "@/app/actions/prefs";
import { addMemberAction, lockFyAction, removeMemberAction, unlockBooksAction } from "@/app/actions/settings";

export function ThemeToggle({ dark }: { dark: boolean }) {
  const [pending, start] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => start(() => setThemeAction(dark ? "light" : "dark"))}>{dark ? <Sun /> : <Moon />} {dark ? "Use light theme" : "Use dark theme"}</Button>;
}

export function LockControls({ fy, fyLabel, lockedUpto, isOwner }: { fy: number; fyLabel: string; lockedUpto: string | null; isOwner: boolean }) {
  const [pending, start] = useTransition();
  if (!isOwner) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await lockFyAction(fy); if (r.ok) toast.success(`${fyLabel} locked`); else toast.error(r.error); })}><Lock /> Lock {fyLabel}</Button>
      {lockedUpto && <Button variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await unlockBooksAction(); if (r.ok) toast.success("Books unlocked"); else toast.error(r.error); })}><Unlock /> Unlock</Button>}
    </div>
  );
}

export function AddMember() {
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget; const f = new FormData(form);
      start(async () => { const r = await addMemberAction({ email: String(f.get("email")), role: String(f.get("role")) as "ACCOUNTANT" }); if (!r.ok) return void toast.error(r.error); toast.success("Added — they can sign in with their email"); form.reset(); });
    }}>
      <Input name="email" type="email" required placeholder="ca@firm.in" className="h-9 w-auto min-w-56 flex-1" aria-label="Email" />
      <Select name="role" className="h-9 w-auto" aria-label="Role"><option value="ACCOUNTANT">Accountant</option><option value="AUDITOR">Auditor (read-only)</option><option value="OWNER">Owner</option></Select>
      <Button size="sm" className="h-9" disabled={pending}>Add member</Button>
    </form>
  );
}

export function RemoveMember({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" aria-label="Remove member" disabled={pending} onClick={() => start(async () => { const r = await removeMemberAction(userId); if (!r.ok) toast.error(r.error); })}><Trash2 /></Button>;
}
