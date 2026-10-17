"use client";

import type { Routine, Config, Day } from "@/lib/types";
import { formatTime12, DAY_ORDER } from "@/lib/time";

interface Props {
  routine: Routine;
  config: Config;
}

export default function RoutineTable({ routine, config }: Props) {
  // Organize meetings by day
  const meetingsByDay = new Map<
    Day,
    Array<{
      start: number;
      end: number;
      courseCode: string;
      room: string;
      faculty: string;
    }>
  >();

  for (const [courseCode, section] of routine.picks) {
    for (const m of section.meetings) {
      if (!meetingsByDay.has(m.day)) meetingsByDay.set(m.day, []);
      meetingsByDay.get(m.day)!.push({
        start: m.start,
        end: m.end,
        courseCode,
        room: m.room,
        faculty: section.faculty?.name || "TBA",
      });
    }
  }

  // Find time range
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const meetings of meetingsByDay.values()) {
    for (const m of meetings) {
      if (m.start < minStart) minStart = m.start;
      if (m.end > maxEnd) maxEnd = m.end;
    }
  }

  // Extend range to window if wider
  if (config.window.start < minStart) minStart = config.window.start;
  if (config.window.end > maxEnd) maxEnd = config.window.end;

  // Round to half-hour
  minStart = Math.floor(minStart / 30) * 30;
  maxEnd = Math.ceil(maxEnd / 30) * 30;

  const totalMinutes = maxEnd - minStart;
  const PX_PER_MIN = 1.1;

  const usedDays = DAY_ORDER.filter((d) => meetingsByDay.has(d));

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex gap-1">
          {/* Time gutter */}
          <div
            className="w-16 shrink-0 relative"
            style={{ height: totalMinutes * PX_PER_MIN }}
          >
            {Array.from({ length: Math.ceil(totalMinutes / 30) + 1 }).map(
              (_, i) => {
                const time = minStart + i * 30;
                return (
                  <div
                    key={i}
                    className="absolute right-2 text-xs text-gray-500 dark:text-gray-400"
                    style={{ top: i * 30 * PX_PER_MIN - 6 }}
                  >
                    {formatTime12(time)}
                  </div>
                );
              },
            )}
          </div>

          {/* Day columns */}
          {usedDays.map((day) => (
            <div key={day} className="flex-1 min-w-32 relative">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center pb-2">
                {day}
              </div>
              <div
                className="relative border-l border-gray-200 dark:border-gray-700"
                style={{ height: totalMinutes * PX_PER_MIN }}
              >
                {/* Hour lines */}
                {Array.from({ length: Math.ceil(totalMinutes / 60) + 1 }).map(
                  (_, i) => (
                    <div
                      key={i}
                      className="absolute w-full border-t border-gray-200 dark:border-gray-700"
                      style={{ top: i * 60 * PX_PER_MIN }}
                    />
                  ),
                )}

                {/* Window shading */}
                {config.windowMode === "hard" && (
                  <div
                    className="absolute w-full bg-blue-50/50 dark:bg-blue-900/10 border-y border-blue-200 dark:border-blue-800"
                    style={{
                      top: (config.window.start - minStart) * PX_PER_MIN,
                      height:
                        (config.window.end - config.window.start) * PX_PER_MIN,
                    }}
                  />
                )}

                {/* Meetings */}
                {meetingsByDay.get(day)?.map((m, i) => {
                  const isOutOfWindow =
                    m.start < config.window.start || m.end > config.window.end;
                  return (
                    <div
                      key={i}
                      className={`absolute inset-x-1 rounded px-1 py-0.5 text-xs overflow-hidden ${
                        isOutOfWindow
                          ? "bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700"
                          : "bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700"
                      }`}
                      style={{
                        top: (m.start - minStart) * PX_PER_MIN,
                        height: (m.end - m.start) * PX_PER_MIN,
                      }}
                    >
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {m.courseCode}
                      </div>
                      <div className="text-gray-700 dark:text-gray-300">
                        {m.room}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">
                        {formatTime12(m.start)}–{formatTime12(m.end)}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">
                        {m.faculty}
                      </div>
                      {isOutOfWindow && (
                        <div className="text-amber-700 dark:text-amber-400 font-medium">
                          Outside
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
