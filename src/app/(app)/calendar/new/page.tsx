import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { Card, CardHeader } from "@/components/ui/Card"
import { createEvent } from "../actions"

export const dynamic = "force-dynamic"

export default async function NewEventPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const seats = await db.roleAssignment.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    include: { role: { include: { organization: true } } },
  })
  const orgs = [...new Map(seats.map((s) => [s.role.organization.id, s.role.organization])).values()]

  if (orgs.length === 0) {
    return (
      <div className="max-w-2xl">
        <Card>
          <p className="text-sm text-text-2 py-4 text-center">
            You need an active club role to propose events.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-1">Propose an event</h1>
        <p className="text-sm text-text-2 mt-1">
          Submitting checks the shared calendar for conflicts and routes the
          proposal into the approval chain. It publishes once approved.
        </p>
      </div>

      <Card>
        <CardHeader title="Event details" />
        <form action={createEvent} className="space-y-4">
          <label className="block text-xs text-text-2">
            Club
            <select
              name="organizationId"
              required
              className="mt-1 h-9 w-full rounded border border-border px-2 text-sm text-text-1 bg-surface"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-text-2">
            Title
            <input
              name="title"
              required
              maxLength={200}
              placeholder="Spring Case Competition"
              className="mt-1 h-9 w-full rounded border border-border px-3 text-sm text-text-1"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-text-2">
              Starts
              <input
                type="datetime-local"
                name="startAt"
                required
                className="mt-1 h-9 w-full rounded border border-border px-3 text-sm text-text-1"
              />
            </label>
            <label className="block text-xs text-text-2">
              Ends
              <input
                type="datetime-local"
                name="endAt"
                required
                className="mt-1 h-9 w-full rounded border border-border px-3 text-sm text-text-1"
              />
            </label>
          </div>

          <label className="block text-xs text-text-2">
            Venue
            <input
              name="venue"
              placeholder="Schlegel Hall 203"
              className="mt-1 h-9 w-full rounded border border-border px-3 text-sm text-text-1"
            />
          </label>

          <label className="block text-xs text-text-2">
            Description
            <textarea
              name="description"
              rows={3}
              placeholder="What's happening and who should come."
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text-1"
            />
          </label>

          <button
            type="submit"
            className="h-9 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90"
          >
            Check conflicts &amp; submit
          </button>
        </form>
      </Card>
    </div>
  )
}
