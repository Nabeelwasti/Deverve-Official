-- CNIC evidence is permanent business evidence. Prevent accidental deletion
-- or mutation through application SQL, including parent-row cascade deletion.
CREATE TRIGGER IF NOT EXISTS trg_rental_documents_no_delete
BEFORE DELETE ON rental_documents
BEGIN
  SELECT RAISE(ABORT, 'Permanent CNIC evidence cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_rental_documents_no_update
BEFORE UPDATE OF rental_request_id, document_side, object_key, mime_type, byte_size
ON rental_documents
BEGIN
  SELECT RAISE(ABORT, 'Permanent CNIC evidence metadata is immutable');
END;
