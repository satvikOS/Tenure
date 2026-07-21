import { test, expect, type Page } from "@playwright/test"

/** VP of Finance dashboard: actual-vs-budget chart, live forecasting, Excel upload. */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

const FINANCE_URL = "/orgs/simon-consulting-club/finance"

test.describe("finance dashboard", () => {
  test("VP of Finance lands on a Club finances card that links to the graph", async ({
    page,
  }) => {
    await signIn(page, "Victor Chen")

    // Straight on the dashboard — no digging through club tabs
    await expect(page.getByText("Club finances")).toBeVisible()
    await expect(page.getByText(/of .* spent/).first()).toBeVisible()

    await page
      .getByRole("link", { name: /Simon Consulting Club/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/orgs\/simon-consulting-club\/finance/)
    await expect(
      page.getByRole("img", { name: /Budget versus actual spending/ })
    ).toBeVisible()
  })

  test("VP of Finance sees budget lines, summary and the chart", async ({ page }) => {
    await signIn(page, "Victor Chen") // VP Finance & Operations, consulting club
    await page.goto(FINANCE_URL)

    await expect(page.getByText("Total budget")).toBeVisible()
    await expect(page.getByText("Spent to date")).toBeVisible()
    await expect(
      page.getByRole("img", { name: /Budget versus actual spending/ })
    ).toBeVisible()
    // Rendered in both the chart and the table
    await expect(page.getByText("Catering & Food").first()).toBeVisible()
  })

  test("editing a projected value updates savings live, without saving", async ({ page }) => {
    await signIn(page, "Victor Chen")
    await page.goto(FINANCE_URL)

    // Seeded totals leave the club projecting a saving
    await expect(page.getByText("Projected savings")).toBeVisible()

    // Push one category's projection way past budget → now an overspend
    const travel = page.getByLabel("Projected spend for Travel (Career Treks)")
    await travel.fill("9000")
    await travel.blur()

    await expect(page.getByText("Projected overspend")).toBeVisible()
    await expect(
      page.getByText(/Unsaved projection/)
    ).toBeVisible()
  })

  test("a general member gets a read-only view", async ({ page }) => {
    await signIn(page, "Maya Johnson") // Member, consulting club
    await page.goto(FINANCE_URL)

    await expect(page.getByText("Total budget")).toBeVisible()
    await expect(page.getByText(/Read-only/)).toBeVisible()
    // No editable projection inputs
    await expect(page.getByLabel(/Projected spend for/)).toHaveCount(0)
  })

  test("VP of Finance can add a budget line", async ({ page }) => {
    await signIn(page, "Victor Chen")
    await page.goto(FINANCE_URL)

    const unique = `Test Line ${Date.now()}`
    await page.getByPlaceholder("Category, e.g. Catering").fill(unique)
    await page.getByLabel("Budgeted").fill("500")
    await page.getByLabel("Spent so far").fill("120")
    await page.getByRole("button", { name: "Add line" }).click()

    // Appears in both the chart and the table
    await expect(page.getByText(unique).first()).toBeVisible()
  })

  test("uploading a spreadsheet turns it into the dashboard", async ({ page }) => {
    await signIn(page, "Victor Chen")
    await page.goto(FINANCE_URL)

    const csv = [
      "Category,Planned Budget,Amount Spent",
      "Workshop Series,1500,900",
      "Networking Night,800,650",
      "Total,2300,1550",
    ].join("\n")

    await page.locator('input[type="file"]').setInputFiles({
      name: "budget.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    })

    // Preview reads two rows and skips the Total row
    await expect(page.getByText(/Read 2 categories/)).toBeVisible()
    await expect(page.getByText(/skipped 1 row/)).toBeVisible()

    await page.getByRole("button", { name: /Replace imported lines/ }).click()

    // The imported categories now appear in the live dashboard (chart + table)
    await expect(page.getByText("Workshop Series").first()).toBeVisible()
    await expect(page.getByText("Networking Night").first()).toBeVisible()
  })
})
