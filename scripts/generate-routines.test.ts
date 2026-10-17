import { describe, it } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import { parseRoutineHTML } from "../lib/parse-routine";
import { generate } from "../lib/engine";
import type { Config, Day } from "../lib/types";
import { formatTime12 } from "../lib/time";

describe("Generate 4-day routines", () => {
  it("should generate routines from routine.html", () => {
    // Read the HTML file
    const html = readFileSync("./public/routine.html", "utf-8");

    // Parse the dataset
    console.log("\n=== Parsing HTML ===");
    const dataset = parseRoutineHTML(html);

    console.log(`\nDataset Summary:`);
    console.log(`- Courses: ${dataset.meta.counts.courses}`);
    console.log(`- Sections: ${dataset.meta.counts.sections}`);
    console.log(`- Meetings: ${dataset.meta.counts.meetings}`);
    console.log(`- Days present: ${dataset.meta.daysPresent.join(", ")}`);
    console.log(
      `- Time range: ${formatTime12(dataset.meta.timeRange.start)} - ${formatTime12(dataset.meta.timeRange.end)}`,
    );

    // Configuration for 4-day routine
    // Time: 10:00 AM (600 minutes) to 4:20 PM (1000 minutes)
    const config: Config = {
      days: new Set<Day>(["SUN", "MON", "TUE", "WED"]), // 4 days
      window: {
        start: 10 * 60, // 10:00 AM
        end: 16 * 60 + 20, // 4:20 PM
      },
      windowMode: "hard",
      requiredCourses: new Set(dataset.courses.map((c) => c.code)),
      facultyAllowlist: new Map(),
      maxDaysUsed: 4,
      topK: 20, // Generate top 20 routines
    };

    console.log(`\n=== Generating Routines ===`);
    console.log(`Configuration:`);
    console.log(`- Days: ${Array.from(config.days).join(", ")}`);
    console.log(
      `- Time window: ${formatTime12(config.window.start)} - ${formatTime12(config.window.end)}`,
    );
    console.log(`- Required courses: ${config.requiredCourses.size}`);

    const { routines, diagnostics } = generate(dataset, config);

    console.log(`\n✅ Generated ${routines.length} valid routines`);

    if (diagnostics.length > 0) {
      console.log(`\n⚠️  ${diagnostics.length} courses were blocked:`);
      diagnostics.slice(0, 5).forEach((d) => {
        console.log(`  - ${d.courseCode}: ${d.reason}`);
        if (d.closestAlternatives.length > 0) {
          console.log(`    Closest alternatives:`);
          d.closestAlternatives.forEach((alt) => {
            console.log(`      • ${alt.sectionId}: ${alt.issue}`);
          });
        }
      });
      if (diagnostics.length > 5) {
        console.log(`  ... and ${diagnostics.length - 5} more`);
      }
    }

    // Display top routines
    console.log(`\n=== Top ${Math.min(routines.length, 5)} Routines ===`);

    routines.slice(0, 5).forEach((routine, idx) => {
      console.log(`\n--- Routine #${idx + 1} (Score: ${routine.score.toFixed(2)}) ---`);
      console.log(`Days used: ${routine.stats.distinctDays}`);
      console.log(`Total credits: ${routine.stats.totalCredits}`);
      console.log(
        `Time: ${formatTime12(routine.stats.earliestStart)} - ${formatTime12(routine.stats.latestEnd)}`,
      );

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
          classes.sort((a, b) => {
            const aStart = a.time.split(" ")[0];
            const bStart = b.time.split(" ")[0];
            return aStart.localeCompare(bStart);
          });
          classes.forEach((c) => {
            console.log(
              `    ${c.time} | ${c.course} (${c.section}) | ${c.faculty} | Room: ${c.room}`,
            );
          });
        }
      }
    });

    // Save to JSON file
    const output = {
      config: {
        days: Array.from(config.days),
        timeWindow: {
          start: formatTime12(config.window.start),
          end: formatTime12(config.window.end),
        },
        courses: Array.from(config.requiredCourses),
      },
      routinesCount: routines.length,
      routines: routines.map((r, idx) => ({
        routineNumber: idx + 1,
        score: r.score,
        stats: {
          ...r.stats,
          earliestStart: formatTime12(r.stats.earliestStart),
          latestEnd: formatTime12(r.stats.latestEnd),
        },
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
    console.log(`\n✅ All routines saved to routines-output.json`);
  });
});
