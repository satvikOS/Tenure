/**
 * Idempotent pilot seed — safe to run on every container start.
 * Creates the demo institution, clubs, role seats, and users so the
 * pilot is explorable before real rosters are imported.
 */
import { PrismaClient } from "@prisma/client"
import { CLUBS, positionCode, slugify } from "./clubs-data.mjs"

const db = new PrismaClient()

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

  // ── Real Simon clubs + board seats (Clubs and Board Position.xlsx) ─────────
  // Each seat carries a permanent position code: knowledge attaches to the
  // job ID, not the person — people come and go, the seat's memory stays.
  for (const [clubName, { category, positions }] of Object.entries(CLUBS)) {
    const club = await db.organization.upsert({
      where: { slug: slugify(clubName) },
      update: { category },
      create: {
        institutionId: institution.id,
        name: clubName,
        slug: slugify(clubName),
        category,
      },
    })
    for (const pos of positions) {
      const scope = pos.toLowerCase().startsWith("president") ? "PRESIDENT" : "FUNCTIONAL"
      const code = positionCode(clubName, pos)
      await db.role.upsert({
        where: { organizationId_name: { organizationId: club.id, name: pos } },
        update: { positionCode: code },
        create: { organizationId: club.id, name: pos, scope, positionCode: code },
      })
    }
    await db.role.upsert({
      where: { organizationId_name: { organizationId: club.id, name: "Member" } },
      update: { positionCode: `${positionCode(clubName, "Member")}` },
      create: {
        organizationId: club.id,
        name: "Member",
        scope: "MEMBER",
        positionCode: positionCode(clubName, "Member"),
      },
    })
  }

  // Legacy demo-only clubs from the scaffold — archive if present
  for (const legacySlug of ["finance-society", "public-speaking"]) {
    await db.organization.updateMany({
      where: { slug: legacySlug },
      data: { status: "ARCHIVED" },
    })
  }

  const consulting = await db.organization.findUniqueOrThrow({
    where: { slug: "consulting-club" },
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
  const swibPresident = await findRole(swib.id, "President")
  await assign(president.id, swibPresident.id, "ACTIVE")

  console.log("✅ Seed complete")
}

main()
  .catch((e) => {
    console.error("Seed failed:", e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
