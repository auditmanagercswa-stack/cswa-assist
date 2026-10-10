import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { EmailConfig } from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

/**
 * Email magic link without an SMTP dependency: in development the link is printed
 * to the server console. Set EMAIL_WEBHOOK_URL to POST {to, url} to your mail
 * service (Resend, SES, …) in production.
 */
const emailProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  maxAge: 15 * 60,
  from: process.env.EMAIL_FROM ?? "books@localhost",
  async sendVerificationRequest({ identifier, url }) {
    if (process.env.EMAIL_WEBHOOK_URL) {
      await fetch(process.env.EMAIL_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: identifier, url }) });
      return;
    }
    console.log(`\n[auth] Sign-in link for ${identifier}:\n${url}\n`);
  },
  options: {},
};

const providers: NextAuthConfig["providers"] = [emailProvider];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google);

/** One-click demo sign-in for local development and Playwright. Never enable in production. */
if (process.env.ALLOW_DEMO_LOGIN === "true") {
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo",
      credentials: {},
      async authorize() {
        const u = await db.user.findUnique({ where: { email: "owner@demo.in" } });
        return u ? { id: u.id, email: u.email, name: u.name } : null;
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: { signIn: "/login", verifyRequest: "/login?sent=1" },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
});
