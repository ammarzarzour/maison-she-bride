-- PROPOSAL ONLY. Not a migration and not applied to the hosted database.
-- Requires explicit review before applying any schema/access changes.
-- No public client access is granted. No payments are enabled.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.order_requests (
 buyer_id uuid NOT NULL REFERENCES auth.users(id),
 request_key uuid NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 order_id uuid NOT NULL REFERENCES public.orders(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (buyer_id, request_key),
 UNIQUE (order_id)
);
ALTER TABLE private.order_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.order_requests FROM PUBLIC, anon, authenticated;
COMMIT;
-- Do NOT execute as part of storefront deployment.
-- Before activation, explicitly review private schema exposure, existing schema
-- grants, trusted backend role and required access to products/stores/orders/items.
-- This proposal does not create a role or grant any backend write permissions.
-- Buyer/order consistency is enforced by the trusted order service; other writers
-- must not be granted access to retry mappings without equivalent checks.
