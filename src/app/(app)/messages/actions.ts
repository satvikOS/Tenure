"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext, isOse } from "@/lib/rbac"
import { canPostToConversation } from "@/lib/messaging"

async function requireUserId() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not signed in")
  return session.user.id
}

async function ensureParticipant(conversationId: string, userId: string, roleContext?: string) {
  return db.participant.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: {},
    create: { conversationId, userId, roleContext },
  })
}

/** Start (or resume) a DM with another user. */
export async function startDm(formData: FormData) {
  const userId = await requireUserId()
  const otherUserId = String(formData.get("userId") ?? "")
  if (!otherUserId || otherUserId === userId) throw new Error("Pick someone to message")

  const other = await db.user.findUnique({ where: { id: otherUserId } })
  if (!other) throw new Error("User not found")

  // Resolve institution for the DM (either user's affiliation)
  const ctx = await getUserContext(userId)
  const anyOrg = ctx.orgRoles[0]
  const institutionId =
    ctx.institutionRoles[0]?.institutionId ??
    (anyOrg
      ? (await db.organization.findUnique({ where: { id: anyOrg.organizationId } }))!
          .institutionId
      : null)
  if (!institutionId) throw new Error("No institution affiliation")

  // Reuse an existing 1:1 DM if there is one
  const existing = await db.conversation.findFirst({
    where: {
      type: "DIRECT_MESSAGE",
      AND: [
        { participants: { some: { userId } } },
        { participants: { some: { userId: otherUserId } } },
      ],
    },
    include: { participants: true },
  })
  const dm =
    existing && existing.participants.length === 2
      ? existing
      : await db.conversation.create({
          data: {
            institutionId,
            type: "DIRECT_MESSAGE",
            participants: {
              create: [{ userId }, { userId: otherUserId }],
            },
          },
        })

  redirect(`/messages/${dm.id}`)
}

/** Open (creating if needed) a club's board channel. */
export async function openBoardChannel(formData: FormData) {
  const userId = await requireUserId()
  const organizationId = String(formData.get("organizationId") ?? "")

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new Error("Club not found")

  const ctx = await getUserContext(userId)
  const affiliated =
    isOse(ctx, org.institutionId) ||
    ctx.orgRoles.some(
      (r) => r.organizationId === organizationId && (r.status === "ACTIVE" || r.status === "SHADOW")
    )
  if (!affiliated) throw new Error("Not a member of this club")

  let channel = await db.conversation.findFirst({
    where: { organizationId, type: "BOARD_CHANNEL" },
  })
  channel ??= await db.conversation.create({
    data: {
      institutionId: org.institutionId,
      organizationId,
      type: "BOARD_CHANNEL",
      subject: `${org.name} — Board`,
    },
  })

  await ensureParticipant(channel.id, userId)
  redirect(`/messages/${channel.id}`)
}

/** Open (creating if needed) the discussion thread on an approval. */
export async function openApprovalThread(formData: FormData) {
  const userId = await requireUserId()
  const approvalId = String(formData.get("approvalId") ?? "")

  const approval = await db.approvalRequest.findUnique({ where: { id: approvalId } })
  if (!approval) throw new Error("Request not found")

  let thread = await db.conversation.findUnique({ where: { approvalId } })
  thread ??= await db.conversation.create({
    data: {
      institutionId: approval.institutionId,
      organizationId: approval.organizationId,
      type: "APPROVAL_THREAD",
      approvalId,
      subject: `Re: ${approval.title}`,
      participants: {
        create:
          approval.submittedById === userId
            ? [{ userId }]
            : [{ userId: approval.submittedById }, { userId }],
      },
    },
  })

  await ensureParticipant(thread.id, userId)
  redirect(`/messages/${thread.id}`)
}

/** OSE announcement to every current member. */
export async function sendBroadcast(formData: FormData) {
  const userId = await requireUserId()
  const subject = String(formData.get("subject") ?? "").trim()
  const body = String(formData.get("body") ?? "").trim()
  if (!subject || !body) throw new Error("Subject and message are required")

  const ctx = await getUserContext(userId)
  const institutionId = ctx.institutionRoles[0]?.institutionId
  if (!institutionId) throw new Error("Only OSE can broadcast")

  // Audience: every user with a current (ACTIVE/SHADOW) seat + OSE staff
  const seats = await db.roleAssignment.findMany({
    where: {
      status: { in: ["ACTIVE", "SHADOW"] },
      role: { organization: { institutionId } },
    },
    select: { userId: true },
  })
  const staff = await db.institutionMembership.findMany({
    where: { institutionId },
    select: { userId: true },
  })
  const audience = [...new Set([...seats.map((s) => s.userId), ...staff.map((s) => s.userId)])]

  const convo = await db.$transaction(async (tx) => {
    const c = await tx.conversation.create({
      data: {
        institutionId,
        type: "OSE_BROADCAST",
        subject,
        participants: { create: audience.map((uid) => ({ userId: uid })) },
      },
      include: { participants: true },
    })
    const m = await tx.message.create({
      data: { conversationId: c.id, senderId: userId, body },
    })
    await tx.delivery.createMany({
      data: c.participants
        .filter((p) => p.userId !== userId)
        .map((p) => ({ messageId: m.id, participantId: p.id, channel: "in_app" })),
    })
    await tx.auditEvent.create({
      data: {
        institutionId,
        actorId: userId,
        action: "Broadcast.Sent",
        resourceType: "Conversation",
        resourceId: c.id,
        outcome: "ALLOW",
        metadata: { recipients: audience.length },
      },
    })
    return c
  })

  redirect(`/messages/${convo.id}`)
}

/** Post a message into a conversation the user can write to. */
export async function sendMessage(conversationId: string, formData: FormData) {
  const userId = await requireUserId()
  const body = String(formData.get("body") ?? "").trim()
  if (!body) return

  const convo = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true },
  })
  if (!convo) throw new Error("Conversation not found")

  const ctx = await getUserContext(userId)
  const allowed = canPostToConversation(ctx, {
    type: convo.type,
    institutionId: convo.institutionId,
    organizationId: convo.organizationId,
    participantUserIds: convo.participants.map((p) => p.userId),
  })
  if (!allowed) throw new Error("You cannot post in this conversation")

  await ensureParticipant(conversationId, userId)
  const participants = await db.participant.findMany({ where: { conversationId } })

  await db.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: { conversationId, senderId: userId, body },
    })
    await tx.delivery.createMany({
      data: participants
        .filter((p) => p.userId !== userId)
        .map((p) => ({ messageId: m.id, participantId: p.id, channel: "in_app" })),
    })
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })
  })

  revalidatePath(`/messages/${conversationId}`)
  revalidatePath("/messages")
  revalidatePath("/dashboard")
}
