-- Publish a starter CMS homepage only when the site has no existing homepage.
-- The static storefront remains the fallback if an owner account is not present.
INSERT INTO site_pages
  (id,slug,title,page_type,status,seo_title,seo_description,created_by,updated_by,published_at,updated_at)
SELECT
  '9c9b5f32-8d0c-4e6e-8b7a-000000000041',
  'home',
  'Fashion, wholesale & vehicle rentals.',
  'home',
  'published',
  'De VERVE | Fashion, Wholesale & Vehicle Rentals in Jhelum',
  'Explore garments for all ages, wholesale enquiries and vehicle rentals from De VERVE in Jhelum, Pakistan. Browse current styles and contact our team.',
  (SELECT id FROM admin_users WHERE role='owner' AND is_active=1 ORDER BY created_at ASC LIMIT 1),
  (SELECT id FROM admin_users WHERE role='owner' AND is_active=1 ORDER BY created_at ASC LIMIT 1),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM site_pages WHERE slug='home')
  AND EXISTS (SELECT 1 FROM admin_users WHERE role='owner' AND is_active=1);

INSERT INTO site_page_sections (id,page_id,section_type,position,content_json,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000042','9c9b5f32-8d0c-4e6e-8b7a-000000000041','hero',0,
'{"eyebrow":"DE VERVE · JHELUM","heading":"Style that moves with you.","body":"Explore thoughtfully selected garments for every age, connect with us for wholesale enquiries, or ask about vehicle rentals in Jhelum.","image_url":"/media/793fae1f-d9a2-45b6-90a2-ded785964b4a","image_alt":"De VERVE fashion collection","button_text":"Explore fashion","button_href":"/?screen=fashion"}',1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041')
  AND NOT EXISTS (SELECT 1 FROM site_page_sections WHERE page_id='9c9b5f32-8d0c-4e6e-8b7a-000000000041');

INSERT INTO site_page_sections (id,page_id,section_type,position,content_json,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000043','9c9b5f32-8d0c-4e6e-8b7a-000000000041','category_grid',1,
'{"eyebrow":"FIND YOUR FIT","heading":"Explore the collection.","body":"Browse the styles currently listed in our catalogue. Check each product for available sizes, colours and stock.","categories":"Sweat Shirt\\nhoodie\\nTrouser"}',1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041');

INSERT INTO site_page_sections (id,page_id,section_type,position,content_json,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000044','9c9b5f32-8d0c-4e6e-8b7a-000000000041','product_collection',2,
'{"eyebrow":"CURRENT CATALOGUE","heading":"Selected arrivals.","body":"A preview of products currently listed by De VERVE. Final availability and pricing are confirmed at checkout.","limit":"8"}',1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041');

INSERT INTO site_page_sections (id,page_id,section_type,position,content_json,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000045','9c9b5f32-8d0c-4e6e-8b7a-000000000041','promo_banner',3,
'{"eyebrow":"RETAIL & WHOLESALE","heading":"Buying for your store or business?","body":"Share the styles, sizes, quantities and destination with our team. We will confirm current stock and the applicable wholesale pricing before you place an order.","button_text":"Ask about wholesale","button_href":"/?screen=wholesale"}',1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041');

INSERT INTO site_page_sections (id,page_id,section_type,position,content_json,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000046','9c9b5f32-8d0c-4e6e-8b7a-000000000041','image_text',4,
'{"eyebrow":"VEHICLE RENTALS","heading":"Make the journey easier.","body":"Tell us your travel dates and vehicle requirements. Our team will confirm availability, rental terms and pricing before your booking is final.","image_url":"/media/d46fcb7c-d3d3-489c-9e50-92cb1bd66d5c","image_alt":"De VERVE vehicle rental service","button_text":"Explore rentals","button_href":"/?screen=mobility"}',1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041');

INSERT INTO site_page_sections (id,page_id,section_type,position,content_json,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000047','9c9b5f32-8d0c-4e6e-8b7a-000000000041','contact_cta',5,
'{"eyebrow":"WE ARE HERE TO HELP","heading":"Let’s find what you need.","body":"For product availability, wholesale enquiries or vehicle rentals, contact the De VERVE team in Jhelum. We will help you with the next step.","button_text":"Contact De VERVE","button_href":"/?screen=contact"}',1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041');

INSERT INTO site_page_sections (id,page_id,section_type,position,content_json,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000048','9c9b5f32-8d0c-4e6e-8b7a-000000000041','faq',6,
'{"eyebrow":"GOOD TO KNOW","heading":"A few helpful answers.","faqs":"How do I check a size or colour? | Open the product page or contact our team to confirm the latest variant availability.\\nCan I place a wholesale enquiry? | Yes. Share the styles, quantities and delivery destination through the wholesale page; our team will confirm pricing and stock.\\nHow do vehicle rentals work? | Send your dates and requirements. Availability, rental terms and pricing are confirmed by the team before the booking is final.\\nWhich payment methods are available? | The checkout page displays the payment methods currently enabled for your order."}',1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041');

INSERT INTO site_navigation_items (id,label,href,position,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000051','Home','/',0,1
WHERE NOT EXISTS (SELECT 1 FROM site_navigation_items);
INSERT INTO site_navigation_items (id,label,href,position,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000052','Fashion','/?screen=fashion',1,1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041')
  AND NOT EXISTS (SELECT 1 FROM site_navigation_items WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000052');
INSERT INTO site_navigation_items (id,label,href,position,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000053','Wholesale','/?screen=wholesale',2,1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041')
  AND NOT EXISTS (SELECT 1 FROM site_navigation_items WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000053');
INSERT INTO site_navigation_items (id,label,href,position,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000054','Rentals','/?screen=mobility',3,1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041')
  AND NOT EXISTS (SELECT 1 FROM site_navigation_items WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000054');
INSERT INTO site_navigation_items (id,label,href,position,is_visible)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000055','Contact','/?screen=contact',4,1
WHERE EXISTS (SELECT 1 FROM site_pages WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041')
  AND NOT EXISTS (SELECT 1 FROM site_navigation_items WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000055');

INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json)
SELECT '9c9b5f32-8d0c-4e6e-8b7a-000000000059',created_by,'website.homepage_seeded','page',id,
'{"source":"migration_0041","status":"published","sections":7,"navigation_items":5}'
FROM site_pages
WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000041'
  AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE id='9c9b5f32-8d0c-4e6e-8b7a-000000000059');
