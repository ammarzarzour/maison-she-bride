# Agent guidance — Maison She Bride

## Scope
- This repository is a **prototype**, not a production commerce system. See `README.md` first.
- Storefront: `index.html`, `catalog.js`; seller/admin demos: `seller.html`, `admin.html`.
- `sanad-*.html` and `sanad-*.js` are **local-only Sanad Syria demos**, not a live government service. Do not turn them into production identity/records workflows inside the storefront repository. Plan a separate repository and backend before using real data.
- Supabase-related definitions are under `backend/`.

## Product requirements
- Support Arabic (RTL) and English (LTR). Default to browser/device language when no saved user preference exists; remember an explicit user selection.
- Visual direction for planned new interfaces: green, gold, gray, and white. Preserve working styles unless a redesign is requested.
- Where a currency picker is relevant, plan for **new Syrian pound only**, USD and SAR. Never silently convert prices using unverified exchange rates or collect payments on the basis of demo conversions.
- Build mobile-first, accessible flows with clear validation, loading, empty, and error states.

## Safety and delivery
- Do not introduce real customer/passport/ID data into code, tests, demo fixtures, logs, or commits.
- Never commit credentials, API keys, Supabase `service_role` keys, or personal information. Keep secrets server-side.
- No real orders, payments, protected admin functions, or sensitive government-style workflows until authentication, authorization/RLS, server-side validation, privacy measures, and appropriate testing are implemented.
- Make changes on feature branches, use pull requests, and preserve the default branch. Do not deploy, merge, delete, or enable payment processing without user approval.
- Prefer small, reversible changes. Clearly distinguish demos from completed production features.

## Checks
- For functional edits, run affected tests and report results:
  - `node tests/smoke.cjs`
  - `node tests/storefront.cjs`
  - `node tests/sanad.cjs`
  - `node tests/sanad-admin.cjs`
  - `node tests/catalog.cjs`
- Inspect `.github/workflows/smoke.yml` for the CI check. Tests do not certify production readiness.
- In pull request summaries, list changed files, behavior, test results, security implications, and any manual Android/browser checks needed.
