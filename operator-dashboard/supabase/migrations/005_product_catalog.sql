CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  sort_order INT DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_operator_name_unique
ON product_categories (operator_id, name);

CREATE INDEX IF NOT EXISTS product_categories_operator_sort_idx
ON product_categories (operator_id, sort_order, name);

ALTER TABLE products
DROP CONSTRAINT IF EXISTS products_category_id_fkey;

ALTER TABLE products
ADD CONSTRAINT products_category_id_fkey
FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS machine_product_prices (
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL CHECK (price > 0),
  PRIMARY KEY (machine_id, product_id)
);

CREATE INDEX IF NOT EXISTS machine_product_prices_product_idx
ON machine_product_prices (product_id);

INSERT INTO product_categories (operator_id, name, color, sort_order)
SELECT
  o.id AS operator_id,
  seed.name,
  '#6B7280' AS color,
  seed.sort_order
FROM operators o
CROSS JOIN (
  VALUES
    ('Snacks', 1),
    ('Drinks', 2),
    ('Fresh Food', 3),
    ('Frozen', 4),
    ('Health & Wellness', 5),
    ('Other', 6)
) AS seed(name, sort_order)
ON CONFLICT (operator_id, name) DO NOTHING;

CREATE OR REPLACE FUNCTION handle_new_operator_product_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO product_categories (operator_id, name, color, sort_order)
  VALUES
    (NEW.id, 'Snacks', '#6B7280', 1),
    (NEW.id, 'Drinks', '#6B7280', 2),
    (NEW.id, 'Fresh Food', '#6B7280', 3),
    (NEW.id, 'Frozen', '#6B7280', 4),
    (NEW.id, 'Health & Wellness', '#6B7280', 5),
    (NEW.id, 'Other', '#6B7280', 6)
  ON CONFLICT (operator_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_operator_created_seed_categories ON operators;

CREATE TRIGGER on_operator_created_seed_categories
AFTER INSERT ON operators
FOR EACH ROW
EXECUTE FUNCTION handle_new_operator_product_categories();
