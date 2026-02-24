CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'starter',
  settings JSONB DEFAULT '{}'::jsonb,
  branding JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES operators(id),
  full_name TEXT,
  role TEXT CHECK (role IN ('admin', 'manager', 'driver', 'viewer')) DEFAULT 'viewer',
  assigned_machine_ids UUID[] DEFAULT '{}'::uuid[],
  preferred_language TEXT DEFAULT 'en',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) NOT NULL,
  name TEXT NOT NULL,
  mid TEXT UNIQUE NOT NULL,
  type TEXT CHECK (type IN ('fridge', 'pantry', 'freezer')) NOT NULL,
  location_name TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT DEFAULT 'offline',
  temperature NUMERIC(5,2),
  last_seen_at TIMESTAMPTZ,
  api_key TEXT UNIQUE,
  settings JSONB DEFAULT '{"preAuthAmount":10,"taxRate":0,"tempThreshold":42,"autoLockdown":false}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  category_id UUID,
  description TEXT,
  base_price NUMERIC(10,2) NOT NULL,
  photo_url TEXT,
  nutritional JSONB DEFAULT '{}'::jsonb,
  allergens TEXT[] DEFAULT '{}'::text[],
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfid_items (
  epc TEXT PRIMARY KEY,
  operator_id UUID REFERENCES operators(id) NOT NULL,
  product_id UUID REFERENCES products(id),
  machine_id UUID REFERENCES machines(id),
  status TEXT CHECK (status IN ('available', 'in_machine', 'sold', 'discarded', 'lost')) DEFAULT 'available',
  expiration_date DATE,
  restocked_at TIMESTAMPTZ,
  restocked_by UUID REFERENCES auth.users(id),
  sold_at TIMESTAMPTZ,
  current_discount NUMERIC(5,2) DEFAULT 0,
  tag_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) NOT NULL,
  machine_id UUID REFERENCES machines(id),
  stripe_charge_id TEXT,
  amount NUMERIC(10,2),
  tax_amount NUMERIC(10,2) DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  items JSONB DEFAULT '[]'::jsonb,
  customer_phone TEXT,
  customer_email TEXT,
  is_offline_sync BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) NOT NULL,
  machine_id UUID REFERENCES machines(id),
  type TEXT NOT NULL,
  severity TEXT DEFAULT 'warning',
  message TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_operator_id_idx ON profiles(operator_id);
CREATE INDEX IF NOT EXISTS machines_operator_status_idx ON machines(operator_id, status);
CREATE INDEX IF NOT EXISTS products_operator_status_idx ON products(operator_id, status);
CREATE INDEX IF NOT EXISTS rfid_items_operator_machine_status_idx ON rfid_items(operator_id, machine_id, status);
CREATE INDEX IF NOT EXISTS transactions_operator_created_at_idx ON transactions(operator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_operator_created_at_idx ON alerts(operator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_operator_created_at_idx ON audit_log(operator_id, created_at DESC);
