"use client";

import { useEffect, useState } from "react";

interface SubjectRow {
  segment: string;
  step_number: number;
  subject: string;
  sent: number;
  opened: number;
  clicked: number;
  open_rate: number;
  click_rate: number;
}

interface SubjectInsight {
  segment: string;
  step_number: number;
  insights: string;
  sample_size: number;
  avg_open_rate: number;
  top_subjects: string[];
  worst_subjects: string[];
}

interface HeatmapCell {
  day: number;
  hour: number;
  sent: number;
  opened: number;
  open_rate: number;
}

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function rateColor(rate: number): string {
  if (rate > 40) return "text-emerald-400";
  if (rate >= 20) return "text-yellow-400";
  return "text-red-400";
}

function rateBg(rate: number): string {
  if (rate > 40) return "bg-emerald-500/15 text-emerald-400";
  if (rate >= 20) return "bg-yellow-500/15 text-yellow-400";
  return "bg-red-500/15 text-red-400";
}

function heatmapBg(rate: number, hasSent: boolean): string {
  if (!hasSent) return "bg-white/[0.02]";
  if (rate >= 60) return "bg-brand-500/60";
  if (rate >= 45) return "bg-brand-500/40";
  if (rate >= 30) return "bg-brand-500/25";
  if (rate >= 15) return "bg-brand-500/15";
  if (rate > 0) return "bg-brand-500/8";
  return "bg-white/[0.04]";
}

export default function AnalyticsPage() {
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [insights, setInsights] = useState<SubjectInsight[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingTimes, setLoadingTimes] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/subjects")
      .then((r) => r.json())
      .then((data) => {
        setSubjects(data.subjects ?? []);
        setInsights(data.insights ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingSubjects(false));

    fetch("/api/analytics/send-times")
      .then((r) => r.json())
      .then((data) => {
        setHeatmap(data.heatmap ?? []);
        setRecommendation(data.recommendation ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingTimes(false));
  }, []);

  const hours = Array.from({ length: 17 }, (_, i) => i + 5); // 5-21

  // Build heatmap lookup
  const heatmapMap = new Map<string, HeatmapCell>();
  for (const cell of heatmap) {
    heatmapMap.set(`${cell.day}:${cell.hour}`, cell);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">
          Betreffzeilen-Performance und optimale Versandzeiten
        </p>
      </div>

      <div className="space-y-6">
        {/* Section 1: Betreffzeilen-Performance */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="font-semibold text-white">Betreffzeilen-Performance</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              Top 10 Betreffzeilen nach Öffnungsrate
            </p>
          </div>

          <div className="p-5">
            {loadingSubjects ? (
              <p className="text-gray-500 text-sm">Lade...</p>
            ) : subjects.length === 0 ? (
              <p className="text-gray-500 text-sm">
                Noch keine E-Mail-Daten vorhanden. Betreffzeilen-Statistiken erscheinen hier sobald E-Mails gesendet wurden.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="text-left py-3 px-3 font-medium">Segment</th>
                      <th className="text-left py-3 px-3 font-medium">Step</th>
                      <th className="text-left py-3 px-3 font-medium">Betreff</th>
                      <th className="text-right py-3 px-3 font-medium">Gesendet</th>
                      <th className="text-right py-3 px-3 font-medium">Geoffnet</th>
                      <th className="text-right py-3 px-3 font-medium">Geklickt</th>
                      <th className="text-right py-3 px-3 font-medium">Offnungsrate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.slice(0, 10).map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <span className="text-xs font-medium bg-white/5 px-2 py-0.5 rounded text-gray-300">
                            {row.segment}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-gray-400">
                          Step {row.step_number}
                        </td>
                        <td className="py-2.5 px-3 text-gray-200 max-w-xs truncate">
                          {row.subject}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-400">
                          {row.sent}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-400">
                          {row.opened}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-400">
                          {row.clicked}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${rateBg(row.open_rate)}`}
                          >
                            {row.open_rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Insights per segment x step */}
          {insights.length > 0 && (
            <div className="px-5 pb-5">
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                Erkenntnisse pro Segment
              </h3>
              <div className="space-y-3">
                {insights.map((insight, i) => (
                  <div
                    key={i}
                    className="bg-white/[0.03] rounded-lg p-4 border border-white/5"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium bg-brand-500/15 text-brand-400 px-2 py-0.5 rounded">
                        {insight.segment}
                      </span>
                      <span className="text-xs text-gray-500">
                        Step {insight.step_number}
                      </span>
                      <span className="text-xs text-gray-600 ml-auto">
                        {insight.sample_size} Mails &middot;{" "}
                        <span className={rateColor(insight.avg_open_rate)}>
                          {insight.avg_open_rate}% Offnungsrate
                        </span>
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {insight.insights}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Beste Versandzeiten */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="font-semibold text-white">Beste Versandzeiten</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              Offnungsraten nach Wochentag und Uhrzeit
            </p>
          </div>

          <div className="p-5">
            {/* Recommendation banner */}
            {recommendation && (
              <div className="mb-5 bg-brand-500/10 border border-brand-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-brand-400 mb-0.5">
                      Empfehlung
                    </p>
                    <p className="text-sm text-gray-300">{recommendation}</p>
                  </div>
                </div>
              </div>
            )}

            {loadingTimes ? (
              <p className="text-gray-500 text-sm">Lade...</p>
            ) : heatmap.length === 0 ? (
              <p className="text-gray-500 text-sm">
                Noch keine Versanddaten vorhanden. Die Heatmap erscheint sobald E-Mails gesendet wurden.
              </p>
            ) : (
              <div className="overflow-x-auto">
                {/* Heatmap Grid */}
                <div className="min-w-[640px]">
                  {/* Hour header */}
                  <div className="flex items-center gap-0.5 mb-1 pl-10">
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="flex-1 text-center text-[10px] text-gray-600"
                      >
                        {h}
                      </div>
                    ))}
                  </div>

                  {/* Rows per day */}
                  {DAY_LABELS.map((dayLabel, dayIndex) => (
                    <div key={dayIndex} className="flex items-center gap-0.5 mb-0.5">
                      <div className="w-10 text-xs text-gray-500 font-medium text-right pr-2">
                        {dayLabel}
                      </div>
                      {hours.map((h) => {
                        const cell = heatmapMap.get(`${dayIndex}:${h}`);
                        const rate = cell?.open_rate ?? 0;
                        const hasSent = (cell?.sent ?? 0) > 0;
                        return (
                          <div
                            key={h}
                            className={`flex-1 aspect-square rounded-sm ${heatmapBg(rate, hasSent)} flex items-center justify-center cursor-default transition-colors`}
                            title={`${dayLabel} ${h}:00 — ${cell?.sent ?? 0} gesendet, ${rate}% geoffnet`}
                          >
                            {hasSent && (
                              <span className="text-[9px] text-gray-400 font-medium">
                                {rate > 0 ? `${rate}` : ""}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Legend */}
                  <div className="flex items-center gap-3 mt-4 pl-10">
                    <span className="text-[10px] text-gray-600">Wenig</span>
                    <div className="flex gap-0.5">
                      <div className="w-4 h-4 rounded-sm bg-white/[0.04]" />
                      <div className="w-4 h-4 rounded-sm bg-brand-500/8" />
                      <div className="w-4 h-4 rounded-sm bg-brand-500/15" />
                      <div className="w-4 h-4 rounded-sm bg-brand-500/25" />
                      <div className="w-4 h-4 rounded-sm bg-brand-500/40" />
                      <div className="w-4 h-4 rounded-sm bg-brand-500/60" />
                    </div>
                    <span className="text-[10px] text-gray-600">Viel</span>
                    <span className="text-[10px] text-gray-600 ml-4">
                      Zahlen = Offnungsrate in %
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
