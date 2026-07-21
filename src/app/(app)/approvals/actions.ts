"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { ApprovalType } from "@prisma/client"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import {
  availableActions,
  nextStatus,
  type ApprovalActionName,
} from "@/lib/approvals"
import {
  notifyUsers,
  orgCurrentMemberIds,
  orgPresidentIds,
  oseMemberIds,
} from "@/lib/notify"

/** Alert whoever owns the next gate of this request. */
async function notifyGate(
  approval: { id: string; title: string; organizationId: string; institutionId: string },
  target: "PENDING_PRESIDENT" | "PENDING_OSE",
  actorId: string
) {
  const gateUsers =
    target === "PENDING_PRESIDENT"
      ? await orgPresidentIds(approval.organizationId)
      : await oseMemberIds(approval.institutionId)
  await notifyUsers(gateUsers, {
    title: `${approval.title} needs your approval`,
    body:
      target === "PENDING_PRESIDENT"
        ? "It's now with you for a club-level decision."
        : "It's now with the OSE team for a final decision.",
    href: `/approvals/${approval.id}`,
    excludeUserId: actorId,
  })
}

const APPROVAL_TYPES: ApprovalType[] = [
  "EVENT",
  "BUDGET",
  "VENDOR",
  "COMMUNICATION",
  "DOCUMENT",
  "EXCEPTION",
  "ROSTER",
]

async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not signed in")
  return session.user.id
}

/** Is this user the club's ACTIVE president? (Determines gate routing.) */
async function isActivePresident(userId: string, organizationId: string) {
  const seat = await db.roleAssignment.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      role: { organizationId, scope: "PRESIDENT" },
    },
  })
  return !!seat
}

export async function createApproval(formData: FormData) {
  const userId = await requireUser()

  const organizationId = String(formData.get("organizationId") ?? "")
  const type = String(formData.get("type") ?? "") as ApprovalType
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const amount = String(formData.get("amount") ?? "").trim()
  const asDraft = formData.get("intent") === "draft"

  if (!title) throw new Error("Title is required")
  if (!APPROVAL_TYPES.includes(type)) throw new Error("Invalid request type")

  // Must hold an ACTIVE seat in the org to submit requests from it
  const membership = await db.roleAssignment.findFirst({
    where: { userId, status: "ACTIVE", role: { organizationId } },
    include: { role: { include: { organization: true } } },
  })
  if (!membership) throw new Error("You need an active role in this club")

  const org = membership.role.organization
  const requesterIsPresident =
    membership.role.scope === "PRESIDENT" ||
    (await isActivePresident(userId, organizationId))

  const target = asDraft
    ? null
    : nextStatus("submit", "DRAFT", { requesterIsPresident })

  const approval = await db.$transaction(async (tx) => {
    const a = await tx.approvalRequest.create({
      data: {
        institutionId: org.institutionId,
        organizationId,
        type,
        title,
        description: description || null,
        submittedById: userId,
        status: target ?? "DRAFT",
        metadata: amount ? { amount } : {},
      },
    })
    if (target) {
      await tx.approvalStep.create({
        data: {
          approvalId: a.id,
          fromStatus: "DRAFT",
          toStatus: target,
          actorId: userId,
          actorRoleContext: membership.role.name,
          policySnapshot: { requesterIsPresident },
        },
      })
    }
    await tx.auditEvent.create({
      data: {
        institutionId: org.institutionId,
        organizationId,
        actorId: userId,
        actorRole: membership.role.name,
        action: target ? "Approval.Submitted" : "Approval.DraftCreated",
        resourceType: "ApprovalRequest",
        resourceId: a.id,
        outcome: "ALLOW",
      },
    })
    return a
  })

  if (target === "PENDING_PRESIDENT" || target === "PENDING_OSE") {
    await notifyGate(approval, target, userId)
  }

  revalidatePath("/approvals")
  redirect(`/approvals/${approval.id}`)
}

export async function actOnApproval(approvalId: string, formData: FormData) {
  const userId = await requireUser()
  const action = String(formData.get("action") ?? "") as ApprovalActionName
  const reason = String(formData.get("reason") ?? "").trim() || null

  const approval = await db.approvalRequest.findUnique({ where: { id: approvalId } })
  if (!approval) throw new Error("Request not found")

  const ctx = await getUserContext(userId)
  const allowed = availableActions(ctx, approval).includes(action)

  if (!allowed) {
    await db.auditEvent.create({
      data: {
        institutionId: approval.institutionId,
        organizationId: approval.organizationId,
        actorId: userId,
        action: `Approval.${action}`,
        resourceType: "ApprovalRequest",
        resourceId: approval.id,
        outcome: "DENY",
        reason: `Not permitted from ${approval.status}`,
      },
    })
    throw new Error("You cannot take this action on this request")
  }

  const requesterIsPresident = await isActivePresident(
    approval.submittedById,
    approval.organizationId
  )
  const target = nextStatus(action, approval.status, { requesterIsPresident })
  if (!target) throw new Error(`Illegal transition: ${action} from ${approval.status}`)

  // Actor's role label for the immutable step record
  const actorSeat = await db.roleAssignment.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      role: { organizationId: approval.organizationId },
    },
    include: { role: true },
  })
  const oseRole = ctx.institutionRoles.find(
    (m) => m.institutionId === approval.institutionId
  )?.role
  const roleContext = actorSeat?.role.name ?? oseRole ?? "Requester"

  // Approval-linked publishing: an EVENT approval drives its event's lifecycle
  const linkedEvent = await db.event.findUnique({ where: { approvalId: approval.id } })
  const eventUpdates =
    linkedEvent == null
      ? []
      : target === "APPROVED"
        ? [db.event.update({ where: { id: linkedEvent.id }, data: { status: "PUBLISHED" } })]
        : target === "REJECTED" || target === "CANCELLED"
          ? [db.event.update({ where: { id: linkedEvent.id }, data: { status: "CANCELLED" } })]
          : []

  await db.$transaction([
    ...eventUpdates,
    db.approvalRequest.update({
      where: { id: approval.id },
      data: { status: target },
    }),
    db.approvalStep.create({
      data: {
        approvalId: approval.id,
        fromStatus: approval.status,
        toStatus: target,
        actorId: userId,
        actorRoleContext: roleContext,
        reason,
        policySnapshot: { action, requesterIsPresident },
      },
    }),
    db.auditEvent.create({
      data: {
        institutionId: approval.institutionId,
        organizationId: approval.organizationId,
        actorId: userId,
        action: `Approval.${action}`,
        resourceType: "ApprovalRequest",
        resourceId: approval.id,
        outcome: "ALLOW",
        reason,
      },
    }),
  ])

  // ── Notifications (BP: notification system across all RBAC flows) ────────
  const label =
    action === "approve" && target === "APPROVED"
      ? "is approved"
      : action === "approve"
        ? "passed the president's review"
        : action === "reject"
          ? "was declined"
          : action === "request_changes"
            ? "needs a few changes"
            : action === "cancel"
              ? "was cancelled"
              : "moved forward"
  await notifyUsers([approval.submittedById], {
    title: `Your request “${approval.title}” ${label}`,
    body: reason ?? undefined,
    href: `/approvals/${approval.id}`,
    excludeUserId: userId,
  })
  if (target === "PENDING_OSE" || target === "PENDING_PRESIDENT") {
    await notifyGate(approval, target, userId)
  }
  if (linkedEvent && target === "APPROVED") {
    await notifyUsers(await orgCurrentMemberIds(approval.organizationId), {
      title: `${linkedEvent.title} is approved and now on the calendar`,
      href: `/calendar/${linkedEvent.id}`,
      excludeUserId: userId,
    })
  }

  revalidatePath("/approvals")
  revalidatePath(`/approvals/${approval.id}`)
  revalidatePath("/dashboard")
  if (linkedEvent) {
    revalidatePath("/calendar")
    revalidatePath(`/calendar/${linkedEvent.id}`)
  }
}
