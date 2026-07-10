import { ShellHeader } from "@/components/shell/ShellHeader"
import { SideNav } from "@/components/shell/SideNav"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <ShellHeader userName="Satvik A." />
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
