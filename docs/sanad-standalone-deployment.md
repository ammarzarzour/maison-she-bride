# Sanad Syria — independent static-preview deployment guide

This guide covers the **four-file browser-only fictional preview**, not real public-service requests, official administration, authentication, citizen records or payment services. Sanad Syria must remain technically separate from Maison She Bride and reusable with other products.

## Verify the portable release (Node 22)

From the maison-she-bride repository root:

```sh
node --test tests/sanad-*.test.mjs
node scripts/sanad-offline-boundary.test.mjs
node scripts/build-sanad-standalone.mjs --check
node scripts/build-sanad-standalone.mjs
node --test scripts/sanad-served-artifact.test.mjs
```

The release directory **dist/sanad-syria/** must contain exactly four files, and no credentials or other assets: index.html, admin.html, sanad-demo.js and sanad-admin-demo.js.

The HTTP smoke test serves those files through a temporary **loopback-only** web server and checks the homepage, demo dashboard, versioned scripts, direct navigation and a subpath deployment. Requests to Maison She Bride pages, backend APIs and unapproved files must fail. A passing test proves local release portability, **not** that a separate public URL exists.

## Publishing to a genuinely separate site

1. Provision a new repository or independent static hosting project owned by Sanad Syria, with its own deployment permissions. The existing Maison She Bride GitHub Pages path is only a preview.
2. Download the **Sanad Syria standalone preview artifact** from a successful GitHub Actions run, or reproduce it from a pinned source commit with the commands above.
3. Publish the **contents** of dist/sanad-syria/ as the new site's document root. Do not publish Maison assets, configuration files or server code.
4. Serve over HTTPS and manually verify direct navigation to /, /index.html and /admin.html, plus script loading and browser refresh.
5. Test Arabic and English, RTL/LTR, disabled local storage, concurrent tabs and the clear warning that all requests are **fictional**.
6. Confirm browser network inspection shows **no API calls**, secret keys or store dependencies. Never enter real citizen information.
7. Record the verified independent URL, provider, project, source commit, completed CI run, artifact identity and rollback target only **after** deployment verification.

## Security and operational boundaries

- The public demo dashboard is **not** a secure administrative console. Never add real requests or personal records without separately reviewed authentication, authorization, tenant isolation and RLS.
- Never embed service-role tokens, database secrets, payment credentials or identifying documents in static hosting.
- Do not enable payments or change Supabase permissions as part of this preview release.
- Keep Maison She Bride deployments untouched. Roll back by redeploying the last verified four-file release through the independent host.
