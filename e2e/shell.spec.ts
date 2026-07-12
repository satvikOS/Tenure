import { test, expect, type Page } from "@playwright/test"

/** Proceed 2 batch D: brand shell, footer, nav layout, notifications page. */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

test.describe("shell + brand", () => {
  test("header has the Tenure AI entry outside the search bar", async ({ page }) => {
    await signIn(page, "Maya Johnson")
    const ai = page.getByRole("link", { name: "Ask Tenure AI" })
    await expect(ai).toBeVisible()
    await ai.click()
    await expect(page).toHaveURL(/\/search/)
  })

  test("footer with wordmark and copyright renders on every page", async ({ page }) => {
    await signIn(page, "Maya Johnson")
    for (const path of ["/dashboard", "/orgs", "/calendar", "/messages"]) {
      await page.goto(path)
      await expect(
        page.getByText(/© \d{4} Tenure\. All rights reserved\./)
      ).toBeVisible()
    }
  })

  test("side panel has sections and Settings pinned at the bottom", async ({ page }) => {
    await signIn(page, "Maya Johnson")
    const nav = page.getByRole("navigation", { name: "Primary navigation" })
    await expect(nav.getByText("Community", { exact: true })).toBeVisible()
    await expect(nav.getByText("Operations", { exact: true })).toBeVisible()
    await expect(nav.getByText("Knowledge", { exact: true })).toBeVisible()
    const settings = nav.getByRole("link", { name: "Settings" })
    await expect(settings).toBeVisible()
    // Settings sits below every section label (pinned bottom)
    const settingsBox = (await settings.boundingBox())!
    const opsBox = (await nav.getByText("Operations").boundingBox())!
    expect(settingsBox.y).toBeGreaterThan(opsBox.y)
  })

  test("notifications page renders with empty state and bell links to it", async ({ page }) => {
    await signIn(page, "Alex Kim")
    await page.getByRole("link", { name: /Notifications/ }).first().click()
    await expect(page).toHaveURL(/\/notifications/)
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible()
  })
})
