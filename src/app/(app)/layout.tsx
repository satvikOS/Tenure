import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { ShellHeader } from "@/components/shell/ShellHeader"
import { SideNav } from "@/components/shell/SideNav"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/signin")

  return (
    <>
      <ShellHeader userName={session.user.name ?? session.user.email ?? "User"} />
      <SideNav />
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
