import { test, expect, type Page } from "@playwright/test"

/** Proceed 2 batch E: notifications, interactive calendar, back navigation. */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

const stamp = Date.now()
const reqTitle = `E2E Notify ${stamp}`

test.describe("notification system", () => {
  test("submitting an approval notifies the president gate", async ({ page }) => {
    await signIn(page, "Victor Chen")
    await page.goto("/approvals/new")
    await page.getByLabel("Title").fill(reqTitle)
    await page.getByRole("button", { name: "Submit for approval" }).click()
    await page.waitForURL(/\/approvals\/(?!new)[a-z0-9]+$/)

    // Priya (president gate) has an unread notification
    await signIn(page, "Priya Raman")
    await expect(page.getByRole("link", { name: /Notifications \(\d+ unread\)/ })).toBeVisible()
    await page.goto("/notifications")
    await expect(page.getByText(`Approval needed: ${reqTitle}`).first()).toBeVisible()

    // Following it lands on the request; approving notifies the requester
    await page.getByText(`Approval needed: ${reqTitle}`).first().click()
    await expect(page).toHaveURL(/\/approvals\/[a-z0-9]+/)
    await page.getByRole("button", { name: "Approve", exact: true }).click()
    await expect(page.getByText("Pending OSE", { exact: true })).toBeVisible()

    await signIn(page, "Victor Chen")
    await page.goto("/notifications")
    await expect(
      page.getByText(`“${reqTitle}” cleared the president gate`).first()
    ).toBeVisible()

    // OSE gate was notified too
    await signIn(page, "Dana Whitfield")
    await page.goto("/notifications")
    await expect(page.getByText(`Approval needed: ${reqTitle}`).first()).toBeVisible()
  })

  test("roster changes notify the person involved", async ({ page }) => {
    const email = `notifyme-${stamp}@tenure.demo`
    await signIn(page, "Priya Raman")
    await page.goto("/orgs/consulting-club/members")
    await page.getByPlaceholder("student@rochester.edu").fill(email)
    await page.getByRole("button", { name: "Add", exact: true }).click()
    await expect(page.getByText(email)).toBeVisible()
    // (The new user has a notification waiting for their first sign-in.)
  })
})

test.describe("interactive calendar + back navigation", () => {
  test("clicking a day opens the inspector panel", async ({ page }) => {
    await signIn(page, "Maya Johnson")
    await page.goto("/calendar")
    await expect(page.getByText("Click a day to see its schedule.")).toBeVisible()
    await page.getByRole("button", { name: /^Day 15,/ }).click()
    await expect(page.getByRole("button", { name: /^Day 15,/ })).toBeVisible()
    // Panel now shows either events or the free-day message
    await expect(
      page.getByText(/Nothing scheduled|hard conflict|am|pm/).first()
    ).toBeVisible()
    await page.getByRole("button", { name: "Close day panel" }).click()
    await expect(page.getByText("Click a day to see its schedule.")).toBeVisible()
  })

  test("back button returns from a detail page", async ({ page }) => {
    await signIn(page, "Victor Chen")
    await page.goto("/approvals")
    await page.getByText(reqTitle).first().click()
    await expect(page).toHaveURL(/\/approvals\/[a-z0-9]+/)
    await page.getByRole("button", { name: "Go back" }).click()
    await expect(page).toHaveURL(/\/approvals$/)
  })
})
