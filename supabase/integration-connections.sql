CREATE TABLE IF NOT EXISTS public.integration_connections (
 clinic text NOT NULL REFERENCES public.clinics(id),
 user_id text NOT NULL,
 provider text NOT NULL CHECK(provider='google'),
 payload text NOT NULL,
 version integer NOT NULL CHECK(version>0),
 updated text NOT NULL,
 PRIMARY KEY(clinic,user_id,provider)
);
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.integration_connections TO service_role;

DO $policy$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='integration_connections' AND policyname='integration_server_only') THEN CREATE POLICY integration_server_only ON public.integration_connections FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; END $policy$;
