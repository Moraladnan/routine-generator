"use client";

import type { Routine } from "@/lib/types";

interface Props {
  breakdown: Routine["scoreBreakdown"];
}

export default function ScoreBreakdown({ breakdown }: Props) {
  const items = [
    { label: "Out of window penalty", value: breakdown.outOfWindowPenalty },
    { label: "Large gap penalty", value: breakdown.largeGapPenalty },
    { label: "Small gap penalty", value: breakdown.smallGapPenalty },
    {
      label: "Single-class day penalty",
      value: breakdown.singleClassDayPenalty,
    },
    { label: "Consecutive days bonus", value: breakdown.consecutiveDaysBonus },
    {
      label: "Preferred day order bonus",
      value: breakdown.preferredDayOrderBonus,
    },
    { label: "Late penalty", value: breakdown.latePenalty },
    { label: "Lab teacher match bonus", value: breakdown.labTeacherBonus },
    { label: "Lab day match bonus", value: breakdown.labDayBonus },
  ];

  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="text-xs space-y-1">
      {items
        .filter((item) => item.value !== 0)
        .map((item, i) => (
          <div
            key={i}
            className="flex justify-between text-gray-700 dark:text-gray-300"
          >
            <span>{item.label}</span>
            <span
              className={
                item.value > 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {item.value > 0 ? "+" : ""}
              {item.value}
            </span>
          </div>
        ))}
      <div className="flex justify-between font-semibold border-t border-gray-200 dark:border-gray-700 pt-1 text-gray-900 dark:text-gray-100">
        <span>Total</span>
        <span>{total}</span>
      </div>
    </div>
  );
}
