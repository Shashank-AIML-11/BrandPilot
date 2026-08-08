CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN current_user = 'service_role' OR _user_id = auth.uid() THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','root')
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN current_user = 'service_role' OR _user_id = auth.uid() THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS roles_admin_delete ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_update ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_insert ON public.user_roles;
DROP POLICY IF EXISTS roles_select_own_or_admin ON public.user_roles;
DROP POLICY IF EXISTS content_admin_read ON public.content_items;
DROP POLICY IF EXISTS subs_admin_read ON public.subscriptions;

CREATE POLICY roles_admin_delete ON public.user_roles FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY roles_admin_update ON public.user_roles FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY roles_admin_insert ON public.user_roles FOR INSERT TO authenticated WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY roles_select_own_or_admin ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_admin(auth.uid()));
CREATE POLICY content_admin_read ON public.content_items FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY subs_admin_read ON public.subscriptions FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);