ALTER TABLE enquiries ADD COLUMN contact_type TEXT
  CHECK (contact_type IS NULL OR contact_type IN (
    'retail','wholesale','rental','general','complaint','dmca','legal','business','other'
  ));
CREATE INDEX IF NOT EXISTS idx_enquiries_contact_type_created
  ON enquiries(contact_type, created_at DESC);
