export type Day = "SUN" | "MON" | "TUE" | "WED" | "THU" | "SAT" | "FRI";

export interface Meeting {
  day: Day;
  start: number; // minutes since midnight
  end: number;
  room: string;
}

export interface Section {
  id: string; // "CSE264.9"
  courseCode: string; // "CSE264"
  sectionNo: string; // "9"
  title: string;
  credits: number;
  kind: "theory" | "lab";
  faculty: { code: string; name: string } | null; // "N/A" → null
  seatsAvailable: number | null;
  advisingType: string;
  note: string;
  meetings: Meeting[];
}

export interface Course {
  code: string;
  title: string;
  kind: "theory" | "lab";
  pairsWith?: string;
  sections: Section[];
}

export interface ParseWarning {
  type:
    | "duplicate"
    | "no_faculty"
    | "zero_meetings"
    | "parse_error"
    | "mismatch";
  message: string;
  sectionId?: string;
}

export interface Dataset {
  meta: {
    source: "html" | "json";
    generatedAt: string;
    daysPresent: Day[];
    timeRange: { start: number; end: number };
    counts: { courses: number; sections: number; meetings: number };
    warnings: ParseWarning[];
  };
  courses: Course[];
}

export interface Config {
  days: Set<Day>;
  window: { start: number; end: number };
  windowMode: "hard" | "soft";
  requiredCourses: Set<string>; // course codes
  facultyAllowlist: Map<string, Set<string>>; // courseCode → faculty codes
  maxDaysUsed?: number;
  topK: number;
}

export interface Routine {
  id: string;
  picks: Map<string, Section>; // courseCode → section
  stats: {
    distinctDays: number;
    totalCredits: number;
    earliestStart: number;
    latestEnd: number;
    totalGapMinutes: number;
    longestGapMinutes: number;
  };
  score: number;
  scoreBreakdown: {
    outOfWindowPenalty: number;
    largeGapPenalty: number;
    smallGapPenalty: number;
    singleClassDayPenalty: number;
    consecutiveDaysBonus: number;
    preferredDayOrderBonus: number;
    latePenalty: number;
    labTeacherBonus: number;
    labDayBonus: number;
  };
}

export interface BlockedCourseDiagnostic {
  courseCode: string;
  reason: string; // which condition blocked it
  closestAlternatives: Array<{ sectionId: string; issue: string }>; // top 3
}

export interface Relaxation {
  type: "add_day" | "extend_window" | "relax_faculty" | "raise_max_days";
  description: string;
  count: number; // how many routines unlocked
  example?: Routine;
}

export interface SwapSuggestion {
  fromSectionId: string;
  toSectionId: string;
  reason: string;
  scoreGain: number;
}

export interface NearMissRoutine {
  routine: Routine;
  violatingCourse: string;
  minutesOutside: number;
  fixes: Array<{ sectionId: string; description: string }>;
}

export interface Report {
  exact: Routine[];
  diagnostics: BlockedCourseDiagnostic[];
  relaxations: Relaxation[];
  nearMiss: NearMissRoutine[];
  swaps: Map<string, SwapSuggestion[]>; // routineId → suggestions
}
