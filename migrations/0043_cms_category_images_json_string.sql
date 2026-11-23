-- Store category_images as the JSON string expected by the CMS renderer/editor.
-- This preserves the three verified category-to-media references from migration 0042.
UPDATE site_page_sections
SET content_json = json_set(
  content_json,
  '$.category_images',
  '{"Sweat Shirt":"/media/793fae1f-d9a2-45b6-90a2-ded785964b4a","hoodie":"/media/98e4595d-7a79-4bd7-bfe6-08dc211a3673","Trouser":"/media/0c6f6c8b-2680-434b-bc60-d58b04f5cff7"}'
)
WHERE page_id='9c9b5f32-8d0c-4e6e-8b7a-000000000041'
  AND section_type='category_grid';
