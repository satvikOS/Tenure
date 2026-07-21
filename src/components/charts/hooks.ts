"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

// useLayoutEffect warns during SSR; charts are client leaves that only matter
// after hydration, so fall back to useEffect on the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * ResponsiveContainer pattern: measure the parent with a ResizeObserver and
 * re-render in real pixels, so a chart's SVG user units equal container pixels
 * (which makes tooltip/crosshair positioning exact) and the chart stays fluid.
 */
export function useMeasuredWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w != null) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/**
 * Flips true one frame after mount so CSS transitions run the 300ms grow/draw.
 * Because the animation is transition-based, the global reduced-motion rule in
 * globals.css collapses it to ~0ms automatically.
 */
export function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return mounted
}
