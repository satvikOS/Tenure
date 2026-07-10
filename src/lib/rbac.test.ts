import {
  canContribute,
  canListAllOrgs,
  canManageRoster,
  canViewOrg,
  isOse,
  isOseDirector,
  type UserContext,
} from "./rbac"

const INST = "inst_1"
const ORG = { id: "org_1", institutionId: INST }
const OTHER_ORG = { id: "org_2", institutionId: INST }

function ctx(overrides: Partial<UserContext> = {}): UserContext {
  return { userId: "user_1", institutionRoles: [], orgRoles: [], ...overrides }
}

const president = (status: "SHADOW" | "ACTIVE" | "ALUMNI"): UserContext =>
  ctx({
    orgRoles: [
      {
        organizationId: ORG.id,
        roleId: "role_pres",
        roleName: "President",
        scope: "PRESIDENT",
        status,
      },
    ],
  })

const member = (status: "SHADOW" | "ACTIVE" | "ALUMNI"): UserContext =>
  ctx({
    orgRoles: [
      {
        organizationId: ORG.id,
        roleId: "role_member",
        roleName: "Member",
        scope: "MEMBER",
        status,
      },
    ],
  })

describe("institution-level checks", () => {
  it("recognizes any OSE membership", () => {
    const staff = ctx({ institutionRoles: [{ institutionId: INST, role: "OSE_STAFF" }] })
    expect(isOse(staff, INST)).toBe(true)
    expect(isOseDirector(staff, INST)).toBe(false)
  })

  it("scopes OSE membership to the institution", () => {
    const director = ctx({
      institutionRoles: [{ institutionId: "other_inst", role: "OSE_DIRECTOR" }],
    })
    expect(isOse(director, INST)).toBe(false)
    expect(canListAllOrgs(director, INST)).toBe(false)
  })
})

describe("canViewOrg", () => {
  it("allows any OSE role to view any club", () => {
    const advisor = ctx({ institutionRoles: [{ institutionId: INST, role: "OSE_ADVISOR" }] })
    expect(canViewOrg(advisor, ORG)).toBe(true)
  })

  it("allows ACTIVE and SHADOW members, denies ALUMNI", () => {
    expect(canViewOrg(member("ACTIVE"), ORG)).toBe(true)
    expect(canViewOrg(member("SHADOW"), ORG)).toBe(true)
    expect(canViewOrg(member("ALUMNI"), ORG)).toBe(false)
  })

  it("denies members of other orgs", () => {
    expect(canViewOrg(member("ACTIVE"), OTHER_ORG)).toBe(false)
  })

  it("denies users with no roles at all", () => {
    expect(canViewOrg(ctx(), ORG)).toBe(false)
  })
})

describe("canManageRoster", () => {
  it("allows OSE Director but not OSE Staff", () => {
    const director = ctx({ institutionRoles: [{ institutionId: INST, role: "OSE_DIRECTOR" }] })
    const staff = ctx({ institutionRoles: [{ institutionId: INST, role: "OSE_STAFF" }] })
    expect(canManageRoster(director, ORG)).toBe(true)
    expect(canManageRoster(staff, ORG)).toBe(false)
  })

  it("allows only the ACTIVE president — SHADOW is read-only", () => {
    expect(canManageRoster(president("ACTIVE"), ORG)).toBe(true)
    expect(canManageRoster(president("SHADOW"), ORG)).toBe(false)
    expect(canManageRoster(president("ALUMNI"), ORG)).toBe(false)
  })

  it("denies active non-president members", () => {
    expect(canManageRoster(member("ACTIVE"), ORG)).toBe(false)
  })
})

describe("canContribute", () => {
  it("requires ACTIVE status — SHADOW is read-only", () => {
    expect(canContribute(member("ACTIVE"), ORG)).toBe(true)
    expect(canContribute(member("SHADOW"), ORG)).toBe(false)
    expect(canContribute(member("ALUMNI"), ORG)).toBe(false)
  })
})
