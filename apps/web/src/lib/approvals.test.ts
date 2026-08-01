import type { ApprovalStatus } from "@prisma/client"
import {
  availableActions,
  canViewApproval,
  isConcurrentDecision,
  nextStatus,
  type ApprovalView,
} from "./approvals"
import type { UserContext } from "./rbac"

const INST = "inst_1"
const ORG = "org_1"

function approval(status: ApprovalStatus, submittedById = "vp_user"): ApprovalView {
  return { id: "ap_1", status, submittedById, organizationId: ORG, institutionId: INST }
}

function ctx(userId: string, overrides: Partial<UserContext> = {}): UserContext {
  return { userId, institutionRoles: [], orgRoles: [], ...overrides }
}

const vp = ctx("vp_user", {
  orgRoles: [
    { organizationId: ORG, roleId: "r_vp", roleName: "VP Finance", scope: "FUNCTIONAL", status: "ACTIVE" },
  ],
})
const president = ctx("pres_user", {
  orgRoles: [
    { organizationId: ORG, roleId: "r_p", roleName: "President", scope: "PRESIDENT", status: "ACTIVE" },
  ],
})
const oseDirector = ctx("ose_user", {
  institutionRoles: [{ institutionId: INST, role: "OSE_DIRECTOR" }],
})
const outsider = ctx("random_user")

describe("availableActions", () => {
  it("lets the requester submit or cancel a draft", () => {
    expect(availableActions(vp, approval("DRAFT"))).toEqual(["submit", "cancel"])
    expect(availableActions(president, approval("DRAFT"))).toEqual([])
  })

  it("gates PENDING_PRESIDENT on the active president", () => {
    const a = approval("PENDING_PRESIDENT")
    expect(availableActions(president, a)).toEqual(["approve", "request_changes", "reject"])
    expect(availableActions(vp, a)).toEqual(["cancel"]) // requester may withdraw
    expect(availableActions(oseDirector, a)).toEqual([]) // not their gate yet
  })

  it("gates PENDING_OSE on OSE staff", () => {
    const a = approval("PENDING_OSE")
    expect(availableActions(oseDirector, a)).toEqual(["approve", "request_changes", "reject"])
    expect(availableActions(president, a)).toEqual([])
  })

  it("lets only the requester resubmit after NEEDS_CHANGES", () => {
    const a = approval("NEEDS_CHANGES")
    expect(availableActions(vp, a)).toEqual(["resubmit", "cancel"])
    expect(availableActions(president, a)).toEqual([])
  })

  it("offers nothing on terminal states or to outsiders", () => {
    expect(availableActions(vp, approval("APPROVED"))).toEqual([])
    expect(availableActions(vp, approval("REJECTED"))).toEqual([])
    expect(availableActions(vp, approval("CANCELLED"))).toEqual([])
    expect(availableActions(outsider, approval("PENDING_PRESIDENT"))).toEqual([])
  })
})

describe("nextStatus", () => {
  it("routes VP submissions through the president gate", () => {
    expect(nextStatus("submit", "DRAFT", { requesterIsPresident: false })).toBe("PENDING_PRESIDENT")
  })

  it("skips the president gate for the president's own requests", () => {
    expect(nextStatus("submit", "DRAFT", { requesterIsPresident: true })).toBe("PENDING_OSE")
    expect(nextStatus("resubmit", "NEEDS_CHANGES", { requesterIsPresident: true })).toBe("PENDING_OSE")
  })

  it("moves through both gates to APPROVED", () => {
    expect(nextStatus("approve", "PENDING_PRESIDENT", { requesterIsPresident: false })).toBe("PENDING_OSE")
    expect(nextStatus("approve", "PENDING_OSE", { requesterIsPresident: false })).toBe("APPROVED")
  })

  it("returns null for illegal transitions", () => {
    expect(nextStatus("submit", "APPROVED", { requesterIsPresident: false })).toBeNull()
    expect(nextStatus("approve", "DRAFT", { requesterIsPresident: false })).toBeNull()
    expect(nextStatus("resubmit", "DRAFT", { requesterIsPresident: false })).toBeNull()
    expect(nextStatus("cancel", "APPROVED", { requesterIsPresident: false })).toBeNull()
  })
})

describe("isConcurrentDecision", () => {
  // The status update names the status the decision was read at, so a P2025 from
  // that statement means another approver moved the request first.
  it("recognises Prisma P2025", () => {
    expect(isConcurrentDecision({ code: "P2025", message: "Record to update not found." })).toBe(true)
  })

  it("ignores every other Prisma error code", () => {
    expect(isConcurrentDecision({ code: "P2002" })).toBe(false)
    expect(isConcurrentDecision({ code: "P1001" })).toBe(false)
  })

  // A connection failure or a bug must not be reported to the user as though a
  // colleague had beaten them to the decision.
  it("ignores errors that carry no code", () => {
    expect(isConcurrentDecision(new Error("boom"))).toBe(false)
    expect(isConcurrentDecision(null)).toBe(false)
    expect(isConcurrentDecision(undefined)).toBe(false)
    expect(isConcurrentDecision("P2025")).toBe(false)
    expect(isConcurrentDecision({ code: 2025 })).toBe(false)
  })
})

describe("canViewApproval", () => {
  // The rule openApprovalThread was missing entirely: a signed-in user who
  // supplied any approval id was enrolled in that request's discussion thread.
  it("lets the requester see their own request", () => {
    expect(canViewApproval(ctx("vp_user"), approval("PENDING_PRESIDENT"))).toBe(true)
  })

  it("lets a member of the owning club see it", () => {
    const member = ctx("someone", {
      orgRoles: [
        { organizationId: ORG, roleId: "r_m", roleName: "Member", scope: "FUNCTIONAL", status: "ACTIVE" },
      ],
    })
    expect(canViewApproval(member, approval("PENDING_OSE"))).toBe(true)
  })

  it("refuses an unaffiliated signed-in user", () => {
    expect(canViewApproval(ctx("stranger"), approval("PENDING_OSE"))).toBe(false)
  })

  it("lets OSE see it, which is what the oversight role is for", () => {
    const ose = ctx("dir", { institutionRoles: [{ institutionId: INST, role: "OSE_DIRECTOR" }] })
    expect(canViewApproval(ose, approval("PENDING_OSE"))).toBe(true)
  })

  // An ended seat stops conferring visibility; the requester exception does not
  // depend on a seat, so a departed submitter still sees their own request.
  it("refuses a former member whose seat is ALUMNI", () => {
    const alum = ctx("alum", {
      orgRoles: [
        { organizationId: ORG, roleId: "r_a", roleName: "President", scope: "PRESIDENT", status: "ALUMNI" },
      ],
    })
    expect(canViewApproval(alum, approval("PENDING_OSE"))).toBe(false)
    expect(canViewApproval(alum, approval("PENDING_OSE", "alum"))).toBe(true)
  })

  it("refuses a member of a DIFFERENT club in the same institution", () => {
    const other = ctx("other_club", {
      orgRoles: [
        { organizationId: "org_2", roleId: "r_p2", roleName: "President", scope: "PRESIDENT", status: "ACTIVE" },
      ],
    })
    expect(canViewApproval(other, approval("PENDING_OSE"))).toBe(false)
  })
})
