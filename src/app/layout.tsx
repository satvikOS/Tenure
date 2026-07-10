import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Tenure",
  description: "Institutional knowledge that survives every leadership transition.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
