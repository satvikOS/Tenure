import NextAuth from "next-auth"
import Okta from "next-auth/providers/okta"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { db } from "@/lib/db"

// Pilot-only sign-in: pick a seeded demo user by email, no password.
// Enabled via AUTH_DEV_LOGIN=true — remove once Okta is configured.
const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // JWT sessions: required for the Credentials provider, and works for Okta too
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [
    Okta({
      clientId: process.env.OKTA_CLIENT_ID!,
      clientSecret: process.env.OKTA_CLIENT_SECRET!,
      issuer: process.env.OKTA_ISSUER!,
    }),
    ...(devLoginEnabled
      ? [
          Credentials({
            id: "dev-login",
            name: "Pilot demo user",
            credentials: { email: { label: "Email", type: "email" } },
            async authorize(credentials) {
              const email = credentials?.email
              if (typeof email !== "string") return null
              const user = await db.user.findUnique({ where: { email } })
              if (!user) return null
              return { id: user.id, name: user.name, email: user.email, image: user.image }
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id
      return token
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
})
