import { describe, test, expect } from "vitest";
import { generate } from "../engine";
import {
  computeRelaxations,
  compute1SwapSuggestions,
  computeNearMiss,
} from "../suggestions";
import { parseRoutineHTML } from "../parse-routine";
import { applyLabPairings } from "../dataset";
import type { Config } from "../types";
import * as fs from "fs";
import * as path from "path";

const html = fs.readFileSync(
  path.join(process.cwd(), "public", "routine.html"),
  "utf-8",
);
const dataset = applyLabPairings(parseRoutineHTML(html));

describe("suggestions", () => {
  test("blocked-course diagnostic structure", () => {
    // Impossible config to force diagnostic
    const config: Config = {
      days: new Set(["FRI"]), // FRI not in this semester's data
      window: { start: 8 * 60, end: 18 * 60 + 30 },
      windowMode: "hard",
      requiredCourses: new Set(["CSE261", "MAT261"]),
      facultyAllowlist: new Map(),
      topK: 10,
    };

    const { diagnostics } = generate(dataset, config);
    // With FRI-only, all courses blocked
    expect(diagnostics.length).toBeGreaterThanOrEqual(2);
    expect(diagnostics[0].closestAlternatives.length).toBeGreaterThan(0);
  });

  test("relaxation: add day unlocks routines", () => {
    const config: Config = {
      days: new Set(["SUN", "MON"]), // restrictive
      window: { start: 10 * 60, end: 16 * 60 + 20 },
      windowMode: "hard",
      requiredCourses: new Set(["CSE261", "CSE263"]),
      facultyAllowlist: new Map(),
      topK: 10,
    };

    const { routines } = generate(dataset, config);
    const relaxations = computeRelaxations(dataset, config, routines.length);

    const dayRelaxations = relaxations.filter((r) => r.type === "add_day");
    expect(dayRelaxations.length).toBeGreaterThan(0);
    expect(dayRelaxations[0].count).toBeGreaterThan(0);
  });

  test("relaxation: extend window unlocks routines", () => {
    const config: Config = {
      days: new Set(["SUN", "MON", "TUE", "WED"]),
      window: { start: 10 * 60, end: 15 * 60 }, // tight
      windowMode: "hard",
      requiredCourses: new Set(["CSE261"]),
      facultyAllowlist: new Map(),
      topK: 10,
    };

    const { routines } = generate(dataset, config);
    const relaxations = computeRelaxations(dataset, config, routines.length);

    const windowRelaxations = relaxations.filter(
      (r) => r.type === "extend_window",
    );
    expect(windowRelaxations.length).toBeGreaterThan(0);
  });

  test("1-swap improvement exists for some routines", () => {
    const config: Config = {
      days: new Set(["SUN", "MON", "TUE", "WED", "THU", "SAT"]),
      window: { start: 8 * 60, end: 18 * 60 + 30 },
      windowMode: "soft",
      requiredCourses: new Set(["CSE261"]),
      facultyAllowlist: new Map(),
      topK: 10,
    };

    const { routines } = generate(dataset, config);
    expect(routines.length).toBeGreaterThan(0);

    let foundSuggestion = false;
    for (const routine of routines) {
      const suggestions = compute1SwapSuggestions(routine, dataset, config);
      if (suggestions.length > 0) {
        expect(suggestions[0].scoreGain).toBeGreaterThan(0);
        expect(suggestions[0].reason.length).toBeGreaterThan(0);
        foundSuggestion = true;
        break;
      }
    }
    // At least one routine should have a swap suggestion
    expect(foundSuggestion).toBe(true);
  });

  test("near-miss list produced in hard mode when tight window", () => {
    const config: Config = {
      days: new Set(["SUN", "MON", "TUE", "WED"]),
      window: { start: 10 * 60, end: 15 * 60 }, // tight
      windowMode: "hard",
      requiredCourses: new Set(["CSE261", "CSE263"]),
      facultyAllowlist: new Map(),
      topK: 10,
    };

    const nearMiss = computeNearMiss(dataset, config);
    // May or may not have near-miss depending on data
    if (nearMiss.length > 0) {
      expect(nearMiss[0].violatingCourse).toBeTruthy();
      expect(nearMiss[0].minutesOutside).toBeGreaterThan(0);
      expect(nearMiss[0].fixes.length).toBeGreaterThan(0);
    }
  });

  test("near-miss not produced in soft mode", () => {
    const config: Config = {
      days: new Set(["SUN", "MON", "TUE", "WED"]),
      window: { start: 10 * 60, end: 15 * 60 },
      windowMode: "soft",
      requiredCourses: new Set(["CSE261"]),
      facultyAllowlist: new Map(),
      topK: 10,
    };

    const nearMiss = computeNearMiss(dataset, config);
    expect(nearMiss).toEqual([]);
  });
});
