-- 052 — CORRECTIF : erreur « permission denied for table users » + fermeture d'accès inutiles
-- ⚠ MODIFIE la base (projet Tafir). Relançable sans risque : on peut l'exécuter plusieurs fois.
-- Supabase > SQL Editor > New query > Run. Si « Success », c'est fini.
--
-- À faire AUSSI : déposer js/stats.js sur GitHub (dossier js). Sans lui, l'annuaire ne chargerait plus les comptables.

BEGIN;

-- 1. Trois règles lisaient la table protégée auth.users : on lit l'e-mail du jeton de connexion à la place.
DROP POLICY IF EXISTS conversations_owner ON public.conversations;
CREATE POLICY conversations_owner ON public.conversations
  FOR ALL
  USING      ((auth.uid() = entreprise_id) OR (comptable_email = (auth.jwt() ->> 'email')::text))
  WITH CHECK ((auth.uid() = entreprise_id) OR (comptable_email = (auth.jwt() ->> 'email')::text));

DROP POLICY IF EXISTS invitations_select_concernes ON public.invitations_comptable;
CREATE POLICY invitations_select_concernes ON public.invitations_comptable
  FOR SELECT
  USING ((auth.uid() = entreprise_id) OR (comptable_email = (auth.jwt() ->> 'email')::text));

DROP POLICY IF EXISTS messages_participant ON public.messages;
CREATE POLICY messages_participant ON public.messages
  FOR ALL
  USING (conversation_id IN (
    SELECT c.id FROM public.conversations c
    WHERE c.entreprise_id = auth.uid() OR c.comptable_email = (auth.jwt() ->> 'email')::text))
  WITH CHECK (conversation_id IN (
    SELECT c.id FROM public.conversations c
    WHERE c.entreprise_id = auth.uid() OR c.comptable_email = (auth.jwt() ->> 'email')::text));

-- 2. Fiches des comptables : lisibles seulement par un utilisateur connecté (plus par n'importe quel visiteur).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profils_comptable' AND policyname='Public find by token') THEN
    ALTER POLICY "Public find by token" ON public.profils_comptable TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profils_comptable' AND policyname='profils_comptable_select_all') THEN
    ALTER POLICY profils_comptable_select_all ON public.profils_comptable TO authenticated;
  END IF;
END $$;

-- 3. Vue non utilisée par l'application : elle montrait les e-mails des créateurs de documents sans contrôle.
DO $$
BEGIN
  IF to_regclass('public.v_documents_avec_createur') IS NOT NULL THEN
    REVOKE ALL ON public.v_documents_avec_createur FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 4. Deux fonctions réservées aux utilisateurs connectés (l'application ne les appelle qu'avec une session).
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('creer_ticket_support', 'enregistrer_parrainage')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

COMMIT;

-- Vérification : relancez le fichier 051 ; la section A doit dire « auth.jwt() » et plus « auth.users ».
