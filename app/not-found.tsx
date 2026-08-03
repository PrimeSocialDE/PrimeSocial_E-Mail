import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h2 className="text-4xl font-bold text-gray-900 mb-2">404</h2>
      <p className="text-gray-500 mb-6">Diese Seite oder dieser Lead existiert nicht.</p>
      <Link
        href="/dashboard"
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        Zurück zum Dashboard
      </Link>
    </div>
  );
}
