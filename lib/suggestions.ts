import type {
  Dataset,
  Config,
  Routine,
  Relaxation,
  SwapSuggestion,
  NearMissRoutine,
  Section,
  Day,
} from "./types";
import { generate } from "./engine";
import { scoreRoutine } from "./scoring";
import { DAY_ORDER } from "./time";

/**
 * Producer 1: Blocked-course diagnostics (already in engine)
 */

/**
 * Producer 2: Relaxation scan
 */
export function computeRelaxations(
  dataset: Dataset,
  config: Config,
  currentCount: number,
): Relaxation[] {
  if (currentCount >= config.topK) return [];

  const relaxations: Relaxation[] = [];

  // Try adding each excluded day
  const allDays = new Set<Day>(DAY_ORDER);
  for (const day of allDays) {
    if (config.days.has(day)) continue;
    const newConfig = { ...config, days: new Set([...config.days, day]) };
    const { routines } = generate(dataset, newConfig);
    if (routines.length > currentCount) {
      relaxations.push({
        type: "add_day",
        description: `Add ${day}`,
        count: routines.length - currentCount,
        example: routines[0],
      });
    }
  }

  // Try extending window end to each distinct end time
  const allEnds = new Set<number>();
  for (const course of dataset.courses) {
    for (const section of course.sections) {
      for (const m of section.meetings) {
        allEnds.add(m.end);
      }
    }
  }
  for (const end of Array.from(allEnds).sort((a, b) => a - b)) {
    if (end <= config.window.end) continue;
    const newConfig = {
      ...config,
      window: { start: config.window.start, end },
    };
    const { routines } = generate(dataset, newConfig);
    if (routines.length > currentCount) {
      relaxations.push({
        type: "extend_window",
        description: `Extend window end to ${Math.floor(end / 60)}:${(end % 60).toString().padStart(2, "0")}`,
        count: routines.length - currentCount,
        example: routines[0],
      });
      break; // only report first extension that helps
    }
  }

  // Try extending window start earlier
  const allStarts = new Set<number>();
  for (const course of dataset.courses) {
    for (const section of course.sections) {
      for (const m of section.meetings) {
        allStarts.add(m.start);
      }
    }
  }
  for (const start of Array.from(allStarts).sort((a, b) => b - a)) {
    if (start >= config.window.start) continue;
    const newConfig = {
      ...config,
      window: { start, end: config.window.end },
    };
    const { routines } = generate(dataset, newConfig);
    if (routines.length > currentCount) {
      relaxations.push({
        type: "extend_window",
        description: `Extend window start to ${Math.floor(start / 60)}:${(start % 60).toString().padStart(2, "0")}`,
        count: routines.length - currentCount,
        example: routines[0],
      });
      break;
    }
  }

  // Try relaxing each faculty allowlist
  for (const [courseCode, allowlist] of config.facultyAllowlist) {
    if (allowlist.size === 0) continue;
    const newAllowlist = new Map(config.facultyAllowlist);
    newAllowlist.delete(courseCode);
    const newConfig = { ...config, facultyAllowlist: newAllowlist };
    const { routines } = generate(dataset, newConfig);
    if (routines.length > currentCount) {
      relaxations.push({
        type: "relax_faculty",
        description: `Relax faculty restriction for ${courseCode}`,
        count: routines.length - currentCount,
        example: routines[0],
      });
    }
  }

  // Try raising maxDaysUsed (if set)
  if (config.maxDaysUsed !== undefined) {
    const newConfig = { ...config, maxDaysUsed: config.maxDaysUsed + 1 };
    const { routines } = generate(dataset, newConfig);
    if (routines.length > currentCount) {
      relaxations.push({
        type: "raise_max_days",
        description: `Allow ${newConfig.maxDaysUsed} distinct days`,
        count: routines.length - currentCount,
        example: routines[0],
      });
    }
  }

  // Sort by count desc
  relaxations.sort((a, b) => b.count - a.count);
  return relaxations.slice(0, 5); // top 5
}

/**
 * Producer 3: Per-routine 1-swap improvements
 */
export function compute1SwapSuggestions(
  routine: Routine,
  dataset: Dataset,
  config: Config,
): SwapSuggestion[] {
  const suggestions: SwapSuggestion[] = [];

  for (const [courseCode, currentSection] of routine.picks) {
    const course = dataset.courses.find((c) => c.code === courseCode);
    if (!course) continue;

    for (const altSection of course.sections) {
      if (altSection.id === currentSection.id) continue;

      // Try swap
      const newPicks = new Map(routine.picks);
      newPicks.set(courseCode, altSection);

      // Check validity (overlap + static constraints)
      let valid = true;

      // Static constraints
      for (const m of altSection.meetings) {
        if (!config.days.has(m.day)) {
          valid = false;
          break;
        }
      }
      if (config.windowMode === "hard") {
        for (const m of altSection.meetings) {
          if (m.start < config.window.start || m.end > config.window.end) {
            valid = false;
            break;
          }
        }
      }
      const allowlist = config.facultyAllowlist.get(courseCode);
      if (allowlist && allowlist.size > 0) {
        if (!altSection.faculty || !allowlist.has(altSection.faculty.code)) {
          valid = false;
        }
      }

      if (!valid) continue;

      // Overlap check
      const dayIntervals = new Map<
        string,
        Array<{ start: number; end: number }>
      >();
      for (const section of newPicks.values()) {
        for (const m of section.meetings) {
          if (!dayIntervals.has(m.day)) dayIntervals.set(m.day, []);
          dayIntervals.get(m.day)!.push({ start: m.start, end: m.end });
        }
      }
      for (const intervals of dayIntervals.values()) {
        intervals.sort((a, b) => a.start - b.start);
        for (let i = 1; i < intervals.length; i++) {
          if (intervals[i].start < intervals[i - 1].end) {
            valid = false;
            break;
          }
        }
        if (!valid) break;
      }

      if (!valid) continue;

      // Score
      const { score: newScore } = scoreRoutine(newPicks, config, dataset);
      const gain = newScore - routine.score;
      if (gain <= 0) continue;

      // Generate reason
      let reason = "";
      if (altSection.meetings[0].start < currentSection.meetings[0].start) {
        reason = `removes the ${Math.floor(currentSection.meetings[0].start / 60)}:${(currentSection.meetings[0].start % 60).toString().padStart(2, "0")} early start`;
      } else {
        reason = "reduces gaps or improves schedule";
      }

      suggestions.push({
        fromSectionId: currentSection.id,
        toSectionId: altSection.id,
        reason,
        scoreGain: Math.round(gain),
      });
    }
  }

  suggestions.sort((a, b) => b.scoreGain - a.scoreGain);
  return suggestions.slice(0, 3);
}

/**
 * Producer 4: Near-miss routines (hard mode only)
 */
export function computeNearMiss(
  dataset: Dataset,
  config: Config,
): NearMissRoutine[] {
  if (config.windowMode !== "hard") return [];

  // DFS allowing exactly one meeting outside window
  const requiredCourses = Array.from(config.requiredCourses);
  const candidatesPerCourse = new Map<string, Section[]>();

  for (const courseCode of requiredCourses) {
    const course = dataset.courses.find((c) => c.code === courseCode);
    if (!course) continue;

    // Relax window constraint, keep others
    const candidates = course.sections.filter((s) => {
      for (const m of s.meetings) {
        if (!config.days.has(m.day)) return false;
      }
      const allowlist = config.facultyAllowlist.get(courseCode);
      if (allowlist && allowlist.size > 0) {
        if (!s.faculty || !allowlist.has(s.faculty.code)) return false;
      }
      return true;
    });
    candidatesPerCourse.set(courseCode, candidates);
  }

  const orderedCourses = requiredCourses
    .filter((code) => (candidatesPerCourse.get(code) || []).length > 0)
    .sort(
      (a, b) =>
        candidatesPerCourse.get(a)!.length - candidatesPerCourse.get(b)!.length,
    );

  const nearMiss: NearMissRoutine[] = [];
  const MAX_NEAR = 10;

  function dfs(
    idx: number,
    picks: Map<string, Section>,
    dayIntervals: Map<string, Array<{ start: number; end: number }>>,
    violatingCourse: string | null,
    minutesOutside: number,
  ) {
    if (nearMiss.length >= MAX_NEAR) return;
    if (idx === orderedCourses.length) {
      if (violatingCourse) {
        // Compute fixes
        const course = dataset.courses.find((c) => c.code === violatingCourse)!;
        const fixes: Array<{ sectionId: string; description: string }> = [];
        for (const altSection of course.sections) {
          if (altSection.id === picks.get(violatingCourse)!.id) continue;

          // Check if this section fixes the window issue
          let allIn = true;
          for (const m of altSection.meetings) {
            if (m.start < config.window.start || m.end > config.window.end) {
              allIn = false;
              break;
            }
          }
          if (!allIn) continue;

          // Check overlap with rest (excluding violatingCourse)
          const testPicks = new Map(picks);
          testPicks.set(violatingCourse, altSection);
          const testIntervals = new Map<
            string,
            Array<{ start: number; end: number }>
          >();
          for (const section of testPicks.values()) {
            for (const m of section.meetings) {
              if (!testIntervals.has(m.day)) testIntervals.set(m.day, []);
              testIntervals.get(m.day)!.push({ start: m.start, end: m.end });
            }
          }
          let valid = true;
          for (const intervals of testIntervals.values()) {
            intervals.sort((a, b) => a.start - b.start);
            for (let i = 1; i < intervals.length; i++) {
              if (intervals[i].start < intervals[i - 1].end) {
                valid = false;
                break;
              }
            }
            if (!valid) break;
          }
          if (!valid) continue;

          fixes.push({
            sectionId: altSection.id,
            description: `fits window`,
          });
          if (fixes.length >= 3) break;
        }

        if (fixes.length > 0) {
          const { score, breakdown } = scoreRoutine(picks, config, dataset);
          const stats = {
            distinctDays: dayIntervals.size,
            totalCredits: Array.from(picks.values()).reduce(
              (sum, s) => sum + s.credits,
              0,
            ),
            earliestStart: Math.min(
              ...Array.from(picks.values()).flatMap((s) =>
                s.meetings.map((m) => m.start),
              ),
            ),
            latestEnd: Math.max(
              ...Array.from(picks.values()).flatMap((s) =>
                s.meetings.map((m) => m.end),
              ),
            ),
            totalGapMinutes: 0,
            longestGapMinutes: 0,
          };
          const id = Array.from(picks.values())
            .map((s) => s.id)
            .sort()
            .join(",");
          nearMiss.push({
            routine: {
              id,
              picks: new Map(picks),
              stats,
              score,
              scoreBreakdown: breakdown,
            },
            violatingCourse,
            minutesOutside,
            fixes,
          });
        }
      }
      return;
    }

    const courseCode = orderedCourses[idx];
    const candidates = candidatesPerCourse.get(courseCode)!;

    for (const section of candidates) {
      // Check overlaps
      let valid = true;
      for (const m of section.meetings) {
        const intervals = dayIntervals.get(m.day) || [];
        for (const iv of intervals) {
          if (m.start < iv.end && m.end > iv.start) {
            valid = false;
            break;
          }
        }
        if (!valid) break;
      }

      if (!valid) continue;

      // Check window violation
      let thisViolates = false;
      let thisMinutesOut = 0;
      for (const m of section.meetings) {
        if (m.start < config.window.start)
          thisMinutesOut += config.window.start - m.start;
        if (m.end > config.window.end)
          thisMinutesOut += m.end - config.window.end;
        if (thisMinutesOut > 0) thisViolates = true;
      }

      if (thisViolates && violatingCourse !== null) continue; // only 1 violation allowed
      const newViolatingCourse = thisViolates ? courseCode : violatingCourse;
      const newMinutesOutside = thisViolates ? thisMinutesOut : minutesOutside;

      // Add to state
      picks.set(courseCode, section);
      const backup = new Map<string, Array<{ start: number; end: number }>>();
      for (const m of section.meetings) {
        if (!dayIntervals.has(m.day)) dayIntervals.set(m.day, []);
        if (!backup.has(m.day))
          backup.set(m.day, [...dayIntervals.get(m.day)!]);
        dayIntervals.get(m.day)!.push({ start: m.start, end: m.end });
        dayIntervals.get(m.day)!.sort((a, b) => a.start - b.start);
      }

      dfs(idx + 1, picks, dayIntervals, newViolatingCourse, newMinutesOutside);

      // Restore
      picks.delete(courseCode);
      for (const [day, original] of backup) {
        dayIntervals.set(day, original);
      }
    }
  }

  dfs(0, new Map(), new Map(), null, 0);

  nearMiss.sort((a, b) => a.minutesOutside - b.minutesOutside);
  return nearMiss.slice(0, 5);
}
