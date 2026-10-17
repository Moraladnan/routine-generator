import { describe, test, expect } from "vitest"
import { parseRoutineHTML, parseRoutineJSON } from "../parse-routine"
import { applyLabPairings, validateDataset } from "../dataset"
import * as fs from "fs"
import * as path from "path"

describe("parseRoutineHTML", () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), "public", "routine.html"),
    "utf-8"
  )
  const dataset = parseRoutineHTML(html)

  test("counts match plan spec", () => {
    expect(dataset.meta.counts.courses).toBe(6)
    expect(dataset.meta.counts.sections).toBe(62)
    expect(dataset.meta.counts.meetings).toBe(99)
  })

  test("per-course section counts", () => {
    const courseCounts = new Map(
      dataset.courses.map((c) => [c.code, c.sections.length])
    )
    expect(courseCounts.get("CSE261")).toBe(9)
    expect(courseCounts.get("CSE263")).toBe(10)
    expect(courseCounts.get("CSE264")).toBe(14)
    expect(courseCounts.get("CSE265")).toBe(9)
    expect(courseCounts.get("CSE266")).toBe(11)
    expect(courseCounts.get("MAT261")).toBe(9)
  })

  test("exactly 3 duplicates removed", () => {
    const dupeWarnings = dataset.meta.warnings.filter(
      (w) => w.type === "duplicate"
    )
    const totalDupes = dupeWarnings.reduce((sum, w) => {
      const match = w.message.match(/had (\d+) duplicate/)
      return sum + (match ? parseInt(match[1], 10) : 0)
    }, 0)
    expect(totalDupes).toBe(3)
  })

  test("exactly 1 N/A faculty", () => {
    const naWarnings = dataset.meta.warnings.filter(
      (w) => w.type === "no_faculty"
    )
    expect(naWarnings).toHaveLength(1)
    expect(naWarnings[0].sectionId).toBe("CSE261.5")
  })

  test("days present = SUN..SAT excluding FRI", () => {
    expect(dataset.meta.daysPresent).toEqual([
      "SUN",
      "MON",
      "TUE",
      "WED",
      "THU",
      "SAT",
    ])
  })

  test("time range 08:00–18:30", () => {
    expect(dataset.meta.timeRange.start).toBe(8 * 60) // 08:00
    expect(dataset.meta.timeRange.end).toBe(18 * 60 + 30) // 18:30
  })

  test("spot checks", () => {
    const cse264 = dataset.courses.find((c) => c.code === "CSE264")!
    const sec9 = cse264.sections.find((s) => s.sectionNo === "9")!
    expect(sec9.meetings).toHaveLength(1)
    expect(sec9.meetings[0]).toMatchObject({
      day: "MON",
      start: 8 * 60, // 08:00
      end: 10 * 60, // 10:00
      room: "SEU616",
    })

    const cse261 = dataset.courses.find((c) => c.code === "CSE261")!
    const sec5 = cse261.sections.find((s) => s.sectionNo === "5")!
    expect(sec5.faculty).toBeNull()

    const sec6 = cse264.sections.find((s) => s.sectionNo === "6")!
    expect(sec6.meetings).toHaveLength(1) // deduped SAT 16:30–18:30
    expect(sec6.meetings[0].day).toBe("SAT")
  })

  test("rooms parse correctly", () => {
    const allRooms = new Set<string>()
    for (const course of dataset.courses) {
      for (const section of course.sections) {
        for (const meeting of section.meetings) {
          allRooms.add(meeting.room)
        }
      }
    }
    expect(allRooms.has("SEU213A")).toBe(true)
    expect(allRooms.has("PC107")).toBe(true)
  })

  test("JSON round-trip is lossless", () => {
    const json = JSON.stringify(dataset)
    const parsed = parseRoutineJSON(json)
    expect(parsed).toEqual(dataset)
  })
})

describe("dataset utilities", () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), "public", "routine.html"),
    "utf-8"
  )
  const dataset = parseRoutineHTML(html)

  test("lab pairing detection", () => {
    applyLabPairings(dataset)
    const cse264 = dataset.courses.find((c) => c.code === "CSE264")!
    const cse263 = dataset.courses.find((c) => c.code === "CSE263")!
    expect(cse264.pairsWith).toBe("CSE263")
    expect(cse263.pairsWith).toBe("CSE264")

    const cse266 = dataset.courses.find((c) => c.code === "CSE266")!
    const cse265 = dataset.courses.find((c) => c.code === "CSE265")!
    expect(cse266.pairsWith).toBe("CSE265")
    expect(cse265.pairsWith).toBe("CSE266")
  })

  test("validation passes", () => {
    const errors = validateDataset(dataset)
    expect(errors).toEqual([])
  })
})
