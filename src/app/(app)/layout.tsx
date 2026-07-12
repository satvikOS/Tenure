import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { ShellHeader } from "@/components/shell/ShellHeader"
import { SideNav } from "@/components/shell/SideNav"
import { Footer } from "@/components/shell/Footer"
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
    <>
      <ShellHeader
        userName={session.user.name ?? session.user.email ?? "User"}
        userEmail={session.user.email ?? undefined}
        unreadNotifications={unreadNotifications}
        onSignOut={signOutAction}
      />
      <SideNav showReports={ctx.institutionRoles.length > 0} />
      <main
        className="min-h-screen bg-base flex flex-col"
        style={{
          paddingTop: "var(--shell-height)",
          paddingLeft: "var(--sidenav-width)",
        }}
      >
        <div className="flex-1 px-6 pt-6 xl:px-10">{children}</div>
        <div className="px-6 xl:px-10">
          <Footer />
        </div>
      </main>
    </>
  )
}
