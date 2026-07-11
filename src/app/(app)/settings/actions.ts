"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function updateProfile(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not signed in")

  const name = String(formData.get("name") ?? "").trim()
  if (!name || name.length > 120) throw new Error("Enter a display name (max 120 chars)")

  await db.user.update({ where: { id: session.user.id }, data: { name } })
  revalidatePath("/settings")
  revalidatePath("/dashboard")
}
