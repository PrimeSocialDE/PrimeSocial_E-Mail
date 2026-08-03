"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { startOfMonth, startOfWeek, addDays, addMonths, isSameDay, isSameMonth, isBefore, startOfDay } from "date-fns";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

// Kalender zum Antippen + Uhrzeit-Auswahl, im Dark/Türkis-Branding.
export function DateTimePicker({ value, onChange }: { value: Date | null; onChange: (d: Date) => void }) {
  const today = startOfDay(new Date());
  const [view, setView] = useState<Date>(startOfMonth(value ?? new Date()));

  const hour = value ? value.getHours() : 9;
  const minute = value ? Math.floor(value.getMinutes() / 15) * 15 : 0;

  const gridStart = startOfWeek(startOfMonth(view), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  function pickDay(day: Date) {
    if (isBefore(day, today)) return;
    const d = new Date(day);
    d.setHours(hour, minute, 0, 0);
    onChange(d);
  }

  function setTime(h: number, m: number) {
    const base = value ? new Date(value) : new Date();
    base.setHours(h, m, 0, 0);
    onChange(base);
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Kalender */}
      <div className="bg-black/20 rounded-xl p-3 border border-white/[0.06] w-fit">
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => setView(addMonths(view, -1))}
            className="w-7 h-7 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="text-sm font-medium text-gray-200">
            {view.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
          </div>
          <button type="button" onClick={() => setView(addMonths(view, 1))}
            className="w-7 h-7 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAYS.map((w) => <div key={w} className="text-[10px] text-gray-600 text-center py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day, i) => {
            const disabled = isBefore(day, today);
            const selected = value ? isSameDay(day, value) : false;
            const outside = !isSameMonth(day, view);
            const isToday = isSameDay(day, today);
            return (
              <button key={i} type="button" disabled={disabled} onClick={() => pickDay(day)}
                className={clsx(
                  "w-9 h-9 rounded-lg text-xs transition-colors",
                  disabled && "text-gray-700 cursor-not-allowed",
                  !disabled && outside && "text-gray-600 hover:bg-white/5",
                  !disabled && !outside && "text-gray-300 hover:bg-white/5",
                  selected && "!bg-brand-300 !text-black font-semibold",
                  !selected && isToday && "ring-1 ring-brand-500/50",
                )}>
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Uhrzeit */}
      <div className="flex sm:flex-col gap-2 sm:gap-1.5 items-center sm:items-start">
        <span className="text-xs text-gray-500">Uhrzeit</span>
        <div className="flex items-center gap-1">
          <select value={hour} onChange={(e) => setTime(parseInt(e.target.value), minute)} className="input !py-1.5 !px-2">
            {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}</option>)}
          </select>
          <span className="text-gray-500">:</span>
          <select value={minute} onChange={(e) => setTime(hour, parseInt(e.target.value))} className="input !py-1.5 !px-2">
            {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
