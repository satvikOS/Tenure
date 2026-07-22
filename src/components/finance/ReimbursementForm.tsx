"use client"

import { Card, CardHeader } from "@/components/ui/Card"
import { submitReimbursement } from "@/app/(app)/orgs/[slug]/finance/actions"

/**
 * Member-facing reimbursement request. Not a finance-manager action — anyone
 * with an active club seat can file one. It routes through the normal approval
 * chain and, on final approval, auto-posts a spend to the ledger against the
 * chosen line (see submitReimbursement + the actOnApproval hook).
 */
export function ReimbursementForm({
  slug,
  lines,
}: {
  slug: string
  lines: { id: string; category: string }[]
}) {
  if (lines.length === 0) return null
  const submit = submitReimbursement.bind(null, slug)

  return (
    <Card>
      <CardHeader
        title="Request a reimbursement"
        subtitle="Get paid back for a club expense. It routes through approval and, once approved, posts to the ledger against the line you pick."
      />
      <form action={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-2">
          Budget line
          <select
            name="budgetLineId"
            required
            className="h-9 rounded border border-border bg-surface px-2 text-sm text-text-1"
          >
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.category}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-2">
          Amount
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="0.00"
            className="h-9 rounded border border-border bg-surface px-2 text-sm text-text-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-2 sm:col-span-2">
          What is this for?
          <input
            name="description"
            required
            maxLength={140}
            placeholder="e.g. Printing for the case competition"
            className="h-9 rounded border border-border bg-surface px-2 text-sm text-text-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-2 sm:col-span-2">
          Receipt <span className="text-text-3">(required once document storage is configured)</span>
          <input
            name="receipt"
            type="file"
            className="text-sm text-text-2 file:mr-3 file:rounded file:border-0 file:bg-base file:px-3 file:py-1.5 file:text-sm file:text-text-1"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="h-9 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:bg-[--primary-hover]"
          >
            Submit request
          </button>
        </div>
      </form>
    </Card>
  )
}
