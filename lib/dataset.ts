import type { Dataset, Course } from "./types"

/**
 * Auto-detect lab ↔ theory pairing (CSE264 ↔ CSE263, CSE266 ↔ CSE265)
 * Heuristic: if courseCode ends with even digit, try pairing with code-1
 */
export function detectLabPairings(courses: Course[]): Map<string, string> {
  const pairs = new Map<string, string>()
  const codeSet = new Set(courses.map((c) => c.code))

  for (const c of courses) {
    if (c.kind !== "lab") continue
    const match = c.code.match(/^([A-Z]{2,4})(\d{3})$/)
    if (!match) continue
    const [, prefix, numStr] = match
    const num = parseInt(numStr, 10)
    if (num % 2 === 0) {
      const theoryCode = `${prefix}${(num - 1).toString().padStart(3, "0")}`
      if (codeSet.has(theoryCode)) {
        pairs.set(c.code, theoryCode)
        pairs.set(theoryCode, c.code) // bidirectional
      }
    }
  }

  return pairs
}

/**
 * Apply detected pairings to Dataset (mutates courses in place)
 */
export function applyLabPairings(dataset: Dataset): Dataset {
  const pairs = detectLabPairings(dataset.courses)
  for (const course of dataset.courses) {
    const pairedCode = pairs.get(course.code)
    if (pairedCode && pairedCode !== course.code) {
      course.pairsWith = pairedCode
    }
  }
  return dataset
}

/**
 * Validation: check for common issues
 */
export function validateDataset(dataset: Dataset): string[] {
  const errors: string[] = []

  if (dataset.courses.length === 0) {
    errors.push("Dataset has zero courses")
  }
  if (dataset.meta.counts.sections === 0) {
    errors.push("Dataset has zero sections")
  }
  if (dataset.meta.daysPresent.length === 0) {
    errors.push("Dataset has no days present")
  }

  // Check for sections with duplicate IDs
  const sectionIds = new Set<string>()
  for (const course of dataset.courses) {
    for (const section of course.sections) {
      if (sectionIds.has(section.id)) {
        errors.push(`Duplicate section ID: ${section.id}`)
      }
      sectionIds.add(section.id)
    }
  }

  return errors
}
