import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageFinance, canViewFinance, getUserContext } from "@/lib/rbac"
import { OrgTabs } from "@/components/OrgTabs"
import { FinanceDashboard } from "@/components/finance/FinanceDashboard"

export const dynamic = "force-dynamic"

const CURRENT_YEAR = "2026-2027"

export default async function FinancePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const org = await db.organization.findUnique({ where: { slug } })
  if (!org) notFound()

  // Finance is readable by the club's members (+ OSE); editing stays restricted.
  const ctx = await getUserContext(session.user.id)
  if (!canViewFinance(ctx, org)) notFound()
  const canManage = canManageFinance(ctx, org)

  const lines = await db.budgetLine.findMany({
    where: { organizationId: org.id, academicYear: CURRENT_YEAR },
    orderBy: [{ sortOrder: "asc" }, { category: "asc" }],
  })

  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-text-1">{org.name}</h1>
        <p className="mt-1 text-sm text-text-2">
          Finance — actual vs budget for {CURRENT_YEAR}, with editable forecasting.
        </p>
      </div>
      <OrgTabs slug={slug} />

      <FinanceDashboard
        slug={slug}
        canManage={canManage}
        lines={lines.map((l) => ({
          id: l.id,
          category: l.category,
          budgetedCents: l.budgetedCents,
          actualCents: l.actualCents,
          forecastCents: l.forecastCents,
          source: l.source,
          note: l.note,
        }))}
      />
    </div>
  )
}
