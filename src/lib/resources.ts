/**
 * Board resources — the forms, guides and policies officers actually need,
 * routed to the seat that needs them.
 *
 * Every board member currently keeps these in a bookmark folder, a Padlet, or
 * their predecessor's head. Holding them against the position code means they
 * survive the handoff.
 *
 * Sources: Ainslie OSE club board resources, the Club Event Request &
 * Execution Guide, the Off-Campus Alcohol Policy, the Alumni Outreach process,
 * and Career Oriented Travel Guidance.
 */

export type SeatKey =
  | "ALL"
  | "PRESIDENT"
  | "VP_FINANCE"
  | "VP_EVENTS"
  | "VP_MARKETING"
  | "MBA_REP"
  | "OSE"

export type ResourceKind = "form" | "guide" | "policy" | "tool" | "checklist"

export type Resource = {
  id: string
  title: string
  description: string
  /** External link, or an internal Tenure route */
  href: string
  external: boolean
  /**
   * False while the internal page is still being built. Unready resources
   * render as inert cards — a listed-but-dead link is worse than an honest
   * "not yet".
   */
  ready: boolean
  kind: ResourceKind
  seats: SeatKey[]
  /** Hard rule surfaced next to the link, e.g. a lead time */
  rule?: string
}

export const SEAT_LABELS: Record<SeatKey, string> = {
  ALL: "Every board member",
  PRESIDENT: "President",
  VP_FINANCE: "VP Finance & Operations",
  VP_EVENTS: "VP Events & Partnerships",
  VP_MARKETING: "VP Marketing & Communications",
  MBA_REP: "MBA First Year Rep",
  OSE: "Ainslie OSE",
}

export const KIND_LABELS: Record<ResourceKind, string> = {
  form: "Form",
  guide: "Guide",
  policy: "Policy",
  tool: "Tool",
  checklist: "Checklist",
}

export const RESOURCES: Resource[] = [
  // ── Everyone ───────────────────────────────────────────────────────────────
  {
    id: "simon-source",
    title: "SimonSource",
    description:
      "Submit event proposals, track registrations, and run event check-in.",
    href: "https://simon-rochester.12twenty.com/Login",
    external: true,
    ready: true,
    kind: "tool",
    seats: ["ALL"],
    rule: "Events must be submitted at least 3 weeks (21 days) in advance.",
  },
  {
    id: "purchase-request",
    title: "Purchase Request / Reimbursement",
    description: "Request a club purchase or start a reimbursement.",
    href: "https://form.jotform.com/OSE_studentengagement/student-purchase-request-form",
    external: true,
    ready: true,
    kind: "form",
    seats: ["ALL", "VP_FINANCE"],
    rule: "Submit at least 72 hours before the purchase. Unapproved purchases are never reimbursed.",
  },
  {
    id: "student-expense-form",
    title: "Student Expense Form",
    description:
      "Reimbursement submission. Combine itemized receipts and the attendee list into one PDF.",
    href: "https://form.jotform.com/OSE_studentengagement/student-expense-form-",
    external: true,
    ready: true,
    kind: "form",
    seats: ["ALL", "VP_FINANCE"],
    rule: 'Name the file "EER Last name, First name $xx" with the total requested.',
  },
  {
    id: "merch-request",
    title: "Simon Merch Request",
    description: "Order Simon-branded merchandise and supplies through OSE.",
    href: "https://form.jotform.com/OSE_studentengagement/ainslie-ose-merch-and-supplies-purc",
    external: true,
    ready: true,
    kind: "form",
    seats: ["ALL", "VP_MARKETING", "VP_EVENTS"],
    rule: "Submit at least 3 business days before the event.",
  },

  // ── VP Events & Partnerships ───────────────────────────────────────────────
  {
    id: "event-flyer-process",
    title: "Club Event Flyer Process",
    description: "How to get an event flyer designed, approved and distributed.",
    href: "https://padlet.com/rochester/club-board-resources-simon-business-school-aid638iawdx7os38/wish/MxrmZYkpGwJNaGOq",
    external: true,
    ready: true,
    kind: "guide",
    seats: ["VP_EVENTS", "VP_MARKETING"],
  },
  {
    id: "event-planning-checklist",
    title: "Event Planning Checklist",
    description: "Step-by-step checklist for planning and running a club event.",
    href: "https://padlet.com/rochester/club-board-resources-simon-business-school-aid638iawdx7os38/wish/Xb8YaL47dVDwayn1",
    external: true,
    ready: true,
    kind: "checklist",
    seats: ["VP_EVENTS"],
  },
  {
    id: "event-request-guide",
    title: "Club Event Request & Execution Guide",
    description:
      "The full rules for submitting and running events: lead times, payment pages, check-in, food, Slack posting, merch, alumni and Net Impact.",
    href: "/resources/event-guide",
    external: false,
    ready: true,
    kind: "guide",
    seats: ["VP_EVENTS", "PRESIDENT"],
    rule: "Do not promote an event until it is formally approved in SimonSource.",
  },
  {
    id: "alcohol-policy",
    title: "Off-Campus Event Alcohol Policy",
    description:
      "Required for every off-campus event where alcohol is provided.",
    href: "/resources/alcohol-policy",
    external: false,
    ready: true,
    kind: "policy",
    seats: ["VP_EVENTS", "PRESIDENT"],
    rule: "Email Student Life at least 7 days before the event, even if alcohol is not the focus.",
  },
  {
    id: "alumni-outreach",
    title: "Alumni Outreach & Vetting",
    description:
      "How to request contact with alumni, and when Advancement must approve the ask first.",
    href: "/resources/alumni-outreach",
    external: false,
    ready: true,
    kind: "policy",
    seats: ["VP_EVENTS", "PRESIDENT", "VP_MARKETING"],
    rule: "Never contact a listed alum before Diana Sipp responds.",
  },
  {
    id: "travel-guidance",
    title: "Career Oriented Travel Guidance",
    description:
      "The three support tiers for career treks, what Benet provides, and what your club owns.",
    href: "/resources/travel-guidance",
    external: false,
    ready: true,
    kind: "guide",
    seats: ["VP_EVENTS", "PRESIDENT"],
    rule: "De-brief with your staff coach within 10 days of the trek.",
  },

  // ── VP Finance & Operations ────────────────────────────────────────────────
  {
    id: "budget-template",
    title: "Club Budget Template (Excel)",
    description:
      "The standardized budget spreadsheet for every club — fill it in, then upload it on your club's Finance tab to turn it into a live dashboard.",
    href: "/api/templates/budget",
    external: false,
    ready: true,
    kind: "form",
    seats: ["ALL", "VP_FINANCE", "PRESIDENT"],
    rule: "One row per category. The Total row is calculated for you and ignored on upload.",
  },
  {
    id: "finance-handbook",
    title: "Club Finance Handbook",
    description:
      "Reimbursement process and turnaround, multi-club cost splits, the fiscal year, non-reimbursable expenses, and swag purchasing rules.",
    href: "/resources/finance",
    external: false,
    ready: true,
    kind: "guide",
    seats: ["VP_FINANCE", "PRESIDENT"],
    rule: "Audits are due the last weekday of every month. Missing one freezes club funds.",
  },

  // ── President ──────────────────────────────────────────────────────────────
  {
    id: "leadership-eligibility",
    title: "Leadership Eligibility Checklist",
    description:
      "Everything you must verify before recommending someone for a board position — and what OSE checks when confirming them.",
    href: "/eligibility",
    external: false,
    ready: false,
    kind: "checklist",
    seats: ["PRESIDENT", "OSE"],
    rule: "No leader may be announced before Ainslie OSE (and Benet CMC for professional clubs) approves.",
  },
  {
    id: "transition-checklist",
    title: "Club Transition & Onboarding Checklist",
    description:
      "The items an outgoing and incoming board must work through together.",
    href: "/transition",
    external: false,
    ready: false,
    kind: "checklist",
    seats: ["PRESIDENT"],
    rule: "At least two joint transition meetings, plus a 1:1 for every role.",
  },
  {
    id: "deliverables",
    title: "Club Deliverables & Expectations",
    description:
      "Board meeting cadence, events per mini-mester, finances, and MBA rep/MS VP appointments.",
    href: "/resources/deliverables",
    external: false,
    ready: true,
    kind: "guide",
    seats: ["PRESIDENT", "ALL"],
    rule: "At least one event and two advisor meetings per mini-mester, or the budget freezes.",
  },
]

/**
 * Maps a seat name from the OSE roster to the resource audience it belongs to.
 * Titles vary across clubs ("VP of Finance and Operations", "VP Finance &
 * Operations", "President (Oversees Finances)"), so match on intent.
 */
export function seatKeysForRole(roleName: string): SeatKey[] {
  const n = roleName.toLowerCase()
  const keys: SeatKey[] = ["ALL"]

  const isPresident = /president|managing director|chief operating/.test(n)
  if (isPresident) keys.push("PRESIDENT")

  // A president who explicitly covers a function inherits that function's
  // resources — small boards double up constantly.
  if (/financ|operations|treasur/.test(n)) keys.push("VP_FINANCE")
  if (/event|partnership/.test(n)) keys.push("VP_EVENTS")
  if (/marketing|communicat|social media/.test(n)) keys.push("VP_MARKETING")
  if (/mba rep|1y mba|first year rep/.test(n)) keys.push("MBA_REP")

  return [...new Set(keys)]
}

/** Resources for a set of seats, most specific first. */
export function resourcesForSeats(seats: SeatKey[]): Resource[] {
  const set = new Set(seats)
  return RESOURCES.filter((r) => r.seats.some((s) => set.has(s))).sort((a, b) => {
    // Seat-specific resources outrank the universal ones
    const aGeneral = a.seats.includes("ALL") ? 1 : 0
    const bGeneral = b.seats.includes("ALL") ? 1 : 0
    return aGeneral - bGeneral
  })
}

export function resourceById(id: string): Resource | undefined {
  return RESOURCES.find((r) => r.id === id)
}
