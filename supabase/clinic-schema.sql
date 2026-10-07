-- Server-side access only. Browser users use the clinic APIs and never receive
-- the database secret or the raw clinical records through the Data API.
CREATE SCHEMA IF NOT EXISTS linguar_private;
REVOKE ALL ON SCHEMA linguar_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA linguar_private TO service_role;

CREATE TABLE public.clinics(id text PRIMARY KEY, owner text NOT NULL, name text NOT NULL, created text NOT NULL);
CREATE TABLE public.memberships(id text PRIMARY KEY, clinic text NOT NULL REFERENCES public.clinics(id), email text NOT NULL UNIQUE CHECK(email=lower(email)), therapist text NOT NULL, enabled integer NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)));
CREATE TABLE public.records(id text PRIMARY KEY, clinic text NOT NULL REFERENCES public.clinics(id), kind text NOT NULL, data text NOT NULL CHECK(jsonb_typeof(data::jsonb)='object'), author text NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0), updated text NOT NULL);
CREATE TABLE public.audit(id text PRIMARY KEY, clinic text NOT NULL REFERENCES public.clinics(id), actor text NOT NULL, action text NOT NULL, record_id text NOT NULL, created text NOT NULL);
CREATE TABLE public.family_access(id text PRIMARY KEY, clinic text NOT NULL REFERENCES public.clinics(id), patient_id text NOT NULL, email text NOT NULL CHECK(email=lower(email)), enabled integer NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)), created text NOT NULL, UNIQUE(clinic,patient_id,email));
CREATE INDEX records_clinic_kind ON public.records(clinic,kind);
CREATE INDEX records_clinic_updated ON public.records(clinic,updated DESC);
CREATE INDEX records_clinical_patient ON public.records(clinic,(data::jsonb->>'patientId'));
CREATE INDEX records_appointments_date ON public.records(clinic,(data::jsonb->>'date')) WHERE kind IN('appointment','attendance','equipmentReservation');
CREATE INDEX audit_clinic ON public.audit(clinic);
CREATE INDEX memberships_clinic ON public.memberships(clinic);
CREATE INDEX family_access_email ON public.family_access(email);
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_clinics ON public.clinics TO service_role USING(true) WITH CHECK(true);
CREATE POLICY server_memberships ON public.memberships TO service_role USING(true) WITH CHECK(true);
CREATE POLICY server_records ON public.records TO service_role USING(true) WITH CHECK(true);
CREATE POLICY server_audit ON public.audit TO service_role USING(true) WITH CHECK(true);
CREATE POLICY server_family_access ON public.family_access TO service_role USING(true) WITH CHECK(true);
REVOKE ALL ON public.clinics,public.memberships,public.records,public.audit,public.family_access FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.clinics,public.memberships,public.records,public.audit,public.family_access TO service_role;

CREATE TABLE linguar_private.query_catalog(id text PRIMARY KEY, query_text text NOT NULL, arity integer NOT NULL CHECK(arity>=0), read_only boolean NOT NULL);
ALTER TABLE linguar_private.query_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_query_catalog ON linguar_private.query_catalog FOR SELECT TO service_role USING(true);
REVOKE ALL ON linguar_private.query_catalog FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON linguar_private.query_catalog TO service_role;

CREATE FUNCTION linguar_private.json_set(source text, VARIADIC pairs text[]) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE result jsonb:=source::jsonb; i integer;
BEGIN
 IF cardinality(pairs)%2<>0 THEN RAISE EXCEPTION 'Invalid JSON update'; END IF;
 FOR i IN 1..cardinality(pairs) BY 2 LOOP
  result:=jsonb_set(result,string_to_array(substr(pairs[i],3),'.'),coalesce(to_jsonb(pairs[i+1]),'null'::jsonb),true);
 END LOOP;
 RETURN result::text;
END $$;
REVOKE ALL ON FUNCTION linguar_private.json_set(text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION linguar_private.json_set(text,text[]) TO service_role;

-- One RPC is one transaction. Only immutable, source-controlled query IDs are
-- accepted. Parameters use PostgreSQL's literal quoting; SQL is never received.
CREATE FUNCTION public.linguar_batch(operations jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE op jsonb; statement linguar_private.query_catalog%ROWTYPE;
 arguments text[]; rows jsonb; affected bigint; answer jsonb:='[]'::jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Server access only' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(operations)<>'array' OR jsonb_array_length(operations)>100 OR octet_length(operations::text)>2000000 THEN RAISE EXCEPTION 'Invalid operation batch'; END IF;
 -- Serialize writes across this clinic app. This also protects check-in counts,
 -- resource conflicts and consent/version guards from concurrent requests.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(operations) o LEFT JOIN linguar_private.query_catalog q ON q.id=o->>'id' WHERE q.read_only IS NOT TRUE) THEN PERFORM pg_advisory_xact_lock(1641873401); END IF;
 FOR op IN SELECT value FROM jsonb_array_elements(operations) LOOP
  SELECT * INTO statement FROM linguar_private.query_catalog WHERE id=op->>'id';
  IF NOT FOUND OR jsonb_typeof(op->'args')<>'array' OR jsonb_array_length(op->'args')<>statement.arity THEN RAISE EXCEPTION 'Unknown operation or invalid parameters'; END IF;
  SELECT coalesce(array_agg(value #>> '{}' ORDER BY ordinality),ARRAY[]::text[]) INTO arguments FROM jsonb_array_elements(op->'args') WITH ORDINALITY;
  IF statement.read_only THEN
   EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) FROM ('||format(statement.query_text,VARIADIC arguments)||') r' INTO rows;affected:=0;
  ELSE
   EXECUTE format(statement.query_text,VARIADIC arguments);GET DIAGNOSTICS affected=ROW_COUNT;rows:='[]'::jsonb;
  END IF;
  answer:=answer||jsonb_build_array(jsonb_build_object('results',rows,'meta',jsonb_build_object('changes',affected)));
 END LOOP;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.linguar_batch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.linguar_batch(jsonb) TO service_role;
-- A verified auth user must still have an active Supabase session. Revoked
-- sessions cannot continue reading clinical data with an unexpired JWT.
GRANT SELECT(id,user_id,not_after) ON auth.sessions TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('linguar-clinical','linguar-clinical',false,10485760,ARRAY['application/pdf','image/png','image/jpeg','image/webp','audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'])
ON CONFLICT(id) DO NOTHING;
