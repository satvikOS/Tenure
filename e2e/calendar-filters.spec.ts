import { test, expect, type Page } from "@playwright/test"

/** Per-viewer calendar filters: by club, and by your own events; sticky across views. */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

test("a member can filter the calendar by club and own events, sticky across views", async ({ page }) => {
  await signIn(page, "Victor Chen") // VP Finance, consulting club
  await page.goto("/calendar")

  const clubSelect = page.getByLabel("Filter calendar by club")
  await expect(clubSelect).toBeVisible()

  // Toggle "My events" → the filter lands in the URL…
  await page.getByRole("button", { name: "My events" }).click()
  await expect(page).toHaveURL(/mine=1/)

  // …and survives a view switch (the view links carry the filter).
  await page.getByRole("link", { name: "Week", exact: true }).click()
  await expect(page).toHaveURL(/view=week/)
  await expect(page).toHaveURL(/mine=1/)

  // Filter to a club too.
  await clubSelect.selectOption({ label: "Simon Consulting Club" })
  await expect(page).toHaveURL(/club=/)
})
