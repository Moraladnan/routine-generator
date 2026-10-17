import type {
  Dataset,
  Section,
  Config,
  Routine,
  BlockedCourseDiagnostic,
} from "./types";
import { scoreRoutine, computeStats } from "./scoring";

const MAX_LEAVES = 2_000_000;

export function generate(
  dataset: Dataset,
  config: Config,
): { routines: Routine[]; diagnostics: BlockedCourseDiagnostic[] } {
  // Prefilter candidates per course
  const candidatesPerCourse = new Map<string, Section[]>();
  const requiredCourses = Array.from(config.requiredCourses);

  for (const courseCode of requiredCourses) {
    const course = dataset.courses.find((c) => c.code === courseCode);
    if (!course) {
      console.warn(`Course ${courseCode} not found in dataset`);
      continue;
    }

    const candidates = course.sections.filter((s) =>
      satisfiesStaticConstraints(s, config),
    );
    candidatesPerCourse.set(courseCode, candidates);
  }

  // Diagnostics for blocked courses
  const diagnostics: BlockedCourseDiagnostic[] = [];
  for (const courseCode of requiredCourses) {
    const candidates = candidatesPerCourse.get(courseCode) || [];
    if (candidates.length === 0) {
      diagnostics.push(generateBlockedDiagnostic(courseCode, dataset, config));
    }
  }

  // MRV order
  const orderedCourses = requiredCourses
    .filter((code) => (candidatesPerCourse.get(code) || []).length > 0)
    .sort(
      (a, b) =>
        candidatesPerCourse.get(a)!.length - candidatesPerCourse.get(b)!.length,
    );

  // DFS
  const leaves: Routine[] = [];
  let leafCount = 0;

  function dfs(
    idx: number,
    picks: Map<string, Section>,
    dayIntervals: Map<string, Array<{ start: number; end: number }>>,
  ) {
    if (leafCount >= MAX_LEAVES) return;
    if (idx === orderedCourses.length) {
      // Leaf - but only add if we have all required courses
      if (orderedCourses.length === 0) return; // No valid courses, don't create empty routine

      leafCount++;
      const stats = computeStats(picks);

      // Hard constraint: exactly 4 days (C1)
      if (
        config.maxDaysUsed !== undefined &&
        stats.distinctDays !== config.maxDaysUsed
      ) {
        return;
      }

      const { score, breakdown } = scoreRoutine(picks, config, dataset);
      const id = Array.from(picks.values())
        .map((s) => s.id)
        .sort()
        .join(",");
      leaves.push({
        id,
        picks: new Map(picks),
        stats,
        score,
        scoreBreakdown: breakdown,
      });
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

      dfs(idx + 1, picks, dayIntervals);

      // Restore
      picks.delete(courseCode);
      for (const [day, original] of backup) {
        dayIntervals.set(day, original);
      }
    }
  }

  dfs(0, new Map(), new Map());

  // Sort by priority:
  // 1. Score (higher is better)
  // 2. Fewer single-class days (implicit in score)
  // 3. Earlier latest end time
  // 4. Lexicographic ID for determinism
  leaves.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.stats.latestEnd !== b.stats.latestEnd)
      return a.stats.latestEnd - b.stats.latestEnd;
    return a.id.localeCompare(b.id);
  });

  return { routines: leaves.slice(0, config.topK), diagnostics };
}

function satisfiesStaticConstraints(section: Section, config: Config): boolean {
  // C2: days
  for (const m of section.meetings) {
    if (!config.days.has(m.day)) return false;
  }

  // C3 hard mode: window
  if (config.windowMode === "hard") {
    for (const m of section.meetings) {
      if (m.start < config.window.start || m.end > config.window.end)
        return false;
    }
  }

  // C5: faculty allowlist
  const allowlist = config.facultyAllowlist.get(section.courseCode);
  if (allowlist && allowlist.size > 0) {
    if (!section.faculty || !allowlist.has(section.faculty.code)) return false;
  }

  return true;
}

function generateBlockedDiagnostic(
  courseCode: string,
  dataset: Dataset,
  config: Config,
): BlockedCourseDiagnostic {
  const course = dataset.courses.find((c) => c.code === courseCode);
  if (!course)
    return {
      courseCode,
      reason: "Course not found in dataset",
      closestAlternatives: [],
    };

  // Score each section by how many constraints it violates
  const scored = course.sections.map((s) => {
    let violations = 0;
    const issues: string[] = [];

    for (const m of s.meetings) {
      if (!config.days.has(m.day)) {
        violations++;
        issues.push(`uses ${m.day}`);
      }
    }

    if (config.windowMode === "hard") {
      for (const m of s.meetings) {
        if (m.start < config.window.start) {
          violations++;
          issues.push(
            `starts ${Math.floor((config.window.start - m.start) / 60)}h ${(config.window.start - m.start) % 60}m early`,
          );
        }
        if (m.end > config.window.end) {
          violations++;
          issues.push(
            `ends ${Math.floor((m.end - config.window.end) / 60)}h ${(m.end - config.window.end) % 60}m late`,
          );
        }
      }
    }

    const allowlist = config.facultyAllowlist.get(courseCode);
    if (allowlist && allowlist.size > 0) {
      if (!s.faculty || !allowlist.has(s.faculty.code)) {
        violations++;
        issues.push(`faculty ${s.faculty?.code || "N/A"} not in allowlist`);
      }
    }

    return { section: s, violations, issue: issues[0] || "" };
  });

  scored.sort((a, b) => a.violations - b.violations);
  const closestAlternatives = scored.slice(0, 3).map((x) => ({
    sectionId: x.section.id,
    issue: x.issue,
  }));

  let reason = "No sections satisfy all constraints";
  if (scored[0].violations === 0) reason = "Internal error";

  return { courseCode, reason, closestAlternatives };
}
