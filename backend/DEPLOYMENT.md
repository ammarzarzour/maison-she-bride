# Deployment checklist — Maison She Bride

## Recommended order
1. Provision a Supabase **development** project (Postgres + Auth), owned by the business.
2. Review and migrate `backend/schema.sql` in development; test RLS with anonymous, buyer, seller and admin accounts.
3. Implement public product catalog reading using a **publishable/anon** key only, never service-role secrets in browser code.
4. Build a trusted API for checkout, stock reservation, exchange-rate snapshots and payment verification.
5. Add seller login and approval workflow; do not expose approval controls directly to clients.
6. Test backups, order concurrency, refunds, and shipping integrations before production.

## Acceptance criteria for catalog integration
- Anonymous visitors see only products published by approved stores.
- Unapproved sellers cannot publish or expose products.
- Each seller can only modify their own products.
- Product prices and inventory cannot be changed by anonymous visitors.
- Frontend shows a graceful offline/unconfigured state.
- Demo cart and demo checkout remain explicitly labeled until server-side checkout is live.

## Secrets
- Browser: public Supabase project URL and publishable key only.
- Server: secret/service-role credentials in server environment variables, never GitHub, never GitHub Pages.
- Admin panel currently is a public local-only prototype, not an authenticated management interface.

## Pending decisions
- Supabase project URL and publishable key, once a project exists.
- Production hosting for trusted API (GitHub Pages hosts static files only).
- Verified payments provider capabilities and local legal/compliance review.
