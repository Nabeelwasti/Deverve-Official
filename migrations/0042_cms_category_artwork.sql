-- Add category-specific artwork to the published CMS homepage using verified ready media.
-- Store media IDs, not public URLs, so the public media resolver can enforce page references.
UPDATE site_page_sections
SET content_json = json_set(
  content_json,
  '$.category_images',
  json('{"Sweat Shirt":"793fae1f-d9a2-45b6-90a2-ded785964b4a","hoodie":"98e4595d-7a79-4bd7-bfe6-08dc211a3673","Trouser":"0c6f6c8b-2680-434b-bc60-d58b04f5cff7"}')
)
WHERE page_id='9c9b5f32-8d0c-4e6e-8b7a-000000000041'
  AND section_type='category_grid';
