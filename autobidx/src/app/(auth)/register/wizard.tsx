"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Clock, ShieldAlert, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { BUSINESS_TYPES } from "@/lib/validation";
import { humanize } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { KycForm, type KycInitial } from "@/components/forms/kyc-form";

type Opt = { id: string; name: string; slug?: string; pincode?: string | null };
const STEPS = ["Account", "Business", "KYC", "Verification"];

export function RegisterWizard(props: {
  initialStep: number;
  states: Opt[];
  individualEnabled: boolean;
  requiredDocs: string[];
  requireGstin: boolean;
  kyc: (KycInitial & { status: string; reviewNotes: string | null }) | null;
  dealerStatus: string | null;
  statusReason: string | null;
  signedInAs: { name: string; dealer: string | null; emailVerified: boolean; phoneVerified: boolean } | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(props.initialStep);
  const [a, setA] = useState({ name: "", phone: "", email: "", password: "" });
  const [b, setB] = useState({ dealershipName: "", businessType: "PROPRIETORSHIP", gstin: "", pan: "", addressLine: "", stateId: props.states[0]?.id ?? "", districtId: "", cityId: "", pincode: "" });
  const [accept, setAccept] = useState(false);
  const [districts, setDistricts] = useState<Opt[]>([]);
  const [cities, setCities] = useState<Opt[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!b.stateId) return;
    api<{ items: Opt[] }>(`/api/locations/districts?stateId=${b.stateId}`).then(({ data }) => setDistricts(data?.items ?? []));
  }, [b.stateId]);
  useEffect(() => {
    if (!b.districtId) return setCities([]);
    api<{ items: Opt[] }>(`/api/locations/cities?districtId=${b.districtId}`).then(({ data }) => setCities(data?.items ?? []));
  }, [b.districtId]);

  const setAv = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLInputElement>) => setA((x) => ({ ...x, [k]: e.target.value }));
  const setBv = (k: keyof typeof b) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setB((x) => ({ ...x, [k]: e.target.value }));

  function validateStep1() {
    const e: Record<string, string> = {};
    if (a.name.trim().length < 2) e.name = "Enter your full name";
    if (!/^(\+91|0)?[6-9]\d{9}$/.test(a.phone.replace(/[\s-]/g, ""))) e.phone = "Enter a valid 10-digit mobile number";
    if (!/^\S+@\S+\.\S+$/.test(a.email)) e.email = "Enter a valid email";
    if (a.password.length < 8 || !/[A-Za-z]/.test(a.password) || !/\d/.test(a.password)) e.password = "At least 8 characters with letters and numbers";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submitRegistration() {
    setFormErr(null);
    if (!accept) return setFormErr("Please accept the Dealer Agreement and Terms.");
    setBusy(true);
    const { error } = await api("/api/auth/register", { body: { ...a, ...b, cityId: b.cityId || null, acceptTerms: true } });
    setBusy(false);
    if (error) {
      const fields = error.details?.fields ?? {};
      setErrors(fields);
      if (["name", "phone", "email", "password"].some((k) => fields[k])) setStep(1);
      return setFormErr(error.message);
    }
    router.refresh();
    setStep(3);
  }

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-[28px] font-bold text-ink-900 sm:text-[32px]">Join AutoBidX as a dealer</h1>
      <p className="mt-1 text-sm text-slate-500">Register in minutes. Verified dealers can list, bid and buy across India.</p>
      <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Registration progress">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = step > n;
          return (
            <li key={s} className="flex flex-col gap-1.5">
              <div className={cn("h-1.5 rounded-full", done || step === n ? "bg-ignite-500" : "bg-slate-200")} />
              <div className={cn("flex items-center gap-1 text-[12px] font-semibold", step === n ? "text-ink-900" : "text-slate-400")}>{done && <Check className="h-3.5 w-3.5 text-verified-500" />}{n}. {s}</div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
        {step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); if (validateStep1()) setStep(2); }} className="space-y-4">
            <h2 className="font-sans text-lg font-bold">Basic information</h2>
            <Field label="Full name" error={errors.name} required><Input value={a.name} onChange={setAv("name")} autoComplete="name" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile number" error={errors.phone} required><Input value={a.phone} onChange={setAv("phone")} inputMode="tel" autoComplete="tel" placeholder="98470 12345" /></Field>
              <Field label="Email" error={errors.email} required><Input type="email" value={a.email} onChange={setAv("email")} autoComplete="email" /></Field>
            </div>
            <Field label="Password" error={errors.password} hint="At least 8 characters, with letters and numbers" required><Input type="password" value={a.password} onChange={setAv("password")} autoComplete="new-password" /></Field>
            <Button type="submit" size="lg" block>Continue</Button>
            <p className="text-center text-sm text-slate-600">Already registered? <Link href="/login" className="font-semibold underline">Sign in</Link></p>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={(e) => { e.preventDefault(); submitRegistration(); }} className="space-y-4">
            <h2 className="font-sans text-lg font-bold">Business information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dealership name" error={errors.dealershipName} required className="sm:col-span-2"><Input value={b.dealershipName} onChange={setBv("dealershipName")} /></Field>
              <Field label="Business type" error={errors.businessType} required>
                <Select value={b.businessType} onChange={setBv("businessType")}>{BUSINESS_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select>
              </Field>
              <Field label="GSTIN" error={errors.gstin} required={props.requireGstin}><Input value={b.gstin} onChange={(e) => setB((x) => ({ ...x, gstin: e.target.value.toUpperCase() }))} placeholder="32ABCDE1234F1Z5" maxLength={15} /></Field>
              <Field label="Business PAN" error={errors.pan} required><Input value={b.pan} onChange={(e) => setB((x) => ({ ...x, pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" maxLength={10} /></Field>
              <Field label="Pincode" error={errors.pincode} required><Input value={b.pincode} onChange={setBv("pincode")} inputMode="numeric" maxLength={6} /></Field>
              <Field label="Address" error={errors.addressLine} required className="sm:col-span-2"><Input value={b.addressLine} onChange={setBv("addressLine")} placeholder="Building, street, area" /></Field>
              <Field label="State" error={errors.stateId} required>
                <Select value={b.stateId} onChange={(e) => setB((x) => ({ ...x, stateId: e.target.value, districtId: "", cityId: "" }))}>{props.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              </Field>
              <Field label="District" error={errors.districtId} required>
                <Select value={b.districtId} onChange={(e) => setB((x) => ({ ...x, districtId: e.target.value, cityId: "" }))}><option value="">Select district</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
              </Field>
              <Field label="City" className="sm:col-span-2">
                <Select value={b.cityId} onChange={(e) => { const c = cities.find((x) => x.id === e.target.value); setB((x) => ({ ...x, cityId: e.target.value, pincode: x.pincode || c?.pincode || "" })); }}><option value="">Select city (optional)</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              </Field>
            </div>
            <Checkbox checked={accept} onChange={(e) => setAccept(e.target.checked)} label={<>I agree to the <Link href="/pages/dealer-agreement" target="_blank" className="font-semibold underline">Dealer Agreement</Link>, <Link href="/pages/terms" target="_blank" className="font-semibold underline">Terms</Link> and <Link href="/pages/privacy" target="_blank" className="font-semibold underline">Privacy Policy</Link>.</>} />
            {formErr && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-[13.5px] text-red-700" role="alert">{formErr}</div>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>Back</Button>
              <Button type="submit" size="lg" className="flex-1" loading={busy}>Create account</Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div>
            <h2 className="font-sans text-lg font-bold">KYC verification</h2>
            <p className="mb-6 mt-1 text-[13.5px] text-slate-500">Upload your documents to unlock bidding, buying and selling. You can save a draft and finish later from your dashboard.</p>
            {props.kyc?.reviewNotes && props.dealerStatus === "REJECTED" && <div className="mb-5 rounded-lg bg-red-50 p-3 text-[13.5px] text-red-700"><b>Changes requested:</b> {props.kyc.reviewNotes}</div>}
            <KycForm initial={props.kyc} required={props.requiredDocs} onSubmitted={() => setStep(4)} />
            <div className="mt-4 text-center"><Link href="/dashboard" className="text-[13px] font-semibold text-slate-500 underline">Skip for now — go to dashboard</Link></div>
          </div>
        )}

        {step === 4 && <StatusStep status={props.dealerStatus ?? "UNDER_REVIEW"} reason={props.statusReason} signedIn={props.signedInAs} />}
      </div>
      {props.individualEnabled && step === 1 && <p className="mt-4 text-center text-[13px] text-slate-500">Not a dealer? Individual buyer registration is available — contact support.</p>}
    </div>
  );
}

function StatusStep({ status, reason, signedIn }: { status: string; reason: string | null; signedIn: { emailVerified: boolean; phoneVerified: boolean } | null }) {
  const map: Record<string, { icon: typeof Clock; title: string; body: string; tone: string }> = {
    PENDING: { icon: Clock, title: "Pending", body: "Your account is created. Submit KYC documents to start verification.", tone: "text-slate-600 bg-slate-100" },
    UNDER_REVIEW: { icon: Clock, title: "Under review", body: "Our team is reviewing your documents. This usually takes less than one business day. We'll notify you by email and in-app.", tone: "text-blue-700 bg-blue-50" },
    VERIFIED: { icon: CheckCircle2, title: "Verified", body: "Your dealership is verified. You can list vehicles, bid in auctions and buy.", tone: "text-verified-600 bg-verified-50" },
    REJECTED: { icon: XCircle, title: "Rejected", body: reason ?? "Some documents need attention. Update your KYC and resubmit.", tone: "text-red-700 bg-red-50" },
    SUSPENDED: { icon: ShieldAlert, title: "Suspended", body: reason ?? "Your dealership is suspended. Contact support.", tone: "text-red-700 bg-red-50" },
  };
  const s = map[status] ?? map.UNDER_REVIEW;
  return (
    <div className="text-center">
      <div className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-2xl", s.tone)}><s.icon className="h-8 w-8" /></div>
      <div className="mt-4 text-[12px] font-bold uppercase tracking-wider text-slate-400">Verification status</div>
      <h2 className="mt-1 font-sans text-2xl font-bold text-ink-900">{s.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[14px] text-slate-600">{s.body}</p>
      <ol className="mx-auto mt-6 flex max-w-md justify-between text-[11.5px] font-semibold text-slate-500">
        {["Pending", "Under Review", "Verified"].map((x, i) => {
          const order = ["PENDING", "UNDER_REVIEW", "VERIFIED"].indexOf(status);
          return <li key={x} className={cn("flex items-center gap-1", i <= order && "text-verified-600")}>{i <= order ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border-2 border-slate-300" />}{x}</li>;
        })}
      </ol>
      {signedIn && (!signedIn.emailVerified || !signedIn.phoneVerified) && <p className="mt-6 text-[13px] text-amber-700">Also verify your {!signedIn.emailVerified ? "email" : ""}{!signedIn.emailVerified && !signedIn.phoneVerified ? " and " : ""}{!signedIn.phoneVerified ? "mobile number" : ""}. <Link href="/verify" className="font-semibold underline">Verify now</Link></p>}
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        {status === "REJECTED" || status === "PENDING" ? <ButtonLink href="/register?step=3" variant="primary">Update KYC</ButtonLink> : null}
        <ButtonLink href="/dashboard" variant="dark">Go to dashboard</ButtonLink>
        <ButtonLink href="/vehicles" variant="outline">Browse vehicles</ButtonLink>
      </div>
    </div>
  );
}
