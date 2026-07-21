"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { storageConfigured, uploadDocument } from "@/lib/s3"

async function requireUserId() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not signed in")
  return session.user.id
}

function bumpProfile() {
  revalidatePath("/settings")
  revalidatePath("/dashboard")
}

export async function updateProfile(formData: FormData) {
  const userId = await requireUserId()
  const name = String(formData.get("name") ?? "").trim()
  if (!name || name.length > 120) throw new Error("Enter a display name (max 120 chars)")
  await db.user.update({ where: { id: userId }, data: { name } })
  bumpProfile()
}

/** Set the profile picture to an external image URL (works without storage). */
export async function setProfileImageUrl(formData: FormData) {
  const userId = await requireUserId()
  const url = String(formData.get("imageUrl") ?? "").trim()
  if (!url) throw new Error("Enter an image URL")
  if (url.length > 2048) throw new Error("That URL is too long")
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Enter a valid image URL")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error("Image URL must start with http(s)://")
  await db.user.update({ where: { id: userId }, data: { image: url, imageKey: null } })
  bumpProfile()
}

/** Upload a profile picture to object storage; the /api/profile-image proxy serves it. */
export async function uploadProfileImage(formData: FormData) {
  const userId = await requireUserId()
  if (!storageConfigured())
    throw new Error("File uploads are not configured — paste an image URL instead")
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image file")
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image")
  if (file.size > 5 * 1024 * 1024) throw new Error("Images must be under 5 MB")

  const ext = (file.name.split(".").pop() || "img").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)
  const key = `profile-images/${userId}/${Date.now()}.${ext}`
  await uploadDocument(key, Buffer.from(await file.arrayBuffer()), file.type)
  await db.user.update({
    where: { id: userId },
    data: { imageKey: key, image: `/api/profile-image/${userId}?v=${Date.now()}` },
  })
  bumpProfile()
}

export async function removeProfileImage() {
  const userId = await requireUserId()
  await db.user.update({ where: { id: userId }, data: { image: null, imageKey: null } })
  bumpProfile()
}
