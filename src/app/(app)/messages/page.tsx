import Link from "next/link"
import { redirect } from "next/navigation"
import { Hash, Megaphone, MessageSquare, FileCheck, PenSquare } from "@/components/ui/icons"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { Card, CardHeader } from "@/components/ui/Card"
import { openBoardChannel, sendBroadcast } from "./actions"

export const dynamic = "force-dynamic"

const TYPE_ICON = {
  DIRECT_MESSAGE: MessageSquare,
  BOARD_CHANNEL: Hash,
  APPROVAL_THREAD: FileCheck,
  OSE_BROADCAST: Megaphone,
  PRESIDENT_NETWORK: Hash,
  SYSTEM: Megaphone,
} as const

export default async function MessagesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")
  const userId = session.user.id

  const ctx = await getUserContext(userId)
  const oseInstitutionIds = ctx.institutionRoles.map((m) => m.institutionId)
  const currentOrgIds = ctx.orgRoles
    .filter((r) => r.status === "ACTIVE" || r.status === "SHADOW")
    .map((r) => r.organizationId)

  const conversations = await db.conversation.findMany({
    where: {
      OR: [
        { participants: { some: { userId } } },
        { type: "BOARD_CHANNEL", organizationId: { in: currentOrgIds } },
        { type: "BOARD_CHANNEL", institutionId: { in: oseInstitutionIds } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      organization: { select: { name: true } },
      participants: { include: { user: { select: { id: true, name: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  })

  // Unread counts per conversation
  const unread = await db.delivery.groupBy({
    by: ["participantId"],
    where: { readAt: null, participant: { userId } },
    _count: true,
  })
  const unreadByParticipant = new Map(unread.map((u) => [u.participantId, u._count]))

  const myOrgs = currentOrgIds.length
    ? await db.organization.findMany({ where: { id: { in: currentOrgIds } } })
    : await db.organization.findMany({ where: { institutionId: { in: oseInstitutionIds } } })

  const canBroadcast = oseInstitutionIds.length > 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-text-1">Messages</h1>
            <p className="text-sm text-text-2 mt-1">
              Conversations that survive leadership transitions.
            </p>
          </div>
          <Link
            href="/messages/compose"
            className="inline-flex items-center gap-1.5 h-9 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90 no-underline shrink-0"
          >
            <PenSquare size={15} /> Compose
          </Link>
        </div>

        {conversations.length === 0 ? (
          <Card>
            <p className="text-sm text-text-2 py-4 text-center">
              No conversations yet — start one on the right.
            </p>
          </Card>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-border">
              {conversations.map((c) => {
                const Icon = TYPE_ICON[c.type]
                const mine = c.participants.find((p) => p.userId === userId)
                const unreadCount = mine ? (unreadByParticipant.get(mine.id) ?? 0) : 0
                const others = c.participants.filter((p) => p.userId !== userId)
                const label =
                  c.subject ??
                  (c.type === "DIRECT_MESSAGE"
                    ? others.map((p) => p.user.name ?? "Unknown").join(", ") || "Direct message"
                    : c.organization?.name ?? "Conversation")
                const last = c.messages[0]
                return (
                  <li key={c.id}>
                    <Link
                      href={`/messages/${c.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-base transition-colors no-underline"
                    >
                      <Icon size={16} className="text-text-3 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${unreadCount ? "font-semibold" : "font-medium"} text-text-1`}>
                          {label}
                        </p>
                        {last && (
                          <p className="text-xs text-text-3 truncate mt-0.5">{last.body}</p>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <span
                          className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: "var(--primary-light)", color: "var(--primary)" }}
                        >
                          {unreadCount}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>

      <div className="space-y-4 lg:pt-14">
        {myOrgs.length > 0 && (
          <Card>
            <CardHeader title="Board channels" />
            <ul className="space-y-2">
              {myOrgs.map((o) => (
                <li key={o.id}>
                  <form action={openBoardChannel}>
                    <input type="hidden" name="organizationId" value={o.id} />
                    <button className="w-full text-left inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-sm text-text-1 hover:border-[--primary] hover:bg-blue-50 transition-colors">
                      <Hash size={14} className="text-text-3" /> {o.name}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {canBroadcast && (
          <Card>
            <CardHeader
              title="Broadcast"
              subtitle="Announcement to every current member"
            />
            <form action={sendBroadcast} className="space-y-2">
              <input
                name="subject"
                required
                placeholder="Subject"
                className="h-9 w-full rounded border border-border px-3 text-sm text-text-1"
              />
              <textarea
                name="body"
                required
                rows={3}
                placeholder="Message to all clubs…"
                className="w-full rounded border border-border px-3 py-2 text-sm text-text-1"
              />
              <button className="h-9 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90">
                Send broadcast
              </button>
            </form>
          </Card>
        )}
      </div>
    </div>
  )
}
