import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getUserContext } from "@/lib/rbac"
import { ShellHeader } from "@/components/shell/ShellHeader"
import { SideNav } from "@/components/shell/SideNav"
import { signOutAction } from "./actions"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/signin")

  const ctx = await getUserContext(session.user.id)

  return (
    <>
      <ShellHeader
        userName={session.user.name ?? session.user.email ?? "User"}
        userEmail={session.user.email ?? undefined}
        onSignOut={signOutAction}
      />
      <SideNav showReports={ctx.institutionRoles.length > 0} />
      <main
        className="min-h-screen bg-base"
        style={{
          paddingTop: "var(--shell-height)",
          paddingLeft: "var(--sidenav-width)",
        }}
      >
        <div className="p-6">{children}</div>
      </main>
    </>
  )
}
