import type { Section, Config, Dataset, Day } from "./types";

export const SCORE_WEIGHTS = {
  // Priority 1: Exactly 4 days (handled as hard constraint in engine)
  // Priority 2: Finish by 4:20 PM (handled as hard constraint in windowMode)

  // Priority 3: Minimize total weekly idle time (large gaps > 60 min)
  largeGapPerMinute: -2.0, // gaps > 60 minutes heavily penalized

  // Priority 4: Prefer consecutive classes (small gaps)
  smallGapPerMinute: -0.05, // small gaps (10-40 min) lightly penalized

  // Priority 5: Avoid single-class days
  singleClassDayPenalty: -200,

  // Priority 6: Prefer consecutive weekdays
  consecutiveDaysBonus: 50,
  preferredDayOrderBonus: 30,

  // Priority 7: Faculty dependency constraints
  labTeacherMatch: 15,
  labDayMatch: 10,

  // Legacy/soft penalties
  outOfWindowPerMinute: -1000,
  latestEndMin: -0.05,
} as const;

const OFFICIAL_BREAK_START = 12 * 60 + 50; // 12:50 PM in minutes
const OFFICIAL_BREAK_END = 13 * 60 + 30; // 1:30 PM in minutes
const ALLOWED_TRANSITION = 10; // 10 minutes

interface ScoreBreakdown {
  outOfWindowPenalty: number;
  largeGapPenalty: number;
  smallGapPenalty: number;
  singleClassDayPenalty: number;
  consecutiveDaysBonus: number;
  preferredDayOrderBonus: number;
  latePenalty: number;
  labTeacherBonus: number;
  labDayBonus: number;
}

export function scoreRoutine(
  picks: Map<string, Section>,
  config: Config,
  dataset: Dataset,
): { score: number; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = {
    outOfWindowPenalty: 0,
    largeGapPenalty: 0,
    smallGapPenalty: 0,
    singleClassDayPenalty: 0,
    consecutiveDaysBonus: 0,
    preferredDayOrderBonus: 0,
    latePenalty: 0,
    labTeacherBonus: 0,
    labDayBonus: 0,
  };

  // Organize meetings by day
  type DayMeeting = { start: number; end: number };
  const dayMeetings = new Map<string, DayMeeting[]>();
  for (const section of picks.values()) {
    for (const m of section.meetings) {
      if (!dayMeetings.has(m.day)) dayMeetings.set(m.day, []);
      dayMeetings.get(m.day)!.push({ start: m.start, end: m.end });
    }
  }

  // Sort each day
  for (const meetings of dayMeetings.values()) {
    meetings.sort((a, b) => a.start - b.start);
  }

  // Out-of-window minutes (soft mode only)
  if (config.windowMode === "soft") {
    let totalOut = 0;
    for (const section of picks.values()) {
      for (const m of section.meetings) {
        if (m.start < config.window.start)
          totalOut += config.window.start - m.start;
        if (m.end > config.window.end) totalOut += m.end - config.window.end;
      }
    }
    breakdown.outOfWindowPenalty =
      SCORE_WEIGHTS.outOfWindowPerMinute * totalOut;
  }

  // Priority 3: Gaps - differentiate between allowed and large gaps
  let largeGapMinutes = 0;
  let smallGapMinutes = 0;

  for (const meetings of dayMeetings.values()) {
    for (let i = 1; i < meetings.length; i++) {
      const gap = meetings[i].start - meetings[i - 1].end;

      if (gap <= 0) continue; // overlapping or adjacent

      // Check if gap is the official break (12:50 - 1:30)
      const prevEnd = meetings[i - 1].end;
      const nextStart = meetings[i].start;

      const isOfficialBreak =
        prevEnd <= OFFICIAL_BREAK_START &&
        nextStart >= OFFICIAL_BREAK_END &&
        gap <= 40;

      const isTransitionBreak = gap <= ALLOWED_TRANSITION;

      if (isOfficialBreak || isTransitionBreak) {
        // Allowed gap - no penalty
        continue;
      } else if (gap > 60) {
        // Large gap > 60 minutes
        largeGapMinutes += gap;
      } else {
        // Small gap (10-60 minutes)
        smallGapMinutes += gap;
      }
    }
  }

  breakdown.largeGapPenalty = SCORE_WEIGHTS.largeGapPerMinute * largeGapMinutes;
  breakdown.smallGapPenalty = SCORE_WEIGHTS.smallGapPerMinute * smallGapMinutes;

  // Priority 5: Avoid single-class days
  let singleClassDays = 0;
  for (const meetings of dayMeetings.values()) {
    if (meetings.length === 1) {
      singleClassDays++;
    }
  }
  breakdown.singleClassDayPenalty =
    SCORE_WEIGHTS.singleClassDayPenalty * singleClassDays;

  // Priority 6: Prefer consecutive weekdays
  const daysUsed = Array.from(dayMeetings.keys()) as Day[];
  daysUsed.sort(dayComparator);

  // Check for consecutive days
  let consecutiveCount = 0;
  for (let i = 1; i < daysUsed.length; i++) {
    if (areConsecutiveDays(daysUsed[i - 1], daysUsed[i])) {
      consecutiveCount++;
    }
  }
  breakdown.consecutiveDaysBonus =
    SCORE_WEIGHTS.consecutiveDaysBonus * consecutiveCount;

  // Check preferred day order: SAT -> (SUN|MON) -> (TUE|WED) -> THU
  const preferredScore = calculatePreferredDayScore(daysUsed);
  breakdown.preferredDayOrderBonus =
    SCORE_WEIGHTS.preferredDayOrderBonus * preferredScore;

  // Latest end
  let latestEnd = -Infinity;
  for (const meetings of dayMeetings.values()) {
    for (const m of meetings) {
      if (m.end > latestEnd) latestEnd = m.end;
    }
  }
  breakdown.latePenalty = SCORE_WEIGHTS.latestEndMin * latestEnd;

  // Priority 7: Lab bonuses (faculty dependencies)
  for (const course of dataset.courses) {
    if (!course.pairsWith) continue;
    const labCode = course.kind === "lab" ? course.code : course.pairsWith;
    const theoryCode =
      course.kind === "theory" ? course.code : course.pairsWith;
    const labSec = picks.get(labCode);
    const theorySec = picks.get(theoryCode);
    if (!labSec || !theorySec) continue;

    // Same teacher
    if (
      labSec.faculty &&
      theorySec.faculty &&
      labSec.faculty.code === theorySec.faculty.code
    ) {
      breakdown.labTeacherBonus += SCORE_WEIGHTS.labTeacherMatch;
    }

    // Same day
    const labDays = new Set(labSec.meetings.map((m) => m.day));
    const theoryDays = new Set(theorySec.meetings.map((m) => m.day));
    const overlap = [...labDays].some((d) => theoryDays.has(d));
    if (overlap) {
      breakdown.labDayBonus += SCORE_WEIGHTS.labDayMatch;
    }
  }

  const score =
    breakdown.outOfWindowPenalty +
    breakdown.largeGapPenalty +
    breakdown.smallGapPenalty +
    breakdown.singleClassDayPenalty +
    breakdown.consecutiveDaysBonus +
    breakdown.preferredDayOrderBonus +
    breakdown.latePenalty +
    breakdown.labTeacherBonus +
    breakdown.labDayBonus;

  return { score, breakdown };
}

// Helper functions for day ordering
const DAY_ORDER: Record<Day, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

function dayComparator(a: Day, b: Day): number {
  return DAY_ORDER[a] - DAY_ORDER[b];
}

function areConsecutiveDays(day1: Day, day2: Day): boolean {
  const order1 = DAY_ORDER[day1];
  const order2 = DAY_ORDER[day2];
  return Math.abs(order2 - order1) === 1;
}

function calculatePreferredDayScore(daysUsed: Day[]): number {
  // Preferred: SAT -> (SUN|MON) -> (TUE|WED) -> THU
  let score = 0;

  const hasDay = (day: Day) => daysUsed.includes(day);

  // Bonus for Saturday
  if (hasDay("SAT")) score += 1;

  // Bonus for SUN or MON
  if (hasDay("SUN") || hasDay("MON")) score += 1;

  // Bonus for TUE or WED
  if (hasDay("TUE") || hasDay("WED")) score += 1;

  // Bonus for Thursday
  if (hasDay("THU")) score += 1;

  // Extra bonus if all 4 match the preferred pattern exactly
  if (daysUsed.length === 4) {
    const isPreferredPattern =
      hasDay("SAT") &&
      (hasDay("SUN") || hasDay("MON")) &&
      (hasDay("TUE") || hasDay("WED")) &&
      hasDay("THU");

    if (isPreferredPattern) score += 2;
  }

  return score;
}

export function computeStats(picks: Map<string, Section>) {
  const dayMeetings = new Map<string, Array<{ start: number; end: number }>>();
  let totalCredits = 0;
  let earliestStart = Infinity;
  let latestEnd = -Infinity;

  for (const section of picks.values()) {
    totalCredits += section.credits;
    for (const m of section.meetings) {
      if (!dayMeetings.has(m.day)) dayMeetings.set(m.day, []);
      dayMeetings.get(m.day)!.push({ start: m.start, end: m.end });
      if (m.start < earliestStart) earliestStart = m.start;
      if (m.end > latestEnd) latestEnd = m.end;
    }
  }

  for (const meetings of dayMeetings.values()) {
    meetings.sort((a, b) => a.start - b.start);
  }

  let totalGapMinutes = 0;
  let longestGapMinutes = 0;
  for (const meetings of dayMeetings.values()) {
    for (let i = 1; i < meetings.length; i++) {
      const gap = meetings[i].start - meetings[i - 1].end;
      if (gap > 0) {
        totalGapMinutes += gap;
        if (gap > longestGapMinutes) longestGapMinutes = gap;
      }
    }
  }

  return {
    distinctDays: dayMeetings.size,
    totalCredits,
    earliestStart: earliestStart === Infinity ? 0 : earliestStart,
    latestEnd: latestEnd === -Infinity ? 0 : latestEnd,
    totalGapMinutes,
    longestGapMinutes,
  };
}
