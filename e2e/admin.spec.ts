import { test, expect, type Page } from "@playwright/test"

/** Proceed 1: real clubs, permanent position IDs, OSE club administration. */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

const stamp = Date.now()

test.describe("real clubs + permanent position IDs", () => {
  test("clubs are grouped by category with the real Simon roster", async ({ page }) => {
    await signIn(page, "Dana Whitfield")
    await page.goto("/orgs")
    await expect(page.getByText(/Professional \(\d+\)/)).toBeVisible()
    await expect(page.getByText(/Community \(\d+\)/)).toBeVisible()
    await expect(page.getByText(/Social \(\d+\)/)).toBeVisible()
    await expect(page.getByText(/Organizations \(\d+\)/)).toBeVisible()
    await expect(page.getByText("Simon School Venture Fund")).toBeVisible()
    await expect(page.getByText("Uncorked")).toBeVisible()
  })

  test("roster seats show their permanent position IDs", async ({ page }) => {
    await signIn(page, "Priya Raman")
    await page.goto("/orgs/consulting-club/members")
    await expect(page.getByText("Position ID SCC-PRES", { exact: false })).toBeVisible()
    await expect(page.getByText("Position ID SCC-VP-CASI", { exact: false })).toBeVisible()
  })

  test("OSE director charters a club with standard seats", async ({ page }) => {
    await signIn(page, "Dana Whitfield")
    await page.goto("/orgs")
    await page.getByPlaceholder("Simon Real Estate Club").fill(`E2E Chess Club ${stamp}`)
    await page.getByRole("button", { name: "Charter club" }).click()
    await page.waitForURL(/\/members$/)
    await expect(page.getByRole("heading", { name: `E2E Chess Club ${stamp}` })).toBeVisible()
    await expect(page.getByText("President", { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/Position ID /).first()).toBeVisible()
  })

  test("club members cannot charter clubs", async ({ page }) => {
    await signIn(page, "Priya Raman")
    await page.goto("/orgs")
    await expect(page.getByText("Charter a new club")).not.toBeVisible()
  })
})
