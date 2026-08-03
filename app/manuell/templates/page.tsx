import { getTemplates } from "@/lib/manual/db";
import { TemplatesClient } from "@/components/manual/TemplatesClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TemplatesPage() {
  const templates = await getTemplates();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Templates</h1>
        <p className="text-gray-500 text-sm mt-1">Wiederverwendbare Vorlagen — aus Beispielmails generieren, benennen, verwalten</p>
      </div>
      <TemplatesClient initialTemplates={templates} />
    </div>
  );
}
