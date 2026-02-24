CREATE OR REPLACE FUNCTION public.get_operator_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT operator_id FROM public.profiles WHERE id = auth.uid();
$$;

ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operators_operator_isolation_select ON operators;
DROP POLICY IF EXISTS operators_operator_isolation_insert ON operators;
DROP POLICY IF EXISTS operators_operator_isolation_update ON operators;
DROP POLICY IF EXISTS operators_operator_isolation_delete ON operators;

CREATE POLICY operators_operator_isolation_select ON operators
FOR SELECT USING (id = public.get_operator_id());

CREATE POLICY operators_operator_isolation_insert ON operators
FOR INSERT WITH CHECK (id = public.get_operator_id());

CREATE POLICY operators_operator_isolation_update ON operators
FOR UPDATE USING (id = public.get_operator_id()) WITH CHECK (id = public.get_operator_id());

CREATE POLICY operators_operator_isolation_delete ON operators
FOR DELETE USING (id = public.get_operator_id());

DROP POLICY IF EXISTS profiles_self_or_operator_select ON profiles;
DROP POLICY IF EXISTS profiles_self_or_operator_insert ON profiles;
DROP POLICY IF EXISTS profiles_self_or_operator_update ON profiles;
DROP POLICY IF EXISTS profiles_self_or_operator_delete ON profiles;

CREATE POLICY profiles_self_or_operator_select ON profiles
FOR SELECT USING (id = auth.uid() OR operator_id = public.get_operator_id());

CREATE POLICY profiles_self_or_operator_insert ON profiles
FOR INSERT WITH CHECK (id = auth.uid() OR operator_id = public.get_operator_id());

CREATE POLICY profiles_self_or_operator_update ON profiles
FOR UPDATE USING (id = auth.uid() OR operator_id = public.get_operator_id())
WITH CHECK (id = auth.uid() OR operator_id = public.get_operator_id());

CREATE POLICY profiles_self_or_operator_delete ON profiles
FOR DELETE USING (id = auth.uid() OR operator_id = public.get_operator_id());

DROP POLICY IF EXISTS machines_operator_isolation_select ON machines;
DROP POLICY IF EXISTS machines_operator_isolation_insert ON machines;
DROP POLICY IF EXISTS machines_operator_isolation_update ON machines;
DROP POLICY IF EXISTS machines_operator_isolation_delete ON machines;

CREATE POLICY machines_operator_isolation_select ON machines
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY machines_operator_isolation_insert ON machines
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY machines_operator_isolation_update ON machines
FOR UPDATE USING (operator_id = public.get_operator_id()) WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY machines_operator_isolation_delete ON machines
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS products_operator_isolation_select ON products;
DROP POLICY IF EXISTS products_operator_isolation_insert ON products;
DROP POLICY IF EXISTS products_operator_isolation_update ON products;
DROP POLICY IF EXISTS products_operator_isolation_delete ON products;

CREATE POLICY products_operator_isolation_select ON products
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY products_operator_isolation_insert ON products
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY products_operator_isolation_update ON products
FOR UPDATE USING (operator_id = public.get_operator_id()) WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY products_operator_isolation_delete ON products
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS rfid_items_operator_isolation_select ON rfid_items;
DROP POLICY IF EXISTS rfid_items_operator_isolation_insert ON rfid_items;
DROP POLICY IF EXISTS rfid_items_operator_isolation_update ON rfid_items;
DROP POLICY IF EXISTS rfid_items_operator_isolation_delete ON rfid_items;

CREATE POLICY rfid_items_operator_isolation_select ON rfid_items
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY rfid_items_operator_isolation_insert ON rfid_items
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY rfid_items_operator_isolation_update ON rfid_items
FOR UPDATE USING (operator_id = public.get_operator_id()) WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY rfid_items_operator_isolation_delete ON rfid_items
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS transactions_operator_isolation_select ON transactions;
DROP POLICY IF EXISTS transactions_operator_isolation_insert ON transactions;
DROP POLICY IF EXISTS transactions_operator_isolation_update ON transactions;
DROP POLICY IF EXISTS transactions_operator_isolation_delete ON transactions;

CREATE POLICY transactions_operator_isolation_select ON transactions
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY transactions_operator_isolation_insert ON transactions
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY transactions_operator_isolation_update ON transactions
FOR UPDATE USING (operator_id = public.get_operator_id()) WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY transactions_operator_isolation_delete ON transactions
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS alerts_operator_isolation_select ON alerts;
DROP POLICY IF EXISTS alerts_operator_isolation_insert ON alerts;
DROP POLICY IF EXISTS alerts_operator_isolation_update ON alerts;
DROP POLICY IF EXISTS alerts_operator_isolation_delete ON alerts;

CREATE POLICY alerts_operator_isolation_select ON alerts
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY alerts_operator_isolation_insert ON alerts
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY alerts_operator_isolation_update ON alerts
FOR UPDATE USING (operator_id = public.get_operator_id()) WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY alerts_operator_isolation_delete ON alerts
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS audit_log_admin_read ON audit_log;
DROP POLICY IF EXISTS audit_log_operator_insert ON audit_log;
DROP POLICY IF EXISTS audit_log_operator_update ON audit_log;
DROP POLICY IF EXISTS audit_log_operator_delete ON audit_log;

CREATE POLICY audit_log_admin_read ON audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.operator_id = audit_log.operator_id
  )
);

CREATE POLICY audit_log_operator_insert ON audit_log
FOR INSERT
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY audit_log_operator_update ON audit_log
FOR UPDATE
USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY audit_log_operator_delete ON audit_log
FOR DELETE
USING (operator_id = public.get_operator_id());
