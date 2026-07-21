import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { requireAdminContext } from "@/lib/admin/guard"
import { hasCapability } from "@/lib/admin/capabilities"
import { Card } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { EmptyState } from "@/components/ui/EmptyState"
import { ScrollText } from "@/components/ui/icons"

export const metadata: Metadata = { title: "Admin · Audit log" }
export const dynamic = "force-dynamic"

export default async function AdminAuditPage() {
  const { ctx, institutionId } = await requireAdminContext()
  if (!hasCapability(ctx, "audit.view", institutionId)) notFound()

  const events = await db.auditEvent.findMany({
    where: { institutionId },
    orderBy: { occurredAt: "desc" },
    take: 150,
  })

  const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))]
  const actorNames = new Map<string, string>()
  if (actorIds.length) {
    for (const u of await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    }))
      actorNames.set(u.id, u.name ?? u.email ?? "Unknown")
  }

  const orgIds = [...new Set(events.map((e) => e.organizationId).filter((x): x is string => !!x))]
  const orgNames = new Map<string, string>()
  if (orgIds.length) {
    for (const o of await db.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    }))
      orgNames.set(o.id, o.name)
  }

  return (
    <Card padding="none">
      <div className="border-b border-border p-5">
        <h2 className="font-display text-base font-semibold text-text-1">Audit log</h2>
        <p className="mt-1 text-sm text-text-2">
          Append-only record of privileged actions — every allow and deny across the institution.
        </p>
      </div>

      {events.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit events yet" description="Administrative actions will appear here as they happen." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-text-3">
                <th className="px-5 py-2.5 font-medium">When</th>
                <th className="px-5 py-2.5 font-medium">Actor</th>
                <th className="px-5 py-2.5 font-medium">Action</th>
                <th className="px-5 py-2.5 font-medium">Resource</th>
                <th className="px-5 py-2.5 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 text-[13px] text-text-3">
                    {e.occurredAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-5 py-2.5 text-text-1">
                    {e.actorId ? actorNames.get(e.actorId) ?? "Unknown" : "System"}
                    {e.actorRole && <span className="ml-1 text-[13px] text-text-3">({e.actorRole.replace("OSE_", "")})</span>}
                  </td>
                  <td className="px-5 py-2.5 font-medium text-text-1">{e.action}</td>
                  <td className="px-5 py-2.5 text-[13px] text-text-2">
                    {e.organizationId ? orgNames.get(e.organizationId) ?? e.resourceType : e.resourceType}
                  </td>
                  <td className="px-5 py-2.5">
                    <Badge variant={e.outcome === "DENY" ? "error" : "success"}>
                      {e.outcome.toLowerCase()}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
