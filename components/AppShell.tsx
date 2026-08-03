"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isPublicPitch = pathname?.startsWith("/p/") ?? false;
  const isReferencesForm = pathname?.startsWith("/r/") ?? false;

  if (isLogin || isPublicPitch || isReferencesForm) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <main className="ml-52 min-h-screen p-8">{children}</main>
    </>
  );
}
