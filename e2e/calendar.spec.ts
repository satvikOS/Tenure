import { test, expect, type Page } from "@playwright/test"

/**
 * Week 4: shared calendar, conflict detection, approval-linked publishing.
 * Runs after app.spec.ts (workers=1) against the same seeded database.
 */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

// A far-future evening so seeded/e2e data can't collide with it
const day = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10)
const stamp = Date.now()
const firstTitle = `E2E Mixer ${stamp}`
const clashTitle = `E2E Clash ${stamp}`

test.describe("calendar + conflicts + publishing", () => {
  test("VP proposes an event — it enters the approval chain pending", async ({ page }) => {
    await signIn(page, "Victor Chen")
    await page.goto("/calendar/new")
    await page.getByLabel("Title").fill(firstTitle)
    await page.getByLabel("Starts").fill(`${day}T18:00`)
    await page.getByLabel("Ends").fill(`${day}T20:00`)
    await page.getByLabel("Venue").fill("Schlegel 203")
    await page.getByRole("button", { name: /Check conflicts/ }).click()
    await page.waitForURL(/\/calendar\/[a-z0-9]+/)

    await expect(page.getByText("Pending Approval", { exact: true })).toBeVisible()
    await expect(page.getByText("No conflicts detected", { exact: false })).toBeVisible()
    await expect(page.getByRole("link", { name: "View request" })).toBeVisible()
  })

  test("an overlapping same-venue proposal is flagged as a hard conflict", async ({ page }) => {
    await signIn(page, "Priya Raman")
    await page.goto("/calendar/new")
    await page.getByLabel("Title").fill(clashTitle)
    await page.getByLabel("Starts").fill(`${day}T19:00`)
    await page.getByLabel("Ends").fill(`${day}T21:00`)
    await page.getByLabel("Venue").fill("Schlegel 203")
    await page.getByRole("button", { name: /Check conflicts/ }).click()
    await page.waitForURL(/\/calendar\/[a-z0-9]+/)

    await expect(page.getByText("Hard conflict").first()).toBeVisible()
    await expect(page.getByText(/Venue clash/).first()).toBeVisible()
  })

  test("approvers see the conflicts on the approval request", async ({ page }) => {
    // Priya is the president — her own proposal went straight to the OSE gate
    await signIn(page, "Dana Whitfield")
    await page.goto("/approvals")
    await page.getByText(clashTitle).first().click()
    await expect(page.getByText("Schedule conflicts")).toBeVisible()
    await expect(page.getByText("Hard conflict").first()).toBeVisible()
  })

  test("approving through both gates publishes the event", async ({ page }) => {
    // President approves the VP's clean event
    await signIn(page, "Priya Raman")
    await page.goto("/approvals")
    await page.getByText(firstTitle).first().click()
    await page.getByRole("button", { name: "Approve", exact: true }).click()
    await expect(page.getByText("Pending OSE", { exact: true })).toBeVisible()

    // OSE approves → event publishes
    await signIn(page, "Dana Whitfield")
    await page.goto("/approvals")
    await page.getByText(firstTitle).first().click()
    await page.getByRole("button", { name: "Approve", exact: true }).click()
    await expect(page.getByText("Approved", { exact: true })).toBeVisible()

    // The event is now visible on the month grid for its month
    await page.goto(`/calendar?m=${day.slice(0, 7)}`)
    await expect(page.getByRole("link", { name: new RegExp(firstTitle) })).toBeVisible()
  })

  test("rejecting an event proposal cancels the event", async ({ page }) => {
    await signIn(page, "Dana Whitfield")
    await page.goto("/approvals")
    await page.getByText(clashTitle).first().click()
    await page.getByPlaceholder(/Optional note/).fill("Venue is double-booked — pick another slot.")
    await page.getByRole("button", { name: "Reject", exact: true }).click()
    await expect(page.getByText("Rejected", { exact: true })).toBeVisible()

    // Cancelled events drop off the shared calendar
    await page.goto(`/calendar?m=${day.slice(0, 7)}`)
    await expect(page.getByRole("link", { name: new RegExp(clashTitle) })).not.toBeVisible()
  })

  test("published events appear for regular members too", async ({ page }) => {
    await signIn(page, "Maya Johnson")
    await page.goto(`/calendar?m=${day.slice(0, 7)}`)
    await expect(page.getByRole("link", { name: new RegExp(firstTitle) })).toBeVisible()
  })

  test("month grid navigates and settings offers themes", async ({ page }) => {
    await signIn(page, "Maya Johnson")
    await page.goto("/calendar")
    await expect(page.getByRole("link", { name: "Next month" })).toBeVisible()
    await page.getByRole("link", { name: "Next month" }).click()
    await expect(page).toHaveURL(/calendar\?m=\d{4}-\d{2}/)

    await page.goto("/settings")
    await expect(page.getByRole("radio", { name: "Dark" })).toBeVisible()
    await page.getByRole("radio", { name: "Dark" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.getByRole("radio", { name: "Light" }).click()
    await expect(page.locator("html")).not.toHaveClass(/dark/)
    await expect(page.getByText("Your seats")).toBeVisible()
  })
})
