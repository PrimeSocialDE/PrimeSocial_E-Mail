"use client";

import { useState } from "react";
import { BRAND_GRADIENT, BRAND_GRADIENT_TEXT } from "@/lib/pitch-constants";

const TEXT_PRIMARY = "#0f1117";
const TEXT_SECONDARY = "#6b7280";

export function ReferencesRequestForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/references/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}
      >
        <h2 className="text-2xl font-bold mb-3">Vielen Dank!</h2>
        <p className="text-base" style={{ color: TEXT_SECONDARY }}>
          Wir rufen dich in den nächsten Werktagen zurück und zeigen dir Referenzen, die zu eurer Situation passen.
        </p>
      </div>
    );
  }

  const inputStyle = {
    background: "#ffffff",
    border: "1px solid #d1d5db",
    color: TEXT_PRIMARY,
  } as const;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl p-6 sm:p-8 space-y-4"
      style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}
    >
      <Field label="Name*">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          type="text"
          autoComplete="name"
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={inputStyle}
        />
      </Field>
      <Field label="Telefonnummer*">
        <input
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={inputStyle}
        />
      </Field>
      {error ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}
        >
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-semibold"
        style={{ background: BRAND_GRADIENT, color: BRAND_GRADIENT_TEXT, opacity: submitting ? 0.6 : 1 }}
      >
        {submitting ? "Senden..." : "Referenzen anfragen"}
      </button>
      <p className="text-xs" style={{ color: TEXT_SECONDARY }}>
        Mit dem Absenden bist du einverstanden, dass wir dich telefonisch zurückrufen. Deine Daten werden nicht an Dritte weitergegeben.
      </p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium mb-1.5 block" style={{ color: TEXT_PRIMARY }}>{label}</span>
      {children}
    </label>
  );
}
