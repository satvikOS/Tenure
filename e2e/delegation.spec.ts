import { test, expect, type Page } from "@playwright/test"

/**
 * Approval delegation ("acted on behalf of") — a president names a backup, who
 * can then act on the president's gate while the president can't, with the trail
 * recording on whose behalf. Turnover-proof governance.
 */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

test.describe("approval delegation", () => {
  test("a president's backup approves on their behalf, recorded in the trail", async ({ page }) => {
    // 1. The president names Victor (a VP, not a president) as her backup.
    await signIn(page, "Priya Raman") // President, consulting club
    await page.goto("/settings")
    await page.getByLabel("Backup approver").selectOption({ label: "Victor Chen" })
    await page.getByRole("button", { name: "Set backup" }).click()
    await expect(page.getByText(/Victor Chen.*can approve on your behalf/i)).toBeVisible()

    // 2. A member files a reimbursement — it lands at the PRESIDENT gate.
    await signIn(page, "Maya Johnson") // Member, consulting club
    await page.goto("/orgs/simon-consulting-club/finance")
    await page.getByLabel("Budget line").selectOption({ label: "Speaker Honoraria" })
    await page.getByLabel("Amount").fill("40")
    await page.getByLabel("What is this for?").fill("E2E delegation reimbursement")
    await page.getByRole("button", { name: "Submit request" }).click()
    await page.waitForURL(/\/approvals\/[a-z0-9]+/)
    const approvalUrl = page.url()

    // 3. Victor — who has NO president authority of his own — can act via the
    //    delegation, and the page tells him so.
    await signIn(page, "Victor Chen") // VP Finance, consulting club
    await page.goto(approvalUrl)
    await expect(page.getByText(/acting as a backup for Priya/i)).toBeVisible()
    await page.getByRole("button", { name: "Approve", exact: true }).click()

    // 4. The append-only history records that he acted on the president's behalf.
    await expect(page.getByText(/on behalf of Priya Raman/i)).toBeVisible({ timeout: 10000 })
  })
})
