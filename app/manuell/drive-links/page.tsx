import { getDriveLinks } from "@/lib/manual/db";
import { DriveLinksClient } from "@/components/manual/DriveLinksClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DriveLinksPage() {
  const links = await getDriveLinks();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Drive-Links</h1>
        <p className="text-gray-500 text-sm mt-1">Schnellzugriff auf Referenzordner — Linksammlung (kein Drive-Zugriff)</p>
      </div>
      <DriveLinksClient initialLinks={links} />
    </div>
  );
}
