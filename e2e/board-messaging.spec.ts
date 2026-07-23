import { test, expect, type Page } from "@playwright/test"

/** Board-member names route to in-app messaging (a 1:1 DM). */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

test("a board member's name opens an in-app DM", async ({ page }) => {
  await signIn(page, "Victor Chen") // VP Finance, consulting club
  await page.goto("/orgs/simon-consulting-club/members")

  // The president's name (a messageable board member) is a link into messaging.
  await page.getByRole("button", { name: /Priya Raman/ }).first().click()
  await expect(page).toHaveURL(/\/messages\/[a-z0-9]+/)
})
