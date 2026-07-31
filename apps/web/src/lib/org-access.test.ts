import type { OrgStatus } from "@prisma/client"
import {
  ARCHIVED_ORG_MESSAGE,
  OPERABLE_ORG_FILTER,
  assertOperableOrg,
  filterOperableOrgs,
  isOperableOrg,
} from "./org-access"

/**
 * The archive guard.
 *
 * Archiving a club used to be a bare `status` flip: /orgs stopped listing it and
 * nothing else changed, because every RoleAssignment stayed ACTIVE. Its officers
 * kept writing — new events, new approval requests, new delegations — and its
 * members kept inflating dashboard KPIs. These tests pin the one predicate that
 * every operational read and write now shares, so the two halves cannot drift.
 */

const org = (status: OrgStatus) => ({ id: `org_${status}`, status })

describe("isOperableOrg", () => {
  it("treats an archived club as closed for business", () => {
    expect(isOperableOrg(org("ARCHIVED"))).toBe(false)
  })

  it("treats an active club as operable", () => {
    expect(isOperableOrg(org("ACTIVE"))).toBe(true)
  })

  it("keeps a PENDING club operable — it is awaiting a charter, not shut down", () => {
    // /orgs lists PENDING clubs in the active grid; the guard has to agree, or
    // a club would vanish from every picker while its charter is under review.
    expect(isOperableOrg(org("PENDING"))).toBe(true)
  })
})

describe("assertOperableOrg", () => {
  it("refuses the write rather than silently filtering it", () => {
    expect(() => assertOperableOrg(org("ARCHIVED"))).toThrow(ARCHIVED_ORG_MESSAGE)
  })

  it("lets operable clubs through", () => {
    expect(() => assertOperableOrg(org("ACTIVE"))).not.toThrow()
    expect(() => assertOperableOrg(org("PENDING"))).not.toThrow()
  })
})

describe("filterOperableOrgs", () => {
  it("drops archived clubs and preserves the order of the rest", () => {
    const orgs = [org("ACTIVE"), org("ARCHIVED"), org("PENDING")]
    expect(filterOperableOrgs(orgs).map((o) => o.id)).toEqual(["org_ACTIVE", "org_PENDING"])
  })

  it("returns an empty list when every club is archived", () => {
    expect(filterOperableOrgs([org("ARCHIVED")])).toEqual([])
  })
})

describe("OPERABLE_ORG_FILTER", () => {
  it("expresses the same rule as the predicate, for the query side", () => {
    // A `where` fragment and a predicate that disagree is exactly how the read
    // and write halves drifted apart before, so they are checked against each
    // other rather than each being asserted on its own.
    const statuses: OrgStatus[] = ["ACTIVE", "ARCHIVED", "PENDING"]
    const excluded = OPERABLE_ORG_FILTER.status.not
    for (const status of statuses) {
      expect(status !== excluded).toBe(isOperableOrg({ status }))
    }
  })
})
