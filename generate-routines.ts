import { parseRoutineHTML } from "./lib/parse-routine";
import { generate } from "./lib/engine";
import type { Config, Day, Routine } from "./lib/types";
import { formatTime12 } from "./lib/time";
import { readFileSync, writeFileSync } from "fs";

// Read the HTML file
const html = readFileSync("./public/routine.html", "utf-8");

// Parse the dataset
console.log("Parsing HTML...");
const dataset = parseRoutineHTML(html);

console.log("\nDataset Summary:");
console.log(`- Courses: ${dataset.meta.counts.courses}`);
console.log(`- Sections: ${dataset.meta.counts.sections}`);
console.log(`- Meetings: ${dataset.meta.counts.meetings}`);
console.log(`- Days present: ${dataset.meta.daysPresent.join(", ")}`);
console.log(
  `- Time range: ${formatTime12(dataset.meta.timeRange.start)} - ${formatTime12(dataset.meta.timeRange.end)}`,
);
console.log(`- Warnings: ${dataset.meta.warnings.length}`);

// Extract all unique courses
const allCourses = dataset.courses.map((c) => c.code);
console.log("\nAvailable courses:");
allCourses.forEach((code) => {
  const course = dataset.courses.find((c) => c.code === code)!;
  console.log(
    `  ${code}: ${course.title} (${course.sections.length} sections)`,
  );
});

// Configuration for 4-day routine
// Time: 10:00 AM (600 minutes) to 4:20 PM (1000 minutes)
const config: Config = {
  days: new Set<Day>(["SUN", "MON", "TUE", "WED"]), // 4 days: Sunday through Wednesday
  window: {
    start: 10 * 60, // 10:00 AM
    end: 16 * 60 + 20, // 4:20 PM
  },
  windowMode: "hard",
  requiredCourses: new Set(allCourses), // Try to include all courses
  facultyAllowlist: new Map(),
  maxDaysUsed: 4,
  topK: 50, // Generate top 50 routines
};

console.log("\n=== Generating Routines ===");
console.log(`Configuration:`);
console.log(`- Days: ${Array.from(config.days).join(", ")}`);
console.log(
  `- Time window: ${formatTime12(config.window.start)} - ${formatTime12(config.window.end)}`,
);
console.log(`- Required courses: ${config.requiredCourses.size}`);
console.log(`- Max days: ${config.maxDaysUsed}`);

const { routines, diagnostics } = generate(dataset, config);

console.log(`\nGenerated ${routines.length} valid routines`);

if (diagnostics.length > 0) {
  console.log("\n⚠️  Some courses were blocked:");
  diagnostics.forEach((d) => {
    console.log(`\n${d.courseCode}: ${d.reason}`);
    if (d.closestAlternatives.length > 0) {
      console.log("  Closest alternatives:");
      d.closestAlternatives.forEach((alt) => {
        console.log(`    - ${alt.sectionId}: ${alt.issue}`);
      });
    }
  });
}

// Display top 10 routines
console.log("\n=== Top 10 Routines ===\n");
routines.slice(0, 10).forEach((routine, idx) => {
  console.log(
    `\n--- Routine #${idx + 1} (Score: ${routine.score.toFixed(2)}) ---`,
  );
  console.log(`Days used: ${routine.stats.distinctDays}`);
  console.log(`Total credits: ${routine.stats.totalCredits}`);
  console.log(
    `Time: ${formatTime12(routine.stats.earliestStart)} - ${formatTime12(routine.stats.latestEnd)}`,
  );
  console.log(`\nSections:`);

  // Group by day
  const byDay = new Map<
    Day,
    Array<{
      course: string;
      section: string;
      time: string;
      room: string;
      faculty: string;
    }>
  >();

  for (const [courseCode, section] of routine.picks) {
    const course = dataset.courses.find((c) => c.code === courseCode)!;
    for (const meeting of section.meetings) {
      if (!byDay.has(meeting.day)) {
        byDay.set(meeting.day, []);
      }
      byDay.get(meeting.day)!.push({
        course: courseCode,
        section: section.id,
        time: `${formatTime12(meeting.start)} - ${formatTime12(meeting.end)}`,
        room: meeting.room,
        faculty: section.faculty?.name || "N/A",
      });
    }
  }

  // Display by day
  const dayOrder: Day[] = ["SUN", "MON", "TUE", "WED", "THU", "SAT", "FRI"];
  for (const day of dayOrder) {
    const classes = byDay.get(day);
    if (classes && classes.length > 0) {
      console.log(`\n  ${day}:`);
      // Sort by time
      classes.sort((a, b) => {
        const aStart = parseInt(a.time.split(" ")[0].split(":")[0]);
        const bStart = parseInt(b.time.split(" ")[0].split(":")[0]);
        return aStart - bStart;
      });
      classes.forEach((c) => {
        console.log(
          `    ${c.time} | ${c.course} (${c.section}) | ${c.faculty} | Room: ${c.room}`,
        );
      });
    }
  }

  console.log(`\nScore Breakdown:`);
  console.log(
    `  - Out of window penalty: ${routine.scoreBreakdown.outOfWindowPenalty}`,
  );
  console.log(
    `  - Large gap penalty: ${routine.scoreBreakdown.largeGapPenalty}`,
  );
  console.log(
    `  - Small gap penalty: ${routine.scoreBreakdown.smallGapPenalty}`,
  );
  console.log(
    `  - Single-class day penalty: ${routine.scoreBreakdown.singleClassDayPenalty}`,
  );
  console.log(
    `  - Consecutive days bonus: ${routine.scoreBreakdown.consecutiveDaysBonus}`,
  );
  console.log(
    `  - Preferred day order bonus: ${routine.scoreBreakdown.preferredDayOrderBonus}`,
  );
  console.log(`  - Late penalty: ${routine.scoreBreakdown.latePenalty}`);
  console.log(
    `  - Lab teacher bonus: ${routine.scoreBreakdown.labTeacherBonus}`,
  );
  console.log(`  - Lab day bonus: ${routine.scoreBreakdown.labDayBonus}`);
});

// Save all routines to JSON file
const output = {
  config: {
    days: Array.from(config.days),
    timeWindow: {
      start: formatTime12(config.window.start),
      end: formatTime12(config.window.end),
    },
    courses: Array.from(config.requiredCourses),
  },
  routines: routines.map((r) => ({
    id: r.id,
    score: r.score,
    stats: r.stats,
    scoreBreakdown: r.scoreBreakdown,
    sections: Array.from(r.picks.entries()).map(([code, section]) => ({
      courseCode: code,
      sectionId: section.id,
      title: section.title,
      faculty: section.faculty,
      meetings: section.meetings.map((m) => ({
        day: m.day,
        time: `${formatTime12(m.start)} - ${formatTime12(m.end)}`,
        room: m.room,
      })),
    })),
  })),
  diagnostics,
};

writeFileSync("routines-output.json", JSON.stringify(output, null, 2));
console.log("\n✅ All routines saved to routines-output.json");
