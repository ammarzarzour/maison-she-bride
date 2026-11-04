# Maison She Bride — Backend foundation

This folder contains a **database schema draft**, not a connected production backend.

## What it models
- Seller stores with pending/approved/suspended status.
- Product categories and inventory.
- Bilingual products and USD reference pricing.
- Orders with fixed currency and exchange rate captured on order creation.
- Order line items.

## Deployment prerequisites
1. Create a controlled Supabase project (PostgreSQL + Auth).
2. Review `schema.sql` with an engineer, especially RLS and seller permissions.
3. Apply schema in a development project, then run authorization and inventory tests.
4. Implement trusted server endpoints for checkout, price/rate validation, stock reservations and payment reconciliation.
5. Only then connect the storefront to public product reads and authenticated seller actions.

**Security:** Never put a Supabase service-role key in GitHub Pages or client JavaScript. The existing `admin.html` is a public, local-only prototype and must not be used to store real personal information. No payment or order-processing service is live.

**Currency:** SYP means the new Syrian pound. Conversion rates in the demo are placeholders, not real rates.
