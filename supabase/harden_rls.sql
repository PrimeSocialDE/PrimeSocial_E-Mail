-- PrimeSocial – RLS-Härtung für ALLE Tabellen
-- ============================================================
-- Sperrt den öffentlichen anon-key komplett aus: RLS wird auf jeder
-- Tabelle aktiviert und die offenen "Allow all for anon"-Policies werden
-- entfernt. Es werden BEWUSST keine neuen Policies angelegt → ohne Policy
-- ist für anon/authenticated alles verboten.
--
-- Die App greift serverseitig mit dem SERVICE-ROLE-KEY zu, der RLS umgeht
-- → die App funktioniert unverändert weiter.
--
-- ⚠️ REIHENFOLGE WICHTIG:
--   1. ZUERST SUPABASE_SERVICE_ROLE_KEY in Vercel (+ .env.local) setzen und
--      deployen. Erst dann nutzt die App den Service-Role-Key.
--   2. DANACH dieses SQL ausführen. Wenn du es vorher ausführst, sperrt sich
--      die App (auf anon) selbst aus.
--
-- Login bleibt funktionsfähig: Supabase-Auth ist von Tabellen-RLS unabhängig.
-- Einmalig im Supabase-SQL-Editor ausführen.
-- ============================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- Automation
    'primesocial_leads', 'emails_sent', 'email_drafts', 'newsletters',
    'newsletter_subscribers', 'prompt_overrides', 'pitch_pages',
    'pitch_page_events', 'reference_requests', 'google_reviews', 'dashboard_todos',
    -- Manuell
    'manual_contacts', 'manual_templates', 'manual_drive_links', 'manual_emails',
    -- Recherche
    'research_runs', 'research_prospects', 'research_excluded_branches'
  ];
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Tabelle existiert?
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      -- RLS aktivieren
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

      -- ALLE bestehenden Policies dieser Tabelle entfernen (auch "Allow all for anon")
      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Kontrolle: sollte für jede Tabelle rowsecurity = true und 0 Policies zeigen.
SELECT c.relname AS tabelle,
       c.relrowsecurity AS rls_an,
       COUNT(p.policyname) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relname = ANY (ARRAY[
    'primesocial_leads','emails_sent','email_drafts','newsletters',
    'newsletter_subscribers','prompt_overrides','pitch_pages','pitch_page_events',
    'reference_requests','google_reviews','dashboard_todos',
    'manual_contacts','manual_templates','manual_drive_links','manual_emails',
    'research_runs','research_prospects','research_excluded_branches'
  ])
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
