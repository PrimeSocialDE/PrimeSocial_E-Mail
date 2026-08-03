"use client";

import { useEffect, useRef } from "react";

const TRACKED_DEPTHS = [25, 50, 75, 100];

function getOrCreateSessionId(slug: string): string {
  const key = `pitch-sid-${slug}`;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(key, sid);
    return sid;
  } catch {
    return `nostorage-${Date.now().toString(36)}`;
  }
}

export function PitchTracker({ slug }: { slug: string }) {
  const reached = useRef<Set<number>>(new Set());
  const started = useRef<number>(Date.now());
  const sentPageView = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sessionId = getOrCreateSessionId(slug);

    const send = (event_type: string, event_data: Record<string, unknown> | null = null) => {
      const payload = JSON.stringify({ session_id: sessionId, event_type, event_data });
      const url = `/api/pitch/${slug}/track`;
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        } else {
          void fetch(url, { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true });
        }
      } catch {
        // ignore
      }
    };

    if (!sentPageView.current) {
      sentPageView.current = true;
      send("page_view", { referrer: document.referrer });
    }

    const onScroll = () => {
      const h = document.documentElement;
      const scrollTop = h.scrollTop || document.body.scrollTop;
      const scrollHeight = h.scrollHeight - h.clientHeight;
      if (scrollHeight <= 0) return;
      const pct = Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
      for (const d of TRACKED_DEPTHS) {
        if (pct >= d && !reached.current.has(d)) {
          reached.current.add(d);
          send("scroll_depth", { depth: d });
        }
      }
    };

    const onBeforeUnload = () => {
      const seconds = Math.round((Date.now() - started.current) / 1000);
      send("time_on_page", { seconds });
    };

    // CTA-Klick-Delegation
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const cta = target?.closest("[data-pitch-cta]");
      if (cta) {
        send("cta_click", { label: cta.getAttribute("data-pitch-cta") });
        return;
      }
      const extLink = target?.closest("a[href^='http']");
      if (extLink) {
        send("link_click", { href: (extLink as HTMLAnchorElement).href });
      }
    };

    // Section-View: IntersectionObserver auf data-pitch-section
    const sectionObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0.5) {
          const name = (e.target as HTMLElement).getAttribute("data-pitch-section");
          if (name) {
            send("section_view", { section: name });
            sectionObserver.unobserve(e.target);
          }
        }
      }
    }, { threshold: [0, 0.5, 1] });

    // Verzögert initialisieren, bis DOM gerendert
    const mountTimer = window.setTimeout(() => {
      document.querySelectorAll<HTMLElement>("[data-pitch-section]").forEach((el) => sectionObserver.observe(el));
    }, 300);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick);

    return () => {
      window.clearTimeout(mountTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick);
      sectionObserver.disconnect();
    };
  }, [slug]);

  return null;
}
