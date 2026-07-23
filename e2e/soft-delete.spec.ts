import { test, expect, type Page } from "@playwright/test"

/** Soft-delete / restore — archived documents can be brought back. */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

test("an archived document can be restored", async ({ page }) => {
  await signIn(page, "Dana Whitfield") // OSE Director — can manage the club
  await page.goto("/orgs/simon-consulting-club/documents")

  // The seeded archived doc shows in the Archived section with a Restore control.
  await expect(page.getByRole("heading", { name: "Archived documents" })).toBeVisible()
  await expect(page.getByText("Old Sponsor Deck")).toBeVisible()

  await page.getByRole("button", { name: /Restore/ }).first().click()

  // After restoring, the Archived section is gone and the doc is back in the list.
  await expect(page.getByRole("heading", { name: "Archived documents" })).toBeHidden()
  await expect(page.getByText("Old Sponsor Deck")).toBeVisible()
})
