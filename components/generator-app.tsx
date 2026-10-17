"use client";

import { useState, useEffect } from "react";
import type { Dataset, Config, Report } from "@/lib/types";
import { parseRoutineHTML } from "@/lib/parse-routine";
import { applyLabPairings } from "@/lib/dataset";
import { generate } from "@/lib/engine";
import {
  computeRelaxations,
  compute1SwapSuggestions,
  computeNearMiss,
} from "@/lib/suggestions";
import { DAY_ORDER } from "@/lib/time";
import DatasetPanel from "./dataset-panel";
import ConditionsPanel from "./conditions-panel";
import RoutineCard from "./routine-card";

const STORAGE_KEY = "seu-routine-generator-v1";

interface State {
  dataset: Dataset | null;
  config: Config;
  report: Report | null;
  showCount: number;
}

export default function GeneratorApp() {
  const [state, setState] = useState<State>({
    dataset: null,
    config: {
      days: new Set(DAY_ORDER.slice(0, 6)), // SUN-SAT, exclude FRI
      window: { start: 10 * 60, end: 16 * 60 + 20 },
      windowMode: "hard",
      requiredCourses: new Set(),
      facultyAllowlist: new Map(),
      topK: 50, // reduced from 200 to generate fewer routines
    },
    report: null,
    showCount: 20,
  });

  // Load default dataset on mount
  useEffect(() => {
    const loadDefault = async () => {
      try {
        const res = await fetch("/routine.html");
        const html = await res.text();
        const parsed = applyLabPairings(parseRoutineHTML(html));
        setState((prev) => ({ ...prev, dataset: parsed }));

        // Try restore from localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const { config } = JSON.parse(stored);
            if (config) {
              setState((prev) => ({
                ...prev,
                config: {
                  ...config,
                  days: new Set(config.days),
                  requiredCourses: new Set(config.requiredCourses),
                  facultyAllowlist: new Map(
                    Object.entries(config.facultyAllowlist).map(([k, v]) => [
                      k,
                      new Set(v as string[]),
                    ]),
                  ),
                },
              }));
            }
          } catch {
            // ignore parse errors
          }
        }
      } catch (err) {
        console.error("Failed to load default dataset:", err);
      }
    };
    loadDefault();
  }, []);

  // Persist config to localStorage
  useEffect(() => {
    if (state.dataset) {
      const toStore = {
        config: {
          ...state.config,
          days: Array.from(state.config.days),
          requiredCourses: Array.from(state.config.requiredCourses),
          facultyAllowlist: Object.fromEntries(
            Array.from(state.config.facultyAllowlist).map(([k, v]) => [
              k,
              Array.from(v),
            ]),
          ),
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    }
  }, [state.config, state.dataset]);

  const handleGenerate = () => {
    if (!state.dataset || state.config.requiredCourses.size === 0) return;

    const { routines, diagnostics } = generate(state.dataset, state.config);

    const relaxations =
      routines.length < state.config.topK
        ? computeRelaxations(state.dataset, state.config, routines.length)
        : [];

    const nearMiss =
      state.config.windowMode === "hard" && routines.length < state.config.topK
        ? computeNearMiss(state.dataset, state.config)
        : [];

    const swaps = new Map<string, ReturnType<typeof compute1SwapSuggestions>>();
    for (const routine of routines.slice(0, 10)) {
      const suggestions = compute1SwapSuggestions(
        routine,
        state.dataset,
        state.config,
      );
      if (suggestions.length > 0) {
        swaps.set(routine.id, suggestions);
      }
    }

    setState((prev) => ({
      ...prev,
      report: {
        exact: routines,
        diagnostics,
        relaxations,
        nearMiss,
        swaps,
      },
      showCount: 10,
    }));
  };

  const handleReset = () => {
    setState((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        days: new Set(DAY_ORDER.slice(0, 6)),
        window: { start: 10 * 60, end: 16 * 60 + 20 },
        windowMode: "hard",
        requiredCourses: new Set(),
        facultyAllowlist: new Map(),
      },
      report: null,
    }));
  };

  const handleDatasetChange = (ds: Dataset) => {
    setState((prev) => ({
      ...prev,
      dataset: ds,
      config: {
        ...prev.config,
        requiredCourses: new Set(),
        facultyAllowlist: new Map(),
      },
      report: null,
    }));
  };

  const canGenerate =
    state.dataset !== null && state.config.requiredCourses.size > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b bg-white dark:bg-gray-800 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          SEU Routine Generator
        </h1>
        {state.dataset && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {state.dataset.meta.counts.sections} sections ·{" "}
            {state.dataset.meta.counts.meetings} meetings
            {state.dataset.meta.warnings.filter((w) => w.type === "duplicate")
              .length > 0 &&
              ` · ${state.dataset.meta.warnings
                .filter((w) => w.type === "duplicate")
                .reduce((sum, w) => {
                  const match = w.message.match(/(\d+) duplicate/);
                  return sum + (match ? parseInt(match[1], 10) : 0);
                }, 0)} duplicates removed`}
          </p>
        )}
      </header>

      <div className="mx-auto max-w-7xl p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <DatasetPanel
              dataset={state.dataset}
              onDatasetChange={handleDatasetChange}
            />
            <ConditionsPanel
              dataset={state.dataset}
              config={state.config}
              onConfigChange={(newConfig) =>
                setState((prev) => ({ ...prev, config: newConfig }))
              }
              onGenerate={handleGenerate}
              onReset={handleReset}
              canGenerate={canGenerate}
            />
          </div>

          <div className="lg:col-span-3">
            {!state.dataset && (
              <div className="text-center py-12 text-gray-500">
                Loading dataset...
              </div>
            )}
            {state.dataset && state.config.requiredCourses.size === 0 && (
              <div className="text-center py-12 text-gray-500">
                Select at least one required course to generate routines
              </div>
            )}
            {state.report && (
              <div className="space-y-6">
                {state.report.exact.length === 0 &&
                  state.report.diagnostics.length > 0 && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                        No routines found
                      </h3>
                      {state.report.diagnostics.map((d) => (
                        <div
                          key={d.courseCode}
                          className="text-sm text-yellow-800 dark:text-yellow-300 mb-2"
                        >
                          <strong>{d.courseCode}:</strong> {d.reason}
                          {d.closestAlternatives.length > 0 && (
                            <div className="ml-4 mt-1">
                              Closest:{" "}
                              {d.closestAlternatives
                                .map((a) => `${a.sectionId} (${a.issue})`)
                                .join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                {state.report.relaxations.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                      Suggestions to unlock more routines
                    </h3>
                    {state.report.relaxations.map((r, i) => (
                      <div
                        key={i}
                        className="text-sm text-blue-800 dark:text-blue-300"
                      >
                        • {r.description} → +{r.count} routines
                      </div>
                    ))}
                  </div>
                )}

                {state.report.nearMiss.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <h3 className="font-semibold text-amber-900 dark:text-amber-200 mb-2">
                      Almost fits — needs one change
                    </h3>
                    {state.report.nearMiss.slice(0, 5).map((nm) => (
                      <div
                        key={nm.routine.id}
                        className="text-sm text-amber-800 dark:text-amber-300 mb-2"
                      >
                        {nm.violatingCourse} violates window by{" "}
                        {nm.minutesOutside} min. Fixes:{" "}
                        {nm.fixes.map((f) => f.sectionId).join(", ")}
                      </div>
                    ))}
                  </div>
                )}

                {state.report.exact.length > 0 && (
                  <>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Found {state.report.exact.length} routine
                      {state.report.exact.length !== 1 ? "s" : ""} · Showing{" "}
                      {Math.min(state.showCount, state.report.exact.length)}
                    </div>
                    <div className="space-y-4">
                      {state.report.exact
                        .slice(0, state.showCount)
                        .map((routine) => (
                          <RoutineCard
                            key={routine.id}
                            routine={routine}
                            config={state.config}
                            dataset={state.dataset!}
                            suggestions={state.report!.swaps.get(routine.id)}
                          />
                        ))}
                    </div>
                    {state.showCount < state.report.exact.length && (
                      <button
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            showCount: prev.showCount + 10, // load 10 more at a time
                          }))
                        }
                        className="w-full py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                      >
                        Show more
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
