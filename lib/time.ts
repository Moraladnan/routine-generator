import type { Day } from "./types"

export const DAY_ORDER: Day[] = ["SUN", "MON", "TUE", "WED", "THU", "SAT", "FRI"]

/**
 * "HH:MM" → minutes since midnight (24h assumed)
 */
export function parseTime(str: string): number {
  const match = str.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) throw new Error(`Invalid time: ${str}`)
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (h < 0 || h > 23 || m < 0 || m > 59)
    throw new Error(`Time out of range: ${str}`)
  return h * 60 + m
}

/**
 * Minutes since midnight → "HH:MM" (24h)
 */
export function formatTime24(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

/**
 * Minutes since midnight → "h:MM AM/PM"
 */
export function formatTime12(minutes: number): string {
  let h = Math.floor(minutes / 60)
  const m = minutes % 60
  const suffix = h < 12 ? "AM" : "PM"
  if (h === 0) h = 12
  if (h > 12) h -= 12
  return `${h}:${m.toString().padStart(2, "0")} ${suffix}`
}

/**
 * Day index in the SEU order (SUN=0…FRI=6)
 */
export function dayIndex(day: Day): number {
  return DAY_ORDER.indexOf(day)
}
