import {
  CURRENT_ACADEMIC_TERM,
  OTHER_SEATS_LABEL,
  capSeatNames,
  countCurrentHolders,
  currentHolder,
  currentHolderKeys,
  groupSeatFactsByOrg,
  incomingHolder,
  isBoardSeat,
  holdingIsCurrent,
  previousHolder,
  seatHasSuccessor,
  seatIsFilled,
  seatIsIncoming,
  seatState,
  summariseSeats,
  summariseSeatsByName,
  toSeatFacts,
  type OrgSeatFacts,
  type SeatFacts,
} from "./seats"

const PRIOR_TERM = "2025-2026"

/** A seat with nothing on it; each test adds only what it is about. */
const seat = (name: string, patch: Partial<SeatFacts> = {}): SeatFacts => ({
  name,
  assignments: [],
  holdings: [],
  ...patch,
})

const active = (key?: string, name?: string) =>
  ({ status: "ACTIVE", key, name }) as SeatFacts["assignments"][number]
const shadow = (key?: string, name?: string) =>
  ({ status: "SHADOW", key, name }) as SeatFacts["assignments"][number]
const alumni = (key?: string, name?: string) =>
  ({ status: "ALUMNI", key, name }) as SeatFacts["assignments"][number]
const holding = (key?: string, name?: string, term = CURRENT_ACADEMIC_TERM, isCurrent = true) => ({
  isCurrent,
  term,
  key,
  name,
})

describe("holdingIsCurrent", () => {
  it("counts a holding that is flagged current for this term", () => {
    expect(holdingIsCurrent(holding("a@x.edu"))).toBe(true)
  })

  it("rejects an ended holding", () => {
    expect(holdingIsCurrent(holding("a@x.edu", "A", CURRENT_ACADEMIC_TERM, false))).toBe(false)
  })

  it("rejects a prior-term holding even when it is still flagged current", () => {
    // Stale data, not a holder — the flag alone is not trusted.
    expect(holdingIsCurrent(holding("a@x.edu", "A", PRIOR_TERM, true))).toBe(false)
  })
})

describe("seatIsFilled", () => {
  it("is filled by an ACTIVE assignment", () => {
    expect(seatIsFilled(seat("President", { assignments: [active("p@x.edu")] }))).toBe(true)
  })

  it("is filled by a current SeatHolding with no login account at all", () => {
    expect(seatIsFilled(seat("President", { holdings: [holding("p@x.edu")] }))).toBe(true)
  })

  it("is NOT filled by a SHADOW assignment — incoming is a plan, not a holder", () => {
    expect(seatIsFilled(seat("President", { assignments: [shadow("s@x.edu")] }))).toBe(false)
  })

  it("is NOT filled by an ALUMNI assignment", () => {
    expect(seatIsFilled(seat("President", { assignments: [alumni("old@x.edu")] }))).toBe(false)
  })

  it("is NOT filled by an ended or prior-term holding", () => {
    expect(
      seatIsFilled(
        seat("President", {
          holdings: [
            holding("old@x.edu", "Old", PRIOR_TERM, false),
            holding("older@x.edu", "Older", PRIOR_TERM, true),
          ],
        })
      )
    ).toBe(false)
  })

  it("is not filled by history alone — the old admin rule counted this seat", () => {
    // `_count.assignments > 0 || _count.holdings > 0` said filled; it is vacant.
    const vacant = seat("VP Finance", {
      assignments: [alumni("old@x.edu")],
      holdings: [holding("old@x.edu", "Old", PRIOR_TERM, false)],
    })
    expect(seatIsFilled(vacant)).toBe(false)
    expect(seatState(vacant)).toBe("VACANT")
  })
})

describe("the mixed case that produced the contradiction", () => {
  // One human, two records: the OSE roster holding and their login account.
  const mixed = seat("President", {
    assignments: [active("pat@x.edu", "Pat Chen")],
    holdings: [holding("pat@x.edu", "Pat Chen")],
  })

  it("counts the seat ONCE, not twice", () => {
    expect(summariseSeats([mixed])).toMatchObject({ total: 1, filled: 1, vacant: 0, fillPct: 100 })
  })

  it("counts the human ONCE across both records", () => {
    expect(countCurrentHolders([mixed])).toBe(1)
  })

  it("dedupes on email regardless of case or padding", () => {
    const messy = seat("President", {
      assignments: [active(" Pat@X.edu ")],
      holdings: [holding("pat@x.edu")],
    })
    expect(countCurrentHolders([messy])).toBe(1)
  })

  it("still counts two genuinely different co-holders as two people on one seat", () => {
    const shared = seat("VP Events", {
      assignments: [active("a@x.edu"), active("b@x.edu")],
    })
    expect(summariseSeats([shared]).filled).toBe(1)
    expect(countCurrentHolders([shared])).toBe(2)
  })
})

describe("seatState", () => {
  it("is INCOMING only when nobody holds the seat today", () => {
    expect(seatState(seat("VP Marketing", { assignments: [shadow("s@x.edu")] }))).toBe("INCOMING")
  })

  it("stays FILLED when a successor shadows a seat that has a holder", () => {
    const handingOver = seat("President", {
      assignments: [active("now@x.edu"), shadow("next@x.edu")],
    })
    expect(seatState(handingOver)).toBe("FILLED")
    expect(seatIsIncoming(handingOver)).toBe(false)
    expect(seatHasSuccessor(handingOver)).toBe(true)
  })

  it("is VACANT with nothing on it", () => {
    expect(seatState(seat("VP Tech"))).toBe("VACANT")
  })
})

describe("currentHolder / incomingHolder", () => {
  it("prefers the roster holding — the system of record for who sits in a seat", () => {
    const s = seat("President", {
      assignments: [active("pat@x.edu", "P. Chen")],
      holdings: [holding("pat@x.edu", "Pat Chen")],
    })
    expect(currentHolder(s)?.name).toBe("Pat Chen")
  })

  it("falls back to the ACTIVE assignment when there is no roster holding", () => {
    expect(currentHolder(seat("President", { assignments: [active("p@x.edu", "Pat")] }))?.name).toBe(
      "Pat"
    )
  })

  it("never presents a shadow as the holder", () => {
    const s = seat("President", { assignments: [shadow("next@x.edu", "Next")] })
    expect(currentHolder(s)).toBeNull()
    expect(incomingHolder(s)?.name).toBe("Next")
  })
})

describe("isBoardSeat", () => {
  it("excludes the generic membership bucket", () => {
    expect(isBoardSeat({ name: "Member" })).toBe(false)
    expect(isBoardSeat({ name: "VP Finance & Operations" })).toBe(true)
  })
})

describe("summariseSeats", () => {
  const club: SeatFacts[] = [
    seat("President", { assignments: [active("p@x.edu")], holdings: [holding("p@x.edu")] }),
    seat("VP Finance", { holdings: [holding("f@x.edu")] }),
    seat("VP Marketing", { assignments: [active("m@x.edu"), shadow("m2@x.edu")] }),
    seat("VP Events", { assignments: [shadow("e@x.edu")] }),
    seat("VP Tech", { assignments: [alumni("t@x.edu")] }),
    seat("Secretary", { holdings: [holding("s@x.edu", "S", PRIOR_TERM, false)] }),
    // The membership bucket is never a seat.
    seat("Member", { assignments: [active("gm1@x.edu"), active("gm2@x.edu")] }),
  ]

  it("reports filled, incoming and vacant as one exclusive partition", () => {
    const s = summariseSeats(club)
    expect(s).toMatchObject({ total: 6, filled: 3, incoming: 1, vacant: 2, withSuccessor: 2 })
    expect(s.filled + s.incoming + s.vacant).toBe(s.total)
  })

  it("never folds incoming into filled", () => {
    expect(summariseSeats([seat("VP Events", { assignments: [shadow("e@x.edu")] })])).toMatchObject({
      filled: 0,
      incoming: 1,
    })
  })

  it("computes a whole-percent fill rate, and 0% for a club with no board seats", () => {
    expect(summariseSeats(club).fillPct).toBe(50)
    expect(summariseSeats([seat("Member")])).toMatchObject({ total: 0, fillPct: 0 })
    expect(summariseSeats([])).toMatchObject({ total: 0, filled: 0, fillPct: 0 })
  })

  it("counts general members as people but not as seats", () => {
    // 3 board holders (p, f, m) + 2 general members, each counted once.
    expect(countCurrentHolders(club)).toBe(5)
    expect(currentHolderKeys(club).has("gm1@x.edu")).toBe(true)
  })

  it("counts a person holding two seats in the same club once", () => {
    const doubling = [
      seat("President", { assignments: [active("pat@x.edu")] }),
      seat("VP Finance", { holdings: [holding("pat@x.edu")] }),
    ]
    expect(summariseSeats(doubling).filled).toBe(2)
    expect(countCurrentHolders(doubling)).toBe(1)
  })

  it("does not collapse holders it cannot identify", () => {
    const anonymous = [
      seat("President", { assignments: [active()] }),
      seat("VP Finance", { assignments: [active()] }),
    ]
    expect(countCurrentHolders(anonymous)).toBe(2)
  })
})

describe("summariseSeatsByName", () => {
  const seats: SeatFacts[] = [
    seat("President", { holdings: [holding("a@x.edu")] }),
    seat("President", { assignments: [active("b@x.edu")] }),
    seat("President", { assignments: [alumni("c@x.edu")] }),
    seat("VP Finance", { assignments: [shadow("d@x.edu")] }),
    seat("Member", { assignments: [active("e@x.edu")] }),
  ]

  it("groups board seats by name with the same three-way split", () => {
    expect(summariseSeatsByName(seats)).toEqual([
      { name: "President", filled: 2, incoming: 0, vacant: 1, total: 3 },
      { name: "VP Finance", filled: 0, incoming: 1, vacant: 0, total: 1 },
    ])
  })

  it("sorts by size then name so the chart does not reshuffle between renders", () => {
    const ties = [seat("Treasurer"), seat("Advisor Liaison"), seat("Zeta Chair")]
    expect(summariseSeatsByName(ties).map((r) => r.name)).toEqual([
      "Advisor Liaison",
      "Treasurer",
      "Zeta Chair",
    ])
  })

  it("agrees with the headline totals — the chart cannot disagree with the tile", () => {
    const byName = summariseSeatsByName(seats)
    const headline = summariseSeats(seats)
    expect(byName.reduce((n, r) => n + r.filled, 0)).toBe(headline.filled)
    expect(byName.reduce((n, r) => n + r.incoming, 0)).toBe(headline.incoming)
    expect(byName.reduce((n, r) => n + r.vacant, 0)).toBe(headline.vacant)
    expect(byName.reduce((n, r) => n + r.total, 0)).toBe(headline.total)
  })
})

describe("term override", () => {
  it("reads holdings against the term it is given", () => {
    const s = seat("President", { holdings: [holding("a@x.edu", "A", PRIOR_TERM, true)] })
    expect(seatIsFilled(s)).toBe(false)
    expect(seatIsFilled(s, PRIOR_TERM)).toBe(true)
  })
})

describe("previousHolder", () => {
  const OLDER_TERM = "2024-2025"

  it("returns the most recent ended holding, whatever order they arrive in", () => {
    const s = seat("President", {
      holdings: [
        holding("older@x.edu", "Older", OLDER_TERM, false),
        holding("now@x.edu", "Now"),
        holding("prev@x.edu", "Prev", PRIOR_TERM, false),
      ],
    })
    expect(previousHolder(s)?.name).toBe("Prev")
  })

  it("treats a prior-term holding still flagged current as the predecessor", () => {
    const s = seat("President", { holdings: [holding("prev@x.edu", "Prev", PRIOR_TERM, true)] })
    expect(previousHolder(s)?.name).toBe("Prev")
    expect(currentHolder(s)).toBeNull()
  })

  it("is null when the only holding is the current one", () => {
    expect(previousHolder(seat("President", { holdings: [holding("now@x.edu")] }))).toBeNull()
  })

  it("does not invent a predecessor from an ALUMNI login assignment", () => {
    // Only the roster carries dated history; an assignment has no term to rank.
    expect(previousHolder(seat("President", { assignments: [alumni("old@x.edu")] }))).toBeNull()
  })
})

describe("capSeatNames", () => {
  const rows = [
    { name: "President", filled: 9, incoming: 1, vacant: 2, total: 12 },
    { name: "VP Finance", filled: 6, incoming: 0, vacant: 3, total: 9 },
    { name: "VP Events", filled: 4, incoming: 2, vacant: 1, total: 7 },
    { name: "Secretary", filled: 1, incoming: 0, vacant: 4, total: 5 },
  ]

  it("leaves a breakdown that already fits alone", () => {
    expect(capSeatNames(rows, 4)).toBe(rows)
    expect(capSeatNames(rows, 9)).toBe(rows)
  })

  it("rolls the tail into one bucket instead of dropping it", () => {
    expect(capSeatNames(rows, 3)).toEqual([
      rows[0],
      rows[1],
      { name: OTHER_SEATS_LABEL, filled: 5, incoming: 2, vacant: 5, total: 12 },
    ])
  })

  it("conserves every count at any cap — the old .slice(0, 8) did not", () => {
    const sum = (list: typeof rows) =>
      list.reduce((n, r) => n + r.filled + r.incoming + r.vacant, 0)
    for (const limit of [1, 2, 3, 4, 5]) {
      const capped = capSeatNames(rows, limit)
      expect(capped.length).toBeLessThanOrEqual(limit)
      expect(sum(capped)).toBe(sum(rows))
    }
  })
})

describe("toSeatFacts", () => {
  it("maps a login assignment and a roster holding onto one seat", () => {
    const facts = toSeatFacts({
      name: "President",
      assignments: [{ status: "ACTIVE", user: { id: "u1", name: "Pat", email: "pat@x.edu" } }],
      holdings: [
        { isCurrent: true, term: CURRENT_ACADEMIC_TERM, person: { id: "p1", name: "Pat Chen", email: "pat@x.edu" } },
      ],
    })
    expect(seatIsFilled(facts)).toBe(true)
    expect(countCurrentHolders([facts])).toBe(1)
    expect(currentHolder(facts)).toMatchObject({
      name: "Pat Chen",
      email: "pat@x.edu",
      term: CURRENT_ACADEMIC_TERM,
    })
  })

  it("keeps a holding's own term rather than inheriting the holder's fields", () => {
    const facts = toSeatFacts({
      name: "President",
      holdings: [
        { isCurrent: false, term: PRIOR_TERM, person: { name: "Prev", email: "prev@x.edu" } },
      ],
    })
    expect(facts.holdings[0]).toMatchObject({ term: PRIOR_TERM, isCurrent: false })
    expect(previousHolder(facts)).toMatchObject({ name: "Prev", email: "prev@x.edu" })
  })

  it("falls back to the row id for identity, but never offers it as an address", () => {
    const facts = toSeatFacts({
      name: "President",
      assignments: [{ status: "ACTIVE", user: { id: "u1", name: "No Email" } }],
    })
    expect(facts.assignments[0]).toMatchObject({ key: "u1", email: null })
  })

  it("tolerates a role with no assignments or holdings selected", () => {
    expect(toSeatFacts({ name: "VP Tech" })).toEqual({
      name: "VP Tech",
      assignments: [],
      holdings: [],
    })
  })
})

describe("groupSeatFactsByOrg", () => {
  it("splits loaded rows into one seat list per club", () => {
    const rows: OrgSeatFacts[] = [
      { organizationId: "a", ...seat("President", { assignments: [active("1@x.edu")] }) },
      { organizationId: "b", ...seat("President") },
      { organizationId: "a", ...seat("VP Finance", { holdings: [holding("2@x.edu")] }) },
    ]
    const byOrg = groupSeatFactsByOrg(rows)
    expect(summariseSeats(byOrg.get("a")!)).toMatchObject({ total: 2, filled: 2 })
    expect(summariseSeats(byOrg.get("b")!)).toMatchObject({ total: 1, filled: 0 })
  })
})

describe("the four old definitions, on one club", () => {
  /**
   * A nine-seat club shaped like the one that reported 4/9, 8/9 and "3 active
   * members" at the same time. Each old rule is recomputed here from the same
   * rows, to pin down what the canonical answer replaces.
   */
  const club: SeatFacts[] = [
    // Both records for one human — the case that made counts disagree.
    seat("President", { assignments: [active("a@x.edu")], holdings: [holding("a@x.edu")] }),
    // Roster only: no login account exists yet.
    seat("VP Finance", { holdings: [holding("b@x.edu")] }),
    // Login only.
    seat("VP Marketing", { assignments: [active("c@x.edu")] }),
    // Two co-holders — two people, still one seat.
    seat("VP Events", { assignments: [active("d@x.edu"), active("e@x.edu")] }),
    // Incoming only: a plan, not a staffed seat.
    seat("VP Tech", { assignments: [shadow("f@x.edu")] }),
    // History only: an ALUMNI row and an ended holding.
    seat("Secretary", {
      assignments: [alumni("g@x.edu")],
      holdings: [holding("g@x.edu", "G", PRIOR_TERM, false)],
    }),
    // Stale roster row left flagged current from last year.
    seat("Treasurer", { holdings: [holding("h@x.edu", "H", PRIOR_TERM, true)] }),
    seat("Historian"),
    seat("Webmaster"),
  ]

  const summary = summariseSeats(club)

  it("settles on one answer: 4 filled, 1 incoming, 4 vacant of 9", () => {
    expect(summary).toMatchObject({
      total: 9,
      filled: 4,
      incoming: 1,
      vacant: 4,
      withSuccessor: 1,
      fillPct: 44,
    })
  })

  it("is lower than definition A, which counted any history as filled", () => {
    const anyHistory = club.filter(
      (s) => s.assignments.length > 0 || s.holdings.length > 0
    ).length
    expect(anyHistory).toBe(7)
    expect(summary.filled).toBeLessThan(anyHistory)
  })

  it("replaces definition B, which counted ACTIVE rows and not seats at all", () => {
    const activeRows = club.reduce(
      (n, s) => n + s.assignments.filter((a) => a.status === "ACTIVE").length,
      0
    )
    // It lands on 4 here too — by luck, not agreement. B misses VP Finance
    // (held on the roster, no login account) and counts VP Events twice for its
    // two co-holders, and the two errors happen to cancel. A number that is
    // right by cancellation is exactly why this needed one definition.
    expect(activeRows).toBe(4)
    expect(seatIsFilled(club[1])).toBe(true) // VP Finance: filled, invisible to B
    expect(club[1].assignments).toHaveLength(0)
    expect(club[3].assignments.filter((a) => a.status === "ACTIVE")).toHaveLength(2)
    expect(seatState(club[3])).toBe("FILLED") // VP Events: one seat, not two
  })

  it("is lower than definition C, which folded shadows into filled", () => {
    const withShadow = club.filter(
      (s) =>
        s.assignments.some((a) => a.status === "ACTIVE" || a.status === "SHADOW") ||
        s.holdings.some((h) => h.isCurrent)
    ).length
    expect(withShadow).toBe(6) // VP Tech's successor and the stale Treasurer row
    expect(summary.filled).toBeLessThan(withShadow)
  })

  it("reports people separately from seats, each human once", () => {
    // a, b, c, d, e hold seats today; g and h do not.
    expect(countCurrentHolders(club)).toBe(5)
    expect(countCurrentHolders(club)).toBeGreaterThan(summary.filled)
  })

  it("gives the headline tile and the capped chart the same totals", () => {
    const chart = capSeatNames(summariseSeatsByName(club), 4)
    expect(chart.reduce((n, r) => n + r.filled, 0)).toBe(summary.filled)
    expect(chart.reduce((n, r) => n + r.incoming, 0)).toBe(summary.incoming)
    expect(chart.reduce((n, r) => n + r.vacant, 0)).toBe(summary.vacant)
    expect(chart.reduce((n, r) => n + r.total, 0)).toBe(summary.total)
  })
})
