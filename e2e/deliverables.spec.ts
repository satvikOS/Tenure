import { test, expect, type Page } from "@playwright/test"

/** OSE club deliverables seeded onto the shared calendar. */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

test.describe("club deliverables", () => {
  test("monthly audit deadline appears on the calendar with its term", async ({ page }) => {
    await signIn(page, "Victor Chen")
    await page.goto("/calendar?m=2026-09")

    // Sept 30 2026 is the last weekday of the month
    await page.getByRole("button", { name: /^Day 30,/ }).click()
    await expect(page.getByText(/Monthly club audit due — September/).first()).toBeVisible()
    await expect(page.getByText(/Ainslie OSE · Fall A/).first()).toBeVisible()
  })

  test("audit dates land on weekdays, never a weekend", async ({ page }) => {
    await signIn(page, "Victor Chen")

    // October 31 2026 is a Saturday, so the audit must fall back to Friday 30th
    await page.goto("/calendar?m=2026-10")
    await page.getByRole("button", { name: /^Day 30,/ }).click()
    await expect(page.getByText(/Monthly club audit due — October/).first()).toBeVisible()
  })

  test("event submission deadlines carry the right mini-mester label", async ({ page }) => {
    await signIn(page, "Dana Whitfield")
    await page.goto("/calendar?m=2026-12")

    await page.getByRole("button", { name: /^Day 4,/ }).click()
    await expect(page.getByText(/Spring A event submissions due/).first()).toBeVisible()
  })

  test("deliverables render inert — no link to a detail page that does not exist", async ({
    page,
  }) => {
    await signIn(page, "Dana Whitfield")
    await page.goto("/calendar?m=2026-09")
    await page.getByRole("button", { name: /^Day 30,/ }).click()

    const audit = page.getByText(/Monthly club audit due/).first()
    await expect(audit).toBeVisible()
    // The deliverable must not be wrapped in an anchor
    await expect(
      page.getByRole("link", { name: /Monthly club audit due/ })
    ).toHaveCount(0)
  })
})
