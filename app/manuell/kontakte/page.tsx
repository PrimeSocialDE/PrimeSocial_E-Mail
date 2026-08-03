import { getContacts, getManualEmails } from "@/lib/manual/db";
import { KontakteAnalyticsTabs } from "@/components/manual/KontakteAnalyticsTabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KontaktePage() {
  const [contacts, emails] = await Promise.all([getContacts(), getManualEmails()]);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-white">Kontakte &amp; Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">Manuelle Kontakte und Versand-Analytics — getrennt von der Automation</p>
      </div>
      <KontakteAnalyticsTabs contacts={contacts} emails={emails} />
    </div>
  );
}
