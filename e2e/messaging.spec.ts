import { test, expect, type Page } from "@playwright/test"

/** Week 5: DMs, board channels, approval threads, broadcasts. */

async function signIn(page: Page, userName: string) {
  await page.context().clearCookies()
  await page.goto("/signin")
  await page.getByRole("button", { name: new RegExp(userName) }).click()
  await page.waitForURL(/\/dashboard/)
}

const stamp = Date.now()

test.describe("messaging", () => {
  test("VP starts a DM with the president and she can reply", async ({ page }) => {
    await signIn(page, "Victor Chen")
    await page.goto("/messages")
    await page.getByRole("combobox").first().selectOption({ label: "Priya Raman" })
    await page.getByRole("button", { name: "Start", exact: true }).click()
    await page.waitForURL(/\/messages\/[a-z0-9]+/)

    const dmMessage = `Budget question ${stamp}`
    await page.getByPlaceholder("Write a message…").fill(dmMessage)
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await expect(page.getByText(dmMessage)).toBeVisible()

    // Priya sees the unread conversation and replies
    await signIn(page, "Priya Raman")
    await page.goto("/messages")
    await page.getByText("Victor Chen", { exact: true }).first().click()
    await expect(page.getByText(dmMessage)).toBeVisible()
    const reply = `Let's discuss tomorrow ${stamp}`
    await page.getByPlaceholder("Write a message…").fill(reply)
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await expect(page.getByText(reply)).toBeVisible()
  })

  test("board channel: active member posts, shadow reads only", async ({ page }) => {
    await signIn(page, "Maya Johnson")
    await page.goto("/messages")
    await page.getByRole("button", { name: /Simon Consulting Club/ }).click()
    await page.waitForURL(/\/messages\/[a-z0-9]+/)

    const post = `Weekly sync notes ${stamp}`
    await page.getByPlaceholder("Write a message…").fill(post)
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await expect(page.getByText(post)).toBeVisible()

    // Isaiah (shadow president) can read but not post
    await signIn(page, "Isaiah Brooks")
    await page.goto("/messages")
    await page.getByRole("button", { name: /Simon Consulting Club/ }).click()
    await page.waitForURL(/\/messages\/[a-z0-9]+/)
    await expect(page.getByText(post)).toBeVisible()
    await expect(page.getByPlaceholder("Write a message…")).not.toBeVisible()
    await expect(page.getByText("read-only access")).toBeVisible()
  })

  test("approval discussion thread connects requester and approver", async ({ page }) => {
    const reqTitle = `E2E Thread ${stamp}`
    await signIn(page, "Victor Chen")
    await page.goto("/approvals/new")
    await page.getByLabel("Title").fill(reqTitle)
    await page.getByRole("button", { name: "Submit for approval" }).click()
    await page.waitForURL(/\/approvals\/[a-z0-9]+/)

    await page.getByRole("button", { name: "Discussion" }).click()
    await page.waitForURL(/\/messages\/[a-z0-9]+/)
    await expect(page.getByText(`Re: ${reqTitle}`)).toBeVisible()
    const q = `Can I get this expedited? ${stamp}`
    await page.getByPlaceholder("Write a message…").fill(q)
    await page.getByRole("button", { name: "Send", exact: true }).click()
    await expect(page.getByText(q)).toBeVisible()

    // President opens the same thread from the approval and replies
    await signIn(page, "Priya Raman")
    await page.goto("/approvals")
    await page.getByText(reqTitle).first().click()
    await page.getByRole("button", { name: "Discussion" }).click()
    await page.waitForURL(/\/messages\/[a-z0-9]+/)
    await expect(page.getByText(q)).toBeVisible()
  })

  test("OSE broadcast reaches members read-only", async ({ page }) => {
    const subject = `Fall deadlines ${stamp}`
    await signIn(page, "Dana Whitfield")
    await page.goto("/messages")
    await page.getByPlaceholder("Subject").fill(subject)
    await page.getByPlaceholder("Message to all clubs…").fill("Budget submissions close Oct 15.")
    await page.getByRole("button", { name: "Send broadcast" }).click()
    await page.waitForURL(/\/messages\/[a-z0-9]+/)
    await expect(page.getByText("Budget submissions close Oct 15.")).toBeVisible()

    // A member sees it but cannot reply
    await signIn(page, "Maya Johnson")
    await page.goto("/messages")
    await page.getByText(subject).first().click()
    await expect(page.getByText("Budget submissions close Oct 15.")).toBeVisible()
    await expect(page.getByPlaceholder("Write a message…")).not.toBeVisible()
    await expect(page.getByText("Broadcasts are read-only.")).toBeVisible()
  })

  test("unread count shows on the dashboard KPI", async ({ page }) => {
    // Victor has at least one unread (Priya's DM reply may be read; send fresh)
    await signIn(page, "Priya Raman")
    await page.goto("/messages")
    await page.getByText("Victor Chen", { exact: true }).first().click()
    const ping = `Ping ${stamp}`
    await page.getByPlaceholder("Write a message…").fill(ping)
    await page.getByRole("button", { name: "Send", exact: true }).click()

    await signIn(page, "Victor Chen")
    await page.goto("/dashboard")
    const kpi = page.getByRole("link", { name: /Unread Messages/ })
    await expect(kpi).toBeVisible()
    await expect(kpi.getByText(/^[1-9][0-9]*$/)).toBeVisible()
  })
})
