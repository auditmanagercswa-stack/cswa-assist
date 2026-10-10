import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; next?: string; error?: string }> }) {
  const sp = await searchParams;
  if ((await auth())?.user) redirect(sp.next || "/");
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/";
  const google = !!process.env.AUTH_GOOGLE_ID;
  const demo = process.env.ALLOW_DEMO_LOGIN === "true";

  return (
    <main className="grid min-h-dvh place-items-center bg-cream px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-forest font-display text-2xl text-gold">₹</div>
          <h1 className="text-4xl text-ink">Chat in. <em className="text-gold">Books</em> out.</h1>
          <p className="mt-2 text-sm text-ink-2">Tell us what happened in the business. We draft the entries, keep GST and TDS dates in view.</p>
        </div>
        <Card className="grid gap-4 p-6">
          {sp.sent ? (
            <p className="rounded-2xl bg-sand p-4 text-sm text-ink">Check your email for a sign-in link. It expires in 15 minutes.</p>
          ) : (
            <form className="grid gap-3" action={async (f) => { "use server"; await signIn("email", { email: String(f.get("email")), redirectTo: next }); }}>
              <label className="grid gap-1.5 text-xs font-medium text-ink-2">Work email<Input type="email" name="email" required placeholder="you@business.in" autoComplete="email" /></label>
              <Button type="submit" size="lg">Email me a sign-in link</Button>
            </form>
          )}
          {google && (
            <form action={async () => { "use server"; await signIn("google", { redirectTo: next }); }}>
              <Button variant="outline" size="lg" className="w-full">Continue with Google</Button>
            </form>
          )}
          {demo && (
            <form action={async () => { "use server"; await signIn("demo", { redirectTo: next }); }} className="border-t border-hairline pt-4">
              <Button variant="gold" size="lg" className="w-full" data-testid="demo-login">Explore the demo company</Button>
              <p className="mt-2 text-center text-xs text-ink-3">Signs in as owner@demo.in · AUDIT TEST TRADERS</p>
            </form>
          )}
          {sp.error && <p className="text-sm text-danger">Sign-in didn&apos;t work. Try again or use another method.</p>}
        </Card>
      </div>
    </main>
  );
}
