import { describe, test, expect } from "vitest";
import { parseRoutineHTML } from "../parse-routine";
import * as fs from "fs";
import * as path from "path";

describe("verify theory sections have multiple meetings", () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), "public", "routine.html"),
    "utf-8",
  );
  const dataset = parseRoutineHTML(html);

  test("CSE263.1 (theory) has 2 meetings", () => {
    const cse263 = dataset.courses.find((c) => c.code === "CSE263")!;
    const sec1 = cse263.sections.find((s) => s.sectionNo === "1")!;
    expect(sec1.credits).toBe(3); // theory
    expect(sec1.meetings).toHaveLength(2); // MON + WED
    expect(sec1.meetings[0].day).not.toBe(sec1.meetings[1].day);
  });

  test("CSE261.2 (theory) has 2 meetings", () => {
    const cse261 = dataset.courses.find((c) => c.code === "CSE261")!;
    const sec2 = cse261.sections.find((s) => s.sectionNo === "2")!;
    expect(sec2.credits).toBe(3); // theory
    expect(sec2.meetings).toHaveLength(2); // MON + WED
  });

  test("CSE264.1 (lab) has 1 meeting", () => {
    const cse264 = dataset.courses.find((c) => c.code === "CSE264")!;
    const sec1 = cse264.sections.find((s) => s.sectionNo === "1")!;
    expect(sec1.credits).toBe(1); // lab
    expect(sec1.meetings).toHaveLength(1); // only TUE
  });

  test("CSE265.1 (theory) has 2 meetings", () => {
    const cse265 = dataset.courses.find((c) => c.code === "CSE265")!;
    expect(cse265).toBeDefined();
    const sec1 = cse265.sections.find((s) => s.sectionNo === "1")!;
    expect(sec1).toBeDefined();
    expect(sec1.id).toBe("CSE265.1");
    expect(sec1.credits).toBe(3); // theory
    expect(sec1.meetings).toHaveLength(2); // 2 meetings per week
    expect(sec1.meetings[0].day).not.toBe(sec1.meetings[1].day);
  });
});
