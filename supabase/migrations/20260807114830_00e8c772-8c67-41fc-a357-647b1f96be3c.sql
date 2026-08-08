-- 1. Profiles: own row only
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- 2. Storage: owner-scoped read on private bucket
DROP POLICY IF EXISTS media_public_read ON storage.objects;
DROP POLICY IF EXISTS media_owner_read ON storage.objects;
CREATE POLICY media_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. SECURITY DEFINER role helpers: only answer about the caller
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN current_user = 'service_role' OR _user_id = auth.uid() THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN current_user = 'service_role' OR _user_id = auth.uid() THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','root')
    )
    ELSE false
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;