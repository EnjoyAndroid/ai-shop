import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "./db";
import { requireSecret } from "./security-config";
import { authenticateCredentials } from "./authenticate";

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  secret: requireSecret("NEXTAUTH_SECRET"),
  trustHost: true,
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  cookies: {
    sessionToken: { name: "next-auth.session-token", options: { httpOnly: true, sameSite: "strict", path: "/", secure: process.env.NODE_ENV === "production" } },
    csrfToken: { name: "next-auth.csrf-token", options: { httpOnly: true, sameSite: "strict", path: "/", secure: process.env.NODE_ENV === "production" } },
  },
  pages: { signIn: "/login", error: "/login" },
  providers: [CredentialsProvider({
    credentials: { account: {}, password: {}, captchaToken: {} },
    authorize: authenticateCredentials,
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion;
      }
      if (typeof token.id !== "string") return null;
      const current = await prisma.user.findUnique({ where: { id: token.id }, select: { status: true, sessionVersion: true } });
      if (!current || current.status !== "ACTIVE" || current.sessionVersion !== token.sessionVersion) return null;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") session.user.id = token.id;
      return session;
    },
  },
}));
