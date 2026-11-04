# Development workflow: ChatGPT + GitHub + Codex + Work

This document describes the **intended workflow**, not a claim that Codex Cloud or Work is already configured on this account.

## Roles
1. **ChatGPT Chat** — clarify requirements, product decisions, and review changes.
2. **GitHub** — store source code, issues, branches, pull requests, and CI history.
3. **Codex Cloud** — implement and test code changes in a configured cloud environment connected to this repository.
4. **ChatGPT Work** — coordinate multi-step reviews and supported browser tasks. Website access and actions depend on user permissions and available tools.
5. **Supabase** — database and authentication only after the backend, RLS and roles are configured and verified.

## First-time Codex setup (on browser/desktop)
1. Sign in to Codex with the same ChatGPT account.
2. Create a Codex Cloud environment and authorize **only** `ammarzarzour/maison-she-bride`.
3. Choose the `main` default branch as the base; publish the environment for reuse from Android.
4. Configure a compatible Node.js runtime (see README), install only required dependencies.
5. Keep all sensitive credentials in approved secrets management, never in source files or chat.
6. Start a small task on a feature branch, inspect diff and test results, then open a pull request for review.

## Change management
- Each task: issue/goal -> feature branch -> code and tests -> pull request -> owner review -> merge.
- Do not merge directly to `main`; do not publish production features or configure payments based on demo code.
- Test Arabic/English, RTL/LTR and mobile layouts before release.
- If tests are missing, say exactly what was not verified.
- For administrative and customer data, verify authorization, privacy, and backups before accepting live information.

## Project separation
- **Maison She Bride:** the commerce project lives in this repository.
- **Sanad Syria:** preview files are local-only examples; create an independent repository and a separately secured backend when moving beyond demos.
- **Zarzour tourism:** the existing `zarzour2019` repository is effectively a placeholder; scope it separately before implementation.

## Example Codex Cloud task
“Inspect this repository and README. On a new branch, improve mobile accessibility of the Maison She Bride storefront while preserving Arabic/English and RTL/LTR. Do not add payments or use real customer data. Run applicable tests, report limitations, and open a pull request for my review.”

## Example ChatGPT Work task
“Review the latest open pull request for Maison She Bride with GitHub access. Summarize changed files, tests, security issues, and readiness for an Android manual check. Do not merge or deploy without asking me.”

## Release gate
- Admin access, roles, RLS and server-side validations verified.
- Real catalogue, images, prices and inventory reviewed.
- Full end-to-end order, shipping and refunds flow tested.
- Payment provider approved and server-side confirmations implemented if payments are enabled later.
- Data retention, privacy notice, and localized policies are ready.
