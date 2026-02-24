INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', true, 5242880, ARRAY['image/*']),
  ('cabinet-photos', 'cabinet-photos', false, 20971520, ARRAY['image/*'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_images_public_read ON storage.objects;
DROP POLICY IF EXISTS product_images_insert ON storage.objects;
DROP POLICY IF EXISTS product_images_update ON storage.objects;
DROP POLICY IF EXISTS product_images_delete ON storage.objects;
DROP POLICY IF EXISTS cabinet_photos_read ON storage.objects;
DROP POLICY IF EXISTS cabinet_photos_insert ON storage.objects;
DROP POLICY IF EXISTS cabinet_photos_update ON storage.objects;
DROP POLICY IF EXISTS cabinet_photos_delete ON storage.objects;

CREATE POLICY product_images_public_read
ON storage.objects
FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY product_images_insert
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'product-images'
  AND split_part(name, '/', 1) = public.get_operator_id()::text
);

CREATE POLICY product_images_update
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'product-images'
  AND split_part(name, '/', 1) = public.get_operator_id()::text
)
WITH CHECK (
  bucket_id = 'product-images'
  AND split_part(name, '/', 1) = public.get_operator_id()::text
);

CREATE POLICY product_images_delete
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'product-images'
  AND split_part(name, '/', 1) = public.get_operator_id()::text
);

CREATE POLICY cabinet_photos_read
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'cabinet-photos'
  AND split_part(name, '/', 1) = public.get_operator_id()::text
);

CREATE POLICY cabinet_photos_insert
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'cabinet-photos'
  AND split_part(name, '/', 1) = public.get_operator_id()::text
);

CREATE POLICY cabinet_photos_update
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'cabinet-photos'
  AND split_part(name, '/', 1) = public.get_operator_id()::text
)
WITH CHECK (
  bucket_id = 'cabinet-photos'
  AND split_part(name, '/', 1) = public.get_operator_id()::text
);

CREATE POLICY cabinet_photos_delete
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'cabinet-photos'
  AND split_part(name, '/', 1) = public.get_operator_id()::text
);
DO $$
BEGIN
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN insufficient_privilege THEN
    -- In local/dev, storage.objects can be owned by a managed role.
    -- RLS is already enabled by default; skip if we cannot alter ownership-level settings.
    NULL;
END $$;
