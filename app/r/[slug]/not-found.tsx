import { BRAND_COLOR } from "@/lib/pitch-constants";

export default function ReferencesNotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#ffffff", color: "#0f1117", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div className="max-w-md text-center px-6">
        <div className="text-sm uppercase tracking-widest mb-3" style={{ color: "#6b7280" }}>
          Prime<span style={{ color: BRAND_COLOR }}>Social</span>
        </div>
        <h1 className="text-3xl font-bold mb-3">Seite nicht verfügbar</h1>
        <p className="text-base" style={{ color: "#6b7280" }}>
          Diese Seite existiert nicht mehr. Falls du auf einen Link aus einer E-Mail geklickt hast, antworte einfach darauf, dann melden wir uns direkt zurück.
        </p>
      </div>
    </div>
  );
}
