"use client";

import { useState } from "react";
import type { Routine, Config, Dataset, SwapSuggestion } from "@/lib/types";
import { formatTime12 } from "@/lib/time";
import RoutineTable from "./routine-table";
import ScoreBreakdown from "./score-breakdown";

interface Props {
  routine: Routine;
  config: Config;
  dataset: Dataset;
  suggestions?: SwapSuggestion[];
}

export default function RoutineCard({ routine, config, suggestions }: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const handleCopy = () => {
    const data = {
      picks: Array.from(routine.picks.values()).map((s) => ({
        id: s.id,
        courseCode: s.courseCode,
        faculty: s.faculty,
        meetings: s.meetings,
      })),
      stats: routine.stats,
      score: routine.score,
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  const handleDownload = () => {
    const data = {
      picks: Array.from(routine.picks.values()).map((s) => ({
        id: s.id,
        courseCode: s.courseCode,
        sectionNo: s.sectionNo,
        title: s.title,
        credits: s.credits,
        faculty: s.faculty,
        meetings: s.meetings,
      })),
      stats: routine.stats,
      score: routine.score,
      scoreBreakdown: routine.scoreBreakdown,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `routine-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <RoutineTable routine={routine} config={config} />

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
          {routine.stats.distinctDays} days
        </span>
        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
          {routine.stats.totalCredits} credits
        </span>
        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
          {formatTime12(routine.stats.earliestStart)}–
          {formatTime12(routine.stats.latestEnd)}
        </span>
        {routine.stats.totalGapMinutes > 0 && (
          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
            {routine.stats.totalGapMinutes}m gaps
          </span>
        )}
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="px-2 py-1 bg-blue-100 dark:bg-blue-900/40 rounded text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60"
        >
          {showBreakdown ? "Hide" : "Show"} score ({routine.score})
        </button>
      </div>

      {showBreakdown && (
        <div className="mt-3">
          <ScoreBreakdown breakdown={routine.scoreBreakdown} />
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="mt-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
          <div className="text-sm font-medium text-green-900 dark:text-green-200 mb-2">
            Suggestions
          </div>
          {suggestions.map((s, i) => (
            <div
              key={i}
              className="text-xs text-green-800 dark:text-green-300 mb-1"
            >
              • Swap {s.fromSectionId} → {s.toSectionId}: {s.reason} (+
              {s.scoreGain} pts)
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleCopy}
          className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          Copy JSON
        </button>
        <button
          onClick={handleDownload}
          className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          Download JSON
        </button>
      </div>
    </div>
  );
}
