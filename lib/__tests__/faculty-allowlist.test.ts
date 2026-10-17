import { describe, test, expect } from "vitest"
import { generate } from "../engine"
import { parseRoutineHTML } from "../parse-routine"
import { applyLabPairings } from "../dataset"
import type { Config } from "../types"
import * as fs from "fs"
import * as path from "path"

const html = fs.readFileSync(
  path.join(process.cwd(), "public", "routine.html"),
  "utf-8"
)
const dataset = applyLabPairings(parseRoutineHTML(html))

describe("faculty allowlist behavior", () => {
  test("should pick only ONE section per course", () => {
    const config: Config = {
      days: new Set(["SUN", "MON", "TUE", "WED", "THU", "SAT"]),
      window: { start: 8 * 60, end: 18 * 60 + 30 },
      windowMode: "hard",
      requiredCourses: new Set(["CSE261", "CSE265"]),
      facultyAllowlist: new Map(),
      topK: 50,
    }

    const { routines } = generate(dataset, config)
    expect(routines.length).toBeGreaterThan(0)

    // Every routine must have exactly 2 sections (one per course)
    for (const routine of routines) {
      expect(routine.picks.size).toBe(2)
      expect(routine.picks.has("CSE261")).toBe(true)
      expect(routine.picks.has("CSE265")).toBe(true)
    }
  })

  test("faculty allowlist works as OR (any of the selected faculty)", () => {
    // Find which faculty teach CSE265
    const cse265 = dataset.courses.find((c) => c.code === "CSE265")!
    const cse265Faculty = Array.from(
      new Set(
        cse265.sections.filter((s) => s.faculty).map((s) => s.faculty!.code)
      )
    )
    expect(cse265Faculty.length).toBeGreaterThan(1) // multiple faculty available

    // Select first two faculty for CSE265
    const selectedFaculty = cse265Faculty.slice(0, 2)

    const config: Config = {
      days: new Set(["SUN", "MON", "TUE", "WED", "THU", "SAT"]),
      window: { start: 8 * 60, end: 18 * 60 + 30 },
      windowMode: "hard",
      requiredCourses: new Set(["CSE265"]),
      facultyAllowlist: new Map([["CSE265", new Set(selectedFaculty)]]),
      topK: 50,
    }

    const { routines } = generate(dataset, config)
    expect(routines.length).toBeGreaterThan(0)

    // Every routine should have CSE265 taught by one of the selected faculty (OR logic)
    for (const routine of routines) {
      const cse265Section = routine.picks.get("CSE265")!
      expect(cse265Section).toBeDefined()
      expect(cse265Section.faculty).toBeDefined()
      expect(selectedFaculty).toContain(cse265Section.faculty!.code)
    }

    // Should have multiple different sections (not all the same)
    const uniqueSections = new Set(
      routines.map((r) => r.picks.get("CSE265")!.id)
    )
    expect(uniqueSections.size).toBeGreaterThan(1)
  })

  test("multiple routines can have different sections of same course", () => {
    const config: Config = {
      days: new Set(["SUN", "MON", "TUE", "WED"]),
      window: { start: 10 * 60, end: 16 * 60 + 20 },
      windowMode: "hard",
      requiredCourses: new Set(["CSE261"]),
      facultyAllowlist: new Map(),
      topK: 50,
    }

    const { routines } = generate(dataset, config)
    expect(routines.length).toBeGreaterThan(1)

    // Different routines should have different sections
    const sections = routines.map((r) => r.picks.get("CSE261")!.id)
    const uniqueSections = new Set(sections)
    expect(uniqueSections.size).toBeGreaterThan(1)

    // But each routine has exactly ONE CSE261 section
    for (const routine of routines) {
      expect(routine.picks.size).toBe(1)
      expect(routine.picks.has("CSE261")).toBe(true)
    }
  })
})
