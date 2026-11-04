-- Applied to Supabase project cymwmswpseevemxtugdb on 2026-11-04.
-- Guard against invalid payment status values. This does not activate payments.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded'));

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS products_store_status_idx
  ON public.products(store_id, status);
CREATE INDEX IF NOT EXISTS products_category_status_idx
  ON public.products(category_id, status);
CREATE INDEX IF NOT EXISTS product_images_product_position_idx
  ON public.product_images(product_id, position);
