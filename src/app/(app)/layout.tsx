import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { ShellHeader } from "@/components/shell/ShellHeader"
import { SideNav } from "@/components/shell/SideNav"
import { Footer } from "@/components/shell/Footer"
import { AIProvider } from "@/components/ai/AIProvider"
import { TenureAIPanel } from "@/components/ai/TenureAIPanel"
import { signOutAction } from "./actions"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/signin")

  const [ctx, unreadNotifications] = await Promise.all([
    getUserContext(session.user.id),
    db.notification.count({ where: { userId: session.user.id, readAt: null } }),
  ])

  return (
    <AIProvider>
      <ShellHeader
        userName={session.user.name ?? session.user.email ?? "User"}
        userEmail={session.user.email ?? undefined}
        unreadNotifications={unreadNotifications}
        onSignOut={signOutAction}
      />
      <SideNav
        showReports={ctx.institutionRoles.length > 0}
        showAdmin={ctx.institutionRoles.length > 0}
      />
      <main
        className="min-h-screen bg-base"
        style={{
          paddingTop: "var(--shell-height)",
          paddingLeft: "var(--sidenav-width)",
          // Room for the hardened (fixed) footer so content never hides beneath it.
          paddingBottom: "var(--footer-height)",
        }}
      >
        {/* Width and gutters live here, not on every page, so the whole app
            responds to the viewport consistently. */}
        <div className="page-shell py-7 sm:py-8">{children}</div>
      </main>
      {/* Hardened frame: header + side nav + footer stay put; only this main
          content region scrolls. */}
      <Footer />
      <TenureAIPanel />
    </AIProvider>
  )
}
