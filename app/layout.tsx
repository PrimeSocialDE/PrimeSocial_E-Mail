import type { Metadata } from "next";
import "@/app/globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "PrimeSocial | E-Mail Outreach",
  description: "Cold E-Mail Outreach Dashboard für PrimeSocial",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
