/**
 * Idempotent pilot seed — safe to run on every container start.
 *
 * Seeds the demo institution, the real Simon club roster (from
 * scripts/roster-data.mjs, generated from the OSE spreadsheets), and the
 * seven demo login accounts.
 *
 * Real board members are seeded as DirectoryPerson records, NOT Users: while
 * dev sign-in is enabled anyone with the URL could otherwise impersonate a
 * real student. They are visible, searchable and emailable; they just are not
 * accounts you can sign in as.
 */
import { PrismaClient } from "@prisma/client"

import { ROSTER, ADVISORS, CURRENT_TERM, PRIOR_TERM } from "./roster-data.mjs"

const db = new PrismaClient()

function scopeFor(position) {
  const p = position.toLowerCase()
  if (p.startsWith("president")) return "PRESIDENT"
  if (p.startsWith("managing director")) return "PRESIDENT" // SVC's top seat
  return "FUNCTIONAL"
}

async function main() {
  const institution = await db.institution.upsert({
    where: { slug: "rochester" },
    update: {},
    create: {
      name: "University of Rochester",
      slug: "rochester",
      domain: "rochester.edu",
    },
  })

  async function user(email, name) {
    return db.user.upsert({
      where: { email },
      update: {},
      create: { email, name, emailVerified: new Date() },
    })
  }

  const director = await user("director@tenure.demo", "Dana Whitfield")
  const staff = await user("staff@tenure.demo", "Sam Ortiz")
  const president = await user("president@tenure.demo", "Priya Raman")
  const vpFinance = await user("vp.finance@tenure.demo", "Victor Chen")
  const memberUser = await user("member@tenure.demo", "Maya Johnson")
  const incoming = await user("incoming.president@tenure.demo", "Isaiah Brooks")
  const pastPresident = await user("alumni@tenure.demo", "Alex Kim")

  for (const [u, role] of [
    [director, "OSE_DIRECTOR"],
    [staff, "OSE_STAFF"],
  ]) {
    await db.institutionMembership.upsert({
      where: { userId_institutionId: { userId: u.id, institutionId: institution.id } },
      update: { role },
      create: { userId: u.id, institutionId: institution.id, role },
    })
  }

  // ── Directory people (board members + advisors) ────────────────────────────
  const personIdByEmail = new Map()

  async function directoryPerson({ name, email, kind, affiliation }) {
    const key = email.toLowerCase()
    if (personIdByEmail.has(key)) return personIdByEmail.get(key)
    const person = await db.directoryPerson.upsert({
      where: { email: key },
      update: { name, kind, affiliation },
      create: { email: key, name, kind, affiliation },
    })
    personIdByEmail.set(key, person.id)
    return person.id
  }

  for (const advisor of ADVISORS) {
    await directoryPerson({ ...advisor, kind: "ADVISOR" })
  }

  // ── Clubs, seats, holders (2026-2027 roster) ───────────────────────────────
  for (const club of ROSTER) {
    // A club that already exists under its previous slug is renamed in place,
    // so its documents, memory and history follow it to the new name.
    // Prefer a row already on the new slug (this seed runs on every boot);
    // otherwise adopt the row on the legacy slug and rename it.
    const existing =
      (await db.organization.findUnique({ where: { slug: club.slug } })) ??
      (club.legacySlug
        ? await db.organization.findUnique({ where: { slug: club.legacySlug } })
        : null)

    const data = {
      name: club.name,
      shortName: club.shortName,
      acronym: club.acronym,
      category: club.category,
      rosterNote: club.note,
      status: "ACTIVE",
    }

    const org = existing
      ? await db.organization.update({
          where: { id: existing.id },
          data: { ...data, slug: club.slug },
        })
      : await db.organization.create({
          data: { ...data, slug: club.slug, institutionId: institution.id },
        })

    // Advisors for this club
    for (const advisor of club.advisors) {
      const personId = await directoryPerson({ ...advisor, kind: "ADVISOR" })
      await db.organizationAdvisor.upsert({
        where: { organizationId_personId: { organizationId: org.id, personId } },
        update: {},
        create: { organizationId: org.id, personId },
      })
    }

    const desiredCodes = new Set(club.seats.map((s) => s.positionCode))
    const desiredNames = new Set([...club.seats.map((s) => s.name), "Member"])

    // Position codes are globally unique. A renamed seat ("VP Casing" ->
    // "VP of Casing") reduces to the same code, so release the code from the
    // old row before the new one claims it.
    const stale = await db.role.findMany({
      where: { organizationId: org.id, positionCode: { in: [...desiredCodes] } },
    })
    for (const role of stale) {
      if (!desiredNames.has(role.name)) {
        await db.role.update({ where: { id: role.id }, data: { positionCode: null } })
      }
    }

    for (const [index, seat] of club.seats.entries()) {
      const role = await db.role.upsert({
        where: { organizationId_name: { organizationId: org.id, name: seat.name } },
        update: {
          positionCode: seat.positionCode,
          positionNote: seat.positionNote,
          vacancyNote: seat.holder ? null : seat.vacancyNote || null,
          scope: scopeFor(seat.basePosition),
          seatOrder: index,
        },
        create: {
          organizationId: org.id,
          name: seat.name,
          positionCode: seat.positionCode,
          positionNote: seat.positionNote,
          vacancyNote: seat.holder ? null : seat.vacancyNote || null,
          scope: scopeFor(seat.basePosition),
          seatOrder: index,
        },
      })

      async function hold(person, term, isCurrent) {
        const personId = await directoryPerson({
          name: person.name,
          email: person.email,
          kind: "STUDENT",
          affiliation: null,
        })
        await db.seatHolding.upsert({
          where: { roleId_personId_term: { roleId: role.id, personId, term } },
          update: { isCurrent },
          create: { roleId: role.id, personId, term, isCurrent },
        })
      }

      if (seat.holder) await hold(seat.holder, CURRENT_TERM, true)
      // Last year's holder — the person to call during a handoff
      if (seat.predecessor) await hold(seat.predecessor, PRIOR_TERM, false)
    }

    // Generic membership seat, used by the demo accounts
    await db.role.upsert({
      where: { organizationId_name: { organizationId: org.id, name: "Member" } },
      update: {},
      create: {
        organizationId: org.id,
        name: "Member",
        scope: "MEMBER",
        // club.code, not the legacy helper: initials alone collide
        // (Simon Says and Simon Sports both reduce to "SS")
        positionCode: `${club.code}-MEMB`,
      },
    })

    // Drop seats that no longer exist on the roster, but only when nothing is
    // attached to them — never delete a seat that carries history.
    const obsolete = await db.role.findMany({
      where: { organizationId: org.id, name: { notIn: [...desiredNames] } },
      include: {
        _count: { select: { assignments: true, memoryRecords: true, holdings: true } },
      },
    })
    for (const role of obsolete) {
      const { assignments, memoryRecords, holdings } = role._count
      if (assignments + memoryRecords + holdings === 0) {
        await db.role.delete({ where: { id: role.id } })
      }
    }
  }

  // Clubs from earlier scaffolds that the 2026-2027 roster does not list
  const currentSlugs = new Set(ROSTER.map((c) => c.slug))
  await db.organization.updateMany({
    where: { institutionId: institution.id, slug: { notIn: [...currentSlugs] } },
    data: { status: "ARCHIVED" },
  })

  // ── Demo assignments (the only accounts that can actually sign in) ─────────
  const consulting = await db.organization.findUniqueOrThrow({
    where: { slug: "simon-consulting-club" },
  })

  async function findRole(organizationId, name) {
    return db.role.findUniqueOrThrow({
      where: { organizationId_name: { organizationId, name } },
    })
  }

  const cPresident = await findRole(consulting.id, "President")
  const cVpFinance = await findRole(consulting.id, "VP Finance & Operations")
  const cMember = await findRole(consulting.id, "Member")

  async function assign(userId, roleId, status, extra = {}) {
    const existing = await db.roleAssignment.findFirst({ where: { userId, roleId } })
    if (existing) {
      return db.roleAssignment.update({ where: { id: existing.id }, data: { status } })
    }
    return db.roleAssignment.create({ data: { userId, roleId, status, ...extra } })
  }

  await assign(president.id, cPresident.id, "ACTIVE")
  await assign(vpFinance.id, cVpFinance.id, "ACTIVE")
  await assign(memberUser.id, cMember.id, "ACTIVE")
  await assign(incoming.id, cPresident.id, "SHADOW")
  await assign(pastPresident.id, cPresident.id, "ALUMNI", {
    startDate: new Date("2024-08-01"),
    endDate: new Date("2025-05-15"),
  })
  // Priya also chairs Simon Women in Business (real multi-club leadership)
  const swib = await db.organization.findUniqueOrThrow({
    where: { slug: "simon-women-in-business" },
  })
  await assign(president.id, (await findRole(swib.id, "President")).id, "ACTIVE")

  const counts = {
    clubs: ROSTER.length,
    seats: await db.role.count(),
    people: await db.directoryPerson.count(),
    holdings: await db.seatHolding.count(),
  }
  console.log(
    `✅ Seed complete — ${counts.clubs} clubs, ${counts.seats} seats, ` +
      `${counts.people} directory people, ${counts.holdings} seat holdings`
  )
}

main()
  .catch((e) => {
    console.error("Seed failed:", e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
