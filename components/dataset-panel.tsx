"use client"

import { useState } from "react"
import type { Dataset } from "@/lib/types"
import { parseRoutineHTML, parseRoutineJSON } from "@/lib/parse-routine"
import { applyLabPairings } from "@/lib/dataset"

interface Props {
  dataset: Dataset | null
  onDatasetChange: (ds: Dataset) => void
}

export default function DatasetPanel({ dataset, onDatasetChange }: Props) {
  const [error, setError] = useState<string | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      let parsed: Dataset
      if (file.name.endsWith(".json")) {
        parsed = parseRoutineJSON(text)
      } else {
        parsed = parseRoutineHTML(text)
      }
      onDatasetChange(applyLabPairings(parsed))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse error")
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
        Dataset
      </h2>
      {dataset && (
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          <div>{dataset.meta.counts.courses} courses</div>
          <div>{dataset.meta.counts.sections} sections</div>
          <div>{dataset.meta.counts.meetings} meetings</div>
          {dataset.meta.warnings.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-yellow-600 dark:text-yellow-400">
                {dataset.meta.warnings.length} warning(s)
              </summary>
              <ul className="mt-1 ml-4 space-y-1">
                {dataset.meta.warnings.slice(0, 5).map((w, i) => (
                  <li key={i} className="text-xs">
                    {w.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <label className="block">
        <span className="sr-only">Upload routine.html or JSON</span>
        <input
          type="file"
          accept=".html,.json"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500 dark:text-gray-400
            file:mr-4 file:py-2 file:px-4
            file:rounded file:border-0
            file:text-sm file:font-semibold
            file:bg-gray-100 file:text-gray-700
            dark:file:bg-gray-700 dark:file:text-gray-300
            hover:file:bg-gray-200 dark:hover:file:bg-gray-600"
        />
      </label>
      {error && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}
