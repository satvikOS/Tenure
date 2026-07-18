import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { canPostToConversation, canReadConversation } from "@/lib/messaging"
import { Card } from "@/components/ui/Card"
import { BackButton } from "@/components/BackButton"
import { sendMessage } from "../actions"

export const dynamic = "force-dynamic"

const TYPE_LABEL = {
  DIRECT_MESSAGE: "Direct message",
  BOARD_CHANNEL: "Board channel",
  APPROVAL_THREAD: "Approval discussion",
  OSE_BROADCAST: "OSE broadcast",
  PRESIDENT_NETWORK: "President network",
  SYSTEM: "System",
} as const

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")
  const userId = session.user.id

  const convo = await db.conversation.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true } },
      approval: { select: { id: true, title: true } },
      participants: { include: { user: { select: { id: true, name: true } } } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        include: { sender: { select: { id: true, name: true } } },
      },
    },
  })
  if (!convo) notFound()

  const ctx = await getUserContext(userId)
  const convoLike = {
    type: convo.type,
    institutionId: convo.institutionId,
    organizationId: convo.organizationId,
    participantUserIds: convo.participants.map((p) => p.userId),
  }
  if (!canReadConversation(ctx, convoLike)) notFound()
  const canPost = canPostToConversation(ctx, convoLike)

  // Mark everything here as read for this user
  const mine = convo.participants.find((p) => p.userId === userId)
  if (mine) {
    await db.delivery.updateMany({
      where: { participantId: mine.id, readAt: null },
      data: { readAt: new Date() },
    })
  }

  const others = convo.participants.filter((p) => p.userId !== userId)
  const title =
    convo.subject ??
    (convo.type === "DIRECT_MESSAGE"
      ? others.map((p) => p.user.name ?? "Unknown").join(", ") || "Direct message"
      : convo.organization?.name ?? "Conversation")

  // Email-style header lines. From = original sender; Bcc participants are
  // visible only to themselves — nobody else learns they were included.
  const firstSenderId = convo.messages[0]?.senderId
  const nameOf = (p: (typeof convo.participants)[number]) => p.user.name ?? "Unknown"
  const fromName = convo.messages[0]?.sender.name
  const toLine = convo.participants
    .filter((p) => p.kind === "to" && p.userId !== firstSenderId)
    .map(nameOf)
  const ccLine = convo.participants.filter((p) => p.kind === "cc").map(nameOf)
  const selfBcc = convo.participants.find((p) => p.kind === "bcc" && p.userId === userId)

  const sendWithId = sendMessage.bind(null, convo.id)

  return (
    <div className="max-w-3xl">
      <BackButton />
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-3">
          {TYPE_LABEL[convo.type]}
        </p>
        <h1 className="text-text-1 mt-0.5">{title}</h1>
        {convo.approval && (
          <Link
            href={`/approvals/${convo.approval.id}`}
            className="text-xs text-[--primary] hover:underline"
          >
            View the approval request →
          </Link>
        )}
        {convo.type === "DIRECT_MESSAGE" && toLine.length > 0 && (
          <div className="mt-1 text-xs text-text-3">
            {fromName && <p>{`From: ${fromName}`}</p>}
            <p>{`To: ${toLine.join(", ")}`}</p>
            {ccLine.length > 0 && <p>{`Cc: ${ccLine.join(", ")}`}</p>}
            {selfBcc && <p>Bcc: you</p>}
          </div>
        )}
      </div>

      <Card padding="none">
        {convo.messages.length === 0 ? (
          <p className="px-5 py-8 text-sm text-text-3 text-center">
            No messages yet{canPost ? " — say hello below." : "."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {convo.messages.map((m) => (
              <li key={m.id} className="px-5 py-3.5">
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-semibold text-text-1">
                    {m.sender.name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-text-3">
                    {m.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <p className="text-sm text-text-1 mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canPost ? (
        <form action={sendWithId} className="mt-4 flex gap-2">
          <input
            name="body"
            required
            autoComplete="off"
            placeholder="Write a message…"
            className="h-10 flex-1 rounded border border-border px-3 text-sm text-text-1"
          />
          <button className="h-10 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90">
            Send
          </button>
        </form>
      ) : (
        <p className="mt-4 text-xs text-text-3">
          {convo.type === "OSE_BROADCAST"
            ? "Broadcasts are read-only."
            : "You have read-only access to this conversation."}
        </p>
      )}
    </div>
  )
}
