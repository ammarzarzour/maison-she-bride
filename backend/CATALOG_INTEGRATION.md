# Public catalog integration

`catalog.js` is a read-only browser adapter for Supabase REST. It is committed but **not yet loaded by index.html**; the current storefront continues to show demo products.

## Configuration

Before loading `catalog.js`, set `window.MSB_SUPABASE = {url: 'https://PROJECT.supabase.co', publishableKey: 'sb_publishable_...'}`. Use a **publishable/anon key**, never a service-role/secret key. A publishable key is not a password, but access still depends on correct RLS.

## Safe next steps

1. Verify anonymous SELECT on categories and approved published products, and verify all other tables are inaccessible.
2. Create and approve a test seller through a trusted admin process; add a published test product only through a trusted process.
3. Connect the storefront to `MSB_CATALOG.categories()` and `.products()` with explicit loading, empty, and failure states. Never silently fall back to fake products while claiming they are live.
4. Preserve demo checkout until a trusted checkout API validates stock, pricing and exchange rates.

Current project ID: `cymwmswpseevemxtugdb` (public identifier, not a secret).
