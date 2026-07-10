/**
 * Idempotent pilot seed — safe to run on every container start.
 * Creates the demo institution, clubs, role seats, and users so the
 * pilot is explorable before real rosters are imported.
 */
import { PrismaClient } from "@prisma/client"

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

  async function org(name, slug, description) {
    return db.organization.upsert({
      where: { slug },
      update: {},
      create: { institutionId: institution.id, name, slug, description },
    })
  }

  const consulting = await org(
    "Simon Consulting Club",
    "consulting-club",
    "Case prep, pro-bono consulting projects, and firm treks."
  )
  const finance = await org(
    "Finance & Investment Society",
    "finance-society",
    "Stock pitches, treks to NYC, and alumni networking."
  )
  await org(
    "Public Speaking Guild",
    "public-speaking",
    "Weekly practice sessions and semester speech competitions."
  )

  async function role(organizationId, name, scope, description) {
    return db.role.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name, scope, description },
    })
  }

  const cPresident = await role(consulting.id, "President", "PRESIDENT", "Club admin — final club-level approval")
  const cVpFinance = await role(consulting.id, "VP Finance & Operations", "FUNCTIONAL", "Budget owner")
  const cMember = await role(consulting.id, "Member", "MEMBER", "General member")
  const fPresident = await role(finance.id, "President", "PRESIDENT", "Club admin")
  await role(finance.id, "VP Events", "FUNCTIONAL", "Event planning lead")

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
  await assign(president.id, fPresident.id, "ACTIVE")

  console.log("✅ Seed complete")
}

main()
  .catch((e) => {
    console.error("Seed failed:", e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
