"use client";

import type { Dataset, Config, Day } from "@/lib/types";
import { formatTime24 } from "@/lib/time";

interface Props {
  dataset: Dataset | null;
  config: Config;
  onConfigChange: (config: Config) => void;
  onGenerate: () => void;
  onReset: () => void;
  canGenerate: boolean;
}

export default function ConditionsPanel({
  dataset,
  config,
  onConfigChange,
  onGenerate,
  onReset,
  canGenerate,
}: Props) {
  const handleDayToggle = (day: Day) => {
    const newDays = new Set(config.days);
    if (newDays.has(day)) newDays.delete(day);
    else newDays.add(day);
    onConfigChange({ ...config, days: newDays });
  };

  const handleWindowChange = (field: "start" | "end", value: string) => {
    const [h, m] = value.split(":").map(Number);
    const minutes = h * 60 + m;
    onConfigChange({
      ...config,
      window: { ...config.window, [field]: minutes },
    });
  };

  const handleCourseToggle = (code: string) => {
    const newCourses = new Set(config.requiredCourses);
    if (newCourses.has(code)) {
      newCourses.delete(code);
      const newAllowlist = new Map(config.facultyAllowlist);
      newAllowlist.delete(code);
      onConfigChange({
        ...config,
        requiredCourses: newCourses,
        facultyAllowlist: newAllowlist,
      });
    } else {
      newCourses.add(code);
      onConfigChange({ ...config, requiredCourses: newCourses });
    }
  };

  const handleFacultyToggle = (courseCode: string, facultyCode: string) => {
    const newAllowlist = new Map(config.facultyAllowlist);
    const current = newAllowlist.get(courseCode) || new Set();
    const updated = new Set(current);
    if (updated.has(facultyCode)) updated.delete(facultyCode);
    else updated.add(facultyCode);
    if (updated.size === 0) newAllowlist.delete(courseCode);
    else newAllowlist.set(courseCode, updated);
    onConfigChange({ ...config, facultyAllowlist: newAllowlist });
  };

  if (!dataset) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <h2 className="font-semibold text-gray-900 dark:text-gray-100">
        Conditions
      </h2>

      {/* Days */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Days
        </label>
        <div className="flex flex-wrap gap-2">
          {dataset.meta.daysPresent.map((day) => (
            <button
              key={day}
              onClick={() => handleDayToggle(day)}
              className={`px-3 py-1 text-sm rounded ${
                config.days.has(day)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {/* Window */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Time Window
        </label>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="time"
            value={formatTime24(config.window.start)}
            onChange={(e) => handleWindowChange("start", e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <span className="text-gray-500">–</span>
          <input
            type="time"
            value={formatTime24(config.window.end)}
            onChange={(e) => handleWindowChange("end", e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onConfigChange({ ...config, windowMode: "hard" })}
            className={`flex-1 px-3 py-1 text-sm rounded ${
              config.windowMode === "hard"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Hard
          </button>
          <button
            onClick={() => onConfigChange({ ...config, windowMode: "soft" })}
            className={`flex-1 px-3 py-1 text-sm rounded ${
              config.windowMode === "soft"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Soft
          </button>
        </div>
      </div>

      {/* Courses */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Required Courses
        </label>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {dataset.courses.map((course) => (
            <div key={course.code} className="space-y-1">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.requiredCourses.has(course.code)}
                  onChange={() => handleCourseToggle(course.code)}
                  className="mt-1"
                />
                <div className="flex-1 text-sm">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {course.code}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {course.sections.length} sections
                  </div>
                </div>
              </label>
              {config.requiredCourses.has(course.code) && (
                <div className="ml-6 flex flex-wrap gap-1">
                  {Array.from(
                    new Set(
                      course.sections
                        .filter((s) => s.faculty)
                        .map((s) => s.faculty!.code),
                    ),
                  ).map((fCode) => {
                    const selected =
                      config.facultyAllowlist.get(course.code)?.has(fCode) ||
                      false;
                    return (
                      <button
                        key={fCode}
                        onClick={() => handleFacultyToggle(course.code, fCode)}
                        className={`px-2 py-0.5 text-xs rounded ${
                          selected
                            ? "bg-green-600 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {fCode}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed hover:bg-blue-700"
        >
          Generate
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
