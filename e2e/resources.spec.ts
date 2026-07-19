import { test, expect, type Page } from "@playwright/test"

/** Board resources: quick links on the dashboard, full board under /resources. */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

test.describe("board resources", () => {
  test("dashboard surfaces a compact rotating quick-links card", async ({ page }) => {
    await signIn(page, "Priya Raman")
    await expect(page.getByText("Quick links")).toBeVisible()
    // The compact card rotates through the seat's resource links and offers a
    // route to the full resource hub.
    await expect(page.getByRole("link", { name: /All resources/ })).toBeVisible()
  })

  test("resources page groups by seat and links out to the real forms", async ({ page }) => {
    await signIn(page, "Priya Raman")
    await page.goto("/resources")

    await expect(page.getByRole("heading", { name: "Board Resources" })).toBeVisible()

    await expect(
      page.getByRole("link", { name: /SimonSource/ }).first()
    ).toHaveAttribute("href", /12twenty\.com/)
    await expect(
      page.getByRole("link", { name: /Student Expense Form/ }).first()
    ).toHaveAttribute("href", /form\.jotform\.com/)
    await expect(
      page.getByRole("link", { name: /Purchase Request/ }).first()
    ).toHaveAttribute("href", /student-purchase-request-form/)
    await expect(
      page.getByRole("link", { name: /Simon Merch Request/ }).first()
    ).toHaveAttribute("href", /ainslie-ose-merch/)
  })

  test("a president sees president-only resources", async ({ page }) => {
    await signIn(page, "Priya Raman")
    await page.goto("/resources")

    await expect(page.getByText("Leadership Eligibility Checklist")).toBeVisible()
    await expect(page.getByText("Club Transition & Onboarding Checklist")).toBeVisible()
  })

  test("VP Events resources carry the padlet links", async ({ page }) => {
    await signIn(page, "Dana Whitfield") // OSE sees every section
    await page.goto("/resources")

    await expect(
      page.getByRole("link", { name: /Club Event Flyer Process/ }).first()
    ).toHaveAttribute("href", /padlet\.com/)
    await expect(
      page.getByRole("link", { name: /Event Planning Checklist/ }).first()
    ).toHaveAttribute("href", /padlet\.com/)
  })

  test("hard rules are shown next to the resource they constrain", async ({ page }) => {
    await signIn(page, "Dana Whitfield")
    await page.goto("/resources")

    await expect(page.getByText(/at least 3 weeks \(21 days\) in advance/i)).toBeVisible()
  })
})
