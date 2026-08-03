"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { SEGMENT_LABELS, SEGMENT_DOT_COLORS, SEGMENTS } from "@/types";
import { createAuthClient } from "@/lib/supabase-auth";

// Icons als reine SVG-Pfade, damit das Markup schlank bleibt.
const ICONS = {
  dashboard:  "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  automation: "M13 10V3L4 14h7v7l9-11h-7z",
  analytics:  "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  search:     "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  segments:   "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  newsletter: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  manuell:    "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  write:      "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
  templates:  "M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2",
  link:       "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
  contacts:   "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  research:   "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  database:   "M4 7v10c0 1.105 3.582 2 8 2s8-.895 8-2V7M4 7c0 1.105 3.582 2 8 2s8-.895 8-2M4 7c0-1.105 3.582-2 8-2s8 .895 8 2m0 5c0 1.105-3.582 2-8 2s-8-.895-8-2",
  signal:     "M8.111 16.404a5.5 5.5 0 010-7.778m7.778 0a5.5 5.5 0 010 7.778M12 12h.01M5.284 19.23a9.5 9.5 0 010-13.435m13.432 0a9.5 9.5 0 010 13.435",
  queue:      "M4 6h16M4 10h16M4 14h10M4 18h10",
  settings:   "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

// Untermenü-Einträge der Automation- und Manuell-Gruppen
const AUTOMATION_LINKS = [
  { href: "/analytics", label: "Analytics",  icon: ICONS.analytics },
  { href: "/search",    label: "Lead-Suche", icon: ICONS.search },
];
const MANUELL_LINKS = [
  { href: "/manuell/schreiben",   label: "Schreiben",            icon: ICONS.write },
  { href: "/manuell/templates",   label: "Templates",            icon: ICONS.templates },
  { href: "/manuell/drive-links", label: "Drive-Links",          icon: ICONS.link },
  { href: "/manuell/kontakte",    label: "Kontakte & Analytics", icon: ICONS.contacts },
];
const RECHERCHE_LINKS = [
  { href: "/recherche",               label: "Suche",         icon: ICONS.search },
  { href: "/recherche/leads",         label: "Leads",         icon: ICONS.contacts },
  { href: "/recherche/einstellungen", label: "Einstellungen", icon: ICONS.settings },
];
const STELLENSIGNALE_LINKS = [
  { href: "/stellensignale",              label: "Signale",       icon: ICONS.signal },
  { href: "/stellensignale/entwuerfe",    label: "Entwürfe",      icon: ICONS.newsletter },
  { href: "/stellensignale/versand",      label: "Versand",       icon: ICONS.queue },
  { href: "/stellensignale/firmen",       label: "Zielfirmen",    icon: ICONS.contacts },
  { href: "/stellensignale/einstellungen", label: "Einstellungen", icon: ICONS.settings },
];

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className ?? "w-4 h-4 flex-shrink-0"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

// Top-Level-Link (Dashboard, Newsletter)
function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link href={href}
      className={clsx(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
        active ? "bg-brand-500/15 text-brand-400" : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
      )}>
      <Icon d={icon} />
      {label}
    </Link>
  );
}

// Untermenü-Link (eine Ebene eingerückt)
function SubLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link href={href}
      className={clsx(
        "flex items-center gap-2 px-2 py-2 rounded-md text-xs font-medium transition-all",
        active ? "text-brand-400 bg-brand-500/10" : "text-gray-600 hover:text-gray-300 hover:bg-white/5"
      )}>
      <Icon d={icon} className="w-3.5 h-3.5 flex-shrink-0" />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  const inAutomation = ["/analytics", "/search", "/segments"].some((p) => pathname.startsWith(p));
  const inManuell    = pathname.startsWith("/manuell");
  const inRecherche  = pathname.startsWith("/recherche");
  const inStellensignale = pathname.startsWith("/stellensignale");

  const [automationOpen, setAutomationOpen] = useState(inAutomation);
  const [segmentsOpen, setSegmentsOpen]     = useState(pathname.startsWith("/segments"));
  const [manuellOpen, setManuellOpen]       = useState(inManuell);
  const [rechercheOpen, setRechercheOpen]   = useState(inRecherche);
  const [stellensignaleOpen, setStellensignaleOpen] = useState(inStellensignale);

  return (
    <aside className="fixed left-0 top-0 h-screen w-52 bg-dark-950 border-r border-white/5 flex flex-col z-30">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-dark-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="text-white font-heading font-bold text-sm leading-tight">PrimeSocial</div>
            <div className="text-gray-600 text-xs">Outreach</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {/* Dashboard */}
        <NavLink href="/" label="Dashboard" icon={ICONS.dashboard} active={pathname === "/"} />

        {/* Automation — aufklappbares Menü mit bestehenden Seiten */}
        <div>
          <button
            onClick={() => setAutomationOpen(!automationOpen)}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              inAutomation ? "bg-brand-500/15 text-brand-400" : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
            )}>
            <Icon d={ICONS.automation} />
            <span className="flex-1 text-left">Automation</span>
            <svg className={clsx("w-3 h-3 transition-transform", automationOpen && "rotate-180")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {automationOpen && (
            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/[0.07] pl-3">
              {AUTOMATION_LINKS.map((item) => (
                <SubLink key={item.href} {...item}
                  active={item.href === "/search" ? pathname.startsWith("/search") : pathname === item.href} />
              ))}

              {/* Segmente — verschachteltes Untermenü (Verhalten bleibt wie bisher) */}
              <div>
                <button
                  onClick={() => setSegmentsOpen(!segmentsOpen)}
                  className={clsx(
                    "w-full flex items-center gap-2 px-2 py-2 rounded-md text-xs font-medium transition-all",
                    pathname.startsWith("/segments") ? "text-brand-400 bg-brand-500/10" : "text-gray-600 hover:text-gray-300 hover:bg-white/5"
                  )}>
                  <Icon d={ICONS.segments} className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 text-left">Segmente</span>
                  <svg className={clsx("w-3 h-3 transition-transform", segmentsOpen && "rotate-180")}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {segmentsOpen && (
                  <div className="ml-2 mt-0.5 space-y-0.5 border-l border-white/[0.07] pl-3">
                    {SEGMENTS.map((seg) => {
                      const href = `/segments/${seg.toLowerCase()}`;
                      const isActive = pathname === href;
                      return (
                        <Link key={seg} href={href}
                          className={clsx(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-all",
                            isActive ? "text-brand-400 bg-brand-500/10" : "text-gray-600 hover:text-gray-300 hover:bg-white/5"
                          )}>
                          <div className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", SEGMENT_DOT_COLORS[seg])} />
                          {SEGMENT_LABELS[seg]}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Newsletter — unverändert */}
        <NavLink href="/newsletter" label="Newsletter" icon={ICONS.newsletter} active={pathname.startsWith("/newsletter")} />

        {/* Manuell — aufklappbares Menü (NEU) */}
        <div>
          <button
            onClick={() => setManuellOpen(!manuellOpen)}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              inManuell ? "bg-brand-500/15 text-brand-400" : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
            )}>
            <Icon d={ICONS.manuell} />
            <span className="flex-1 text-left">Manuell</span>
            <svg className={clsx("w-3 h-3 transition-transform", manuellOpen && "rotate-180")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {manuellOpen && (
            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/[0.07] pl-3">
              {MANUELL_LINKS.map((item) => (
                <SubLink key={item.href} {...item} active={pathname === item.href} />
              ))}
            </div>
          )}
        </div>

        {/* Recherche — aufklappbares Menü (Prospect-Researcher) */}
        <div>
          <button
            onClick={() => setRechercheOpen(!rechercheOpen)}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              inRecherche ? "bg-brand-500/15 text-brand-400" : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
            )}>
            <Icon d={ICONS.research} />
            <span className="flex-1 text-left">Recherche</span>
            <svg className={clsx("w-3 h-3 transition-transform", rechercheOpen && "rotate-180")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {rechercheOpen && (
            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/[0.07] pl-3">
              {RECHERCHE_LINKS.map((item) => (
                <SubLink key={item.href} {...item} active={pathname === item.href} />
              ))}
            </div>
          )}
        </div>

        {/* Stellensignale — Trigger-Scraper für Fachkräfte-Mangel (Phase 1: nur Daten) */}
        <div>
          <button
            onClick={() => setStellensignaleOpen(!stellensignaleOpen)}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              inStellensignale ? "bg-brand-500/15 text-brand-400" : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
            )}>
            <Icon d={ICONS.signal} />
            <span className="flex-1 text-left">Stellensignale</span>
            <svg className={clsx("w-3 h-3 transition-transform", stellensignaleOpen && "rotate-180")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {stellensignaleOpen && (
            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/[0.07] pl-3">
              {STELLENSIGNALE_LINKS.map((item) => (
                <SubLink key={item.href} {...item}
                  active={item.href === "/stellensignale" ? pathname === item.href : pathname.startsWith(item.href)} />
              ))}
            </div>
          )}
        </div>

        {/* Datenbank — zentrale Unternehmens-DB (modulübergreifend) */}
        <NavLink href="/datenbank" label="Datenbank" icon={ICONS.database} active={pathname.startsWith("/datenbank")} />
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/5">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-xs text-gray-600">Live</span>
        </div>
        <button
          onClick={async () => {
            const supabase = createAuthClient();
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
          className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
        >
          Abmelden
        </button>
      </div>
    </aside>
  );
}
