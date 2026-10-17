import { readFileSync, writeFileSync } from "fs";

// Simple HTML parser for the specific structure
function parseRoutineHTML(html) {
  const sections = [];
  const warnings = [];

  // Extract all section blocks - find divs with ums-grid-offered-section class
  const blockRegex =
    /<div[^>]*class="grid[^"]*ums-grid-offered-section[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let match;
  const blocks = [];

  while ((match = blockRegex.exec(html)) !== null) {
    blocks.push(match[0]);
  }

  console.log(`Found ${blocks.length} section blocks`);

  for (const block of blocks) {
    try {
      // Extract section code - look for pattern like CSE261.1, CSE264.10, MAT261.2
      const codeMatch = block.match(/([A-Z]{3}\d{3}\.\d+)/);
      if (!codeMatch) {
        // Debug: print first 200 chars of block
        if (blocks.indexOf(block) < 3) {
          console.log(
            `Block ${blocks.indexOf(block)} preview:`,
            block.substring(0, 200),
          );
        }
        warnings.push(
          `No valid section code found in block ${blocks.indexOf(block)}`,
        );
        continue;
      }

      const sectionId = codeMatch[1];
      const [courseCode, sectionNo] = sectionId.split(".");

      // Extract title
      const titleMatch = block.match(
        /<div[^>]*class="[^"]*ng-tns-c417-11[^"]*"[^>]*>\s*([^<]+)\s*<\/div>/,
      );
      const title = titleMatch ? titleMatch[1].trim() : "";

      // Extract credits
      const creditsMatch = block.match(
        /<div[^>]*class="ml-3[^"]*"[^>]*>(\d+)<\/div>/,
      );
      const credits = creditsMatch ? parseInt(creditsMatch[1]) : 0;

      // Extract faculty
      const facultyMatch = block.match(/\[([A-Z]{2,6})\]\s+([^<]+)/);
      const faculty = facultyMatch
        ? {
            code: facultyMatch[1],
            name: facultyMatch[2].trim(),
          }
        : null;

      // Extract meetings
      const meetings = [];
      const meetingRegex =
        /(SUN|MON|TUE|WED|THU|SAT|FRI)\s*#\s*(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})\s*@\s*(\S+)/g;
      let meetingMatch;
      while ((meetingMatch = meetingRegex.exec(block)) !== null) {
        const day = meetingMatch[1];
        const startHour = parseInt(meetingMatch[2]);
        const startMin = parseInt(meetingMatch[3]);
        const endHour = parseInt(meetingMatch[4]);
        const endMin = parseInt(meetingMatch[5]);
        const room = meetingMatch[6];

        meetings.push({
          day,
          start: startHour * 60 + startMin,
          end: endHour * 60 + endMin,
          room,
        });
      }

      if (meetings.length === 0) {
        warnings.push(`No meetings found for ${sectionId}`);
        continue;
      }

      const kind = credits === 1 || /lab/i.test(title) ? "lab" : "theory";

      sections.push({
        id: sectionId,
        courseCode,
        sectionNo,
        title,
        credits,
        kind,
        faculty,
        meetings,
      });
    } catch (e) {
      console.error("Error parsing section:", e.message);
    }
  }

  // Group into courses
  const courseMap = new Map();
  for (const section of sections) {
    if (!courseMap.has(section.courseCode)) {
      courseMap.set(section.courseCode, {
        code: section.courseCode,
        title: section.title,
        kind: section.kind,
        sections: [],
      });
    }
    courseMap.get(section.courseCode).sections.push(section);
  }

  return {
    courses: Array.from(courseMap.values()),
    warnings,
  };
}

// Check if a section fits the time window and days
function satisfiesConstraints(section, config) {
  for (const meeting of section.meetings) {
    // Check day
    if (!config.days.has(meeting.day)) {
      return false;
    }
    // Check time window (hard constraint)
    if (
      meeting.start < config.window.start ||
      meeting.end > config.window.end
    ) {
      return false;
    }
  }
  return true;
}

// Check if two sections overlap
function hasOverlap(section1, section2) {
  for (const m1 of section1.meetings) {
    for (const m2 of section2.meetings) {
      if (m1.day === m2.day) {
        // Check time overlap
        if (m1.start < m2.end && m1.end > m2.start) {
          return true;
        }
      }
    }
  }
  return false;
}

// Generate routines
function generateRoutines(dataset, config) {
  const routines = [];
  const diagnostics = [];

  // Filter sections by constraints
  const candidatesPerCourse = new Map();

  for (const course of dataset.courses) {
    const validSections = course.sections.filter((s) =>
      satisfiesConstraints(s, config),
    );
    if (validSections.length > 0) {
      candidatesPerCourse.set(course.code, validSections);
    } else {
      diagnostics.push({
        courseCode: course.code,
        reason: `No sections fit in ${Array.from(config.days).join(",")} from ${Math.floor(config.window.start / 60)}:${(config.window.start % 60).toString().padStart(2, "0")} to ${Math.floor(config.window.end / 60)}:${(config.window.end % 60).toString().padStart(2, "0")}`,
      });
    }
  }

  const courseCodes = Array.from(candidatesPerCourse.keys());
  console.log(`\nFound ${courseCodes.length} courses with valid sections`);

  // Try to build routines (simplified - just pick first valid combination)
  function buildRoutine(index, picks) {
    if (routines.length >= 20) return; // Limit to 20 routines

    if (index === courseCodes.length) {
      // Check for duplicate faculty teaching same course
      const facultyMap = new Map();
      for (const [code, section] of picks) {
        if (section.faculty) {
          if (!facultyMap.has(section.faculty.code)) {
            facultyMap.set(section.faculty.code, []);
          }
          facultyMap.get(section.faculty.code).push(code);
        }
      }

      // Ensure no duplicate faculty for same course
      for (const [faculty, courses] of facultyMap) {
        const courseSet = new Set(courses);
        if (courses.length !== courseSet.size) {
          return; // Skip this routine
        }
      }

      routines.push(new Map(picks));
      return;
    }

    const courseCode = courseCodes[index];
    const candidates = candidatesPerCourse.get(courseCode);

    for (const section of candidates) {
      // Check for overlaps with already picked sections
      let hasConflict = false;
      for (const [_, pickedSection] of picks) {
        if (hasOverlap(section, pickedSection)) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        picks.set(courseCode, section);
        buildRoutine(index + 1, picks);
        picks.delete(courseCode);
      }
    }
  }

  buildRoutine(0, new Map());

  return { routines, diagnostics };
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, "0")} ${ampm}`;
}

// Main execution
const html = readFileSync("./public/routine.html", "utf-8");

console.log("Parsing HTML...");
const dataset = parseRoutineHTML(html);

console.log(`\nDataset Summary:`);
console.log(`- Courses: ${dataset.courses.length}`);
console.log(
  `- Total sections: ${dataset.courses.reduce((sum, c) => sum + c.sections.length, 0)}`,
);
console.log(`- Warnings: ${dataset.warnings.length}`);

// Configuration for 4-day routine
const config = {
  days: new Set(["SUN", "MON", "TUE", "WED"]), // 4 days
  window: {
    start: 10 * 60, // 10:00 AM
    end: 16 * 60 + 20, // 4:20 PM (1000 minutes)
  },
};

console.log(`\n=== Generating Routines ===`);
console.log(`Configuration:`);
console.log(`- Days: ${Array.from(config.days).join(", ")}`);
console.log(
  `- Time window: ${formatTime(config.window.start)} - ${formatTime(config.window.end)}`,
);

const { routines, diagnostics } = generateRoutines(dataset, config);

console.log(`\nGenerated ${routines.length} valid routines`);

if (diagnostics.length > 0) {
  console.log(`\n⚠️  ${diagnostics.length} courses were blocked:`);
  diagnostics.slice(0, 5).forEach((d) => {
    console.log(`  - ${d.courseCode}: ${d.reason}`);
  });
  if (diagnostics.length > 5) {
    console.log(`  ... and ${diagnostics.length - 5} more`);
  }
}

// Display routines
console.log(`\n=== Generated Routines ===\n`);

routines.forEach((routine, idx) => {
  console.log(`\n--- Routine #${idx + 1} ---`);

  // Calculate stats
  const allDays = new Set();
  const allMeetings = [];
  let totalCredits = 0;

  for (const [code, section] of routine) {
    totalCredits += section.credits;
    for (const meeting of section.meetings) {
      allDays.add(meeting.day);
      allMeetings.push({
        ...meeting,
        courseCode: code,
        sectionId: section.id,
        faculty: section.faculty,
      });
    }
  }

  console.log(`Courses: ${routine.size}`);
  console.log(`Credits: ${totalCredits}`);
  console.log(`Days: ${allDays.size} (${Array.from(allDays).join(", ")})`);

  // Group by day
  const dayOrder = ["SUN", "MON", "TUE", "WED", "THU", "SAT"];
  const byDay = new Map();

  for (const meeting of allMeetings) {
    if (!byDay.has(meeting.day)) {
      byDay.set(meeting.day, []);
    }
    byDay.get(meeting.day).push(meeting);
  }

  // Display schedule
  for (const day of dayOrder) {
    const classes = byDay.get(day);
    if (classes && classes.length > 0) {
      console.log(`\n  ${day}:`);
      classes.sort((a, b) => a.start - b.start);
      classes.forEach((c) => {
        console.log(
          `    ${formatTime(c.start)} - ${formatTime(c.end)} | ${c.courseCode} (${c.sectionId}) | ${c.faculty?.name || "N/A"} | ${c.room}`,
        );
      });
    }
  }
});

// Save to file
const output = {
  config: {
    days: Array.from(config.days),
    timeWindow: {
      start: formatTime(config.window.start),
      end: formatTime(config.window.end),
    },
  },
  routinesCount: routines.length,
  routines: routines.map((routine, idx) => {
    const schedule = {};
    for (const [code, section] of routine) {
      for (const meeting of section.meetings) {
        if (!schedule[meeting.day]) schedule[meeting.day] = [];
        schedule[meeting.day].push({
          courseCode: code,
          sectionId: section.id,
          title: section.title,
          time: `${formatTime(meeting.start)} - ${formatTime(meeting.end)}`,
          faculty: section.faculty?.name || "N/A",
          room: meeting.room,
        });
      }
    }
    return {
      routineNumber: idx + 1,
      schedule,
    };
  }),
  diagnostics,
};

writeFileSync("routines-output.json", JSON.stringify(output, null, 2));
console.log("\n✅ All routines saved to routines-output.json");
