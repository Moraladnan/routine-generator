import type { Dataset, Section, Meeting, ParseWarning, Day } from "./types";
import { DAY_ORDER } from "./time";

const SLOT_REGEX =
  /^(SUN|MON|TUE|WED|THU|SAT|FRI)\s*#\s*(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})\s*@\s*(\S+)$/;
const FACULTY_REGEX = /^\[([A-Z]{2,6})\]\s+(.+)$/;
const SECTION_CODE_REGEX = /^[A-Z]{2,4}\d{3}\.\d+$/;

export function parseRoutineHTML(html: string): Dataset {
  const warnings: ParseWarning[] = [];
  const sections: Section[] = [];

  // ponytail: DOMParser exists in jsdom (test) and browser (runtime), no wrapper needed
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(
    doc.querySelectorAll("div.ums-grid-offered-section"),
  ).slice(1); // skip header

  for (const row of rows) {
    try {
      const cells = Array.from(row.children).filter(
        (el) => el.nodeType === 1, // element nodes only, skip <!---->
      );

      // Expected order (verified): code, title, credits, faculty, available, slots, advisingType, note, buttonWrapper
      // Fallback: find the slots cell (contains <p> with slot regex), map siblings
      let [
        codeEl,
        titleEl,
        creditsEl,
        facultyEl,
        availableEl,
        slotsEl,
        advisingEl,
        noteEl,
      ] = cells;
      if (
        cells.length !== 9 ||
        !slotsEl?.querySelector("p")?.textContent?.match(SLOT_REGEX)
      ) {
        // Fallback heuristics
        slotsEl =
          cells.find((c) =>
            Array.from(c.querySelectorAll("p")).some((p) =>
              SLOT_REGEX.test(p.textContent?.trim() || ""),
            ),
          ) || slotsEl;
        const slotsIdx = cells.indexOf(slotsEl);
        if (slotsIdx !== -1 && slotsIdx >= 5) {
          [
            codeEl,
            titleEl,
            creditsEl,
            facultyEl,
            availableEl,
            ,
            advisingEl,
            noteEl,
          ] = [
            cells[slotsIdx - 5],
            cells[slotsIdx - 4],
            cells[slotsIdx - 3],
            cells[slotsIdx - 2],
            cells[slotsIdx - 1],
            cells[slotsIdx],
            cells[slotsIdx + 1],
            cells[slotsIdx + 2],
          ];
        }
        warnings.push({
          type: "mismatch",
          message: `DOM structure mismatch in row, fallback applied: ${cells.length} cells`,
        });
      }

      const code = codeEl?.textContent?.trim() || "";
      if (!SECTION_CODE_REGEX.test(code)) {
        warnings.push({
          type: "parse_error",
          message: `Invalid section code: ${code}`,
        });
        continue;
      }

      const [courseCode, sectionNo] = code.split(".");
      const title = titleEl?.textContent?.trim() || "";
      const credits = parseInt(creditsEl?.textContent?.trim() || "0", 10);
      const kind: "theory" | "lab" =
        credits === 1 || /lab$/i.test(title) ? "lab" : "theory";

      const facultyText = facultyEl?.textContent?.trim() || "";
      let faculty: { code: string; name: string } | null = null;
      if (facultyText === "N/A") {
        warnings.push({
          type: "no_faculty",
          message: `Section ${code} has N/A faculty`,
          sectionId: code,
        });
      } else {
        const fMatch = facultyText.match(FACULTY_REGEX);
        if (fMatch) faculty = { code: fMatch[1], name: fMatch[2] };
        else
          warnings.push({
            type: "parse_error",
            message: `Malformed faculty: ${facultyText}`,
            sectionId: code,
          });
      }

      const seatsAvailable = parseInt(
        availableEl?.textContent?.trim() || "",
        10,
      );
      const advisingType = advisingEl?.textContent?.trim() || "";
      const note = noteEl?.textContent?.trim() || "";

      const slotPs = Array.from(slotsEl?.querySelectorAll("p") || []);
      const rawMeetings: Meeting[] = [];
      for (const p of slotPs) {
        const text = p.textContent?.trim() || "";
        const match = text.match(SLOT_REGEX);
        if (!match) continue;
        const [, day, startH, startM, endH, endM, room] = match;
        const start = parseInt(startH, 10) * 60 + parseInt(startM, 10);
        const end = parseInt(endH, 10) * 60 + parseInt(endM, 10);
        rawMeetings.push({ day: day as Day, start, end, room });
      }

      // Dedupe identical (day,start,end,room)
      const seen = new Set<string>();
      const meetings: Meeting[] = [];
      let dupeCount = 0;
      for (const m of rawMeetings) {
        const key = `${m.day}|${m.start}|${m.end}|${m.room}`;
        if (seen.has(key)) {
          dupeCount++;
          continue;
        }
        seen.add(key);
        meetings.push(m);
      }
      if (dupeCount > 0) {
        warnings.push({
          type: "duplicate",
          message: `Section ${code} had ${dupeCount} duplicate meeting(s)`,
          sectionId: code,
        });
      }

      if (meetings.length === 0) {
        warnings.push({
          type: "zero_meetings",
          message: `Section ${code} has zero meetings, excluded from generation`,
          sectionId: code,
        });
        continue;
      }

      sections.push({
        id: code,
        courseCode,
        sectionNo,
        title,
        credits,
        kind,
        faculty,
        seatsAvailable: isNaN(seatsAvailable) ? null : seatsAvailable,
        advisingType,
        note,
        meetings,
      });
    } catch (err) {
      warnings.push({
        type: "parse_error",
        message: `Row parse error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Group by course
  const courseMap = new Map<string, Section[]>();
  for (const s of sections) {
    if (!courseMap.has(s.courseCode)) courseMap.set(s.courseCode, []);
    courseMap.get(s.courseCode)!.push(s);
  }

  const courses = Array.from(courseMap.entries()).map(([code, sects]) => {
    const titles = new Set(sects.map((s) => s.title));
    if (titles.size > 1) {
      warnings.push({
        type: "mismatch",
        message: `Course ${code} has multiple titles: ${Array.from(titles).join(", ")}`,
      });
    }
    return {
      code,
      title: sects[0].title,
      kind: sects[0].kind,
      sections: sects,
    };
  });

  // Meta
  const allMeetings = sections.flatMap((s) => s.meetings);
  const daysSet = new Set<Day>();
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const m of allMeetings) {
    daysSet.add(m.day);
    if (m.start < minStart) minStart = m.start;
    if (m.end > maxEnd) maxEnd = m.end;
  }
  const daysPresent = DAY_ORDER.filter((d) => daysSet.has(d));

  return {
    meta: {
      source: "html",
      generatedAt: new Date().toISOString(),
      daysPresent,
      timeRange: { start: minStart, end: maxEnd },
      counts: {
        courses: courses.length,
        sections: sections.length,
        meetings: allMeetings.length,
      },
      warnings,
    },
    courses,
  };
}

export function parseRoutineJSON(json: string): Dataset {
  return JSON.parse(json) as Dataset;
}
