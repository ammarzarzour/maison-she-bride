# SP Today integration status

The conversion boundary is implemented and tested with synthetic inputs. It is NOT wired to the storefront, a live feed, or order creation.

Approved: USD, SAR, AED sell rates quoted in NEW SYP. Source: https://www.sp-today.com/ .

Provider documentation supplied on 2026-11-14 specifies GET https://api-v2.sp-today.com/api/v1/currencies with X-API-Key. The currencies examples use data.currencies; overview uses data.rates. City selection must be explicit; documentation defaults to Damascus. Do not assume the overview response shape for currencies.

Blockers:
- Actual authenticated response was blocked by Cloudflare error 1010 / HTTP 403. Credential validity remains unverified. Do not retry a hard block or bypass it.
- Provider denomination is not declared in supplied API documentation. Do not infer old/new units from number magnitude or divide by 100 without confirmation.
- No server secret has been provisioned and no live endpoint has been deployed.

The documented Free tier allows 100 requests/month; the user's actual subscription and remaining quota are not verified. Plan for a server cache and at most three scheduled fetches per day on Free (93 in a 31-day month, leaving seven for manual requests). All projects must share the fetch budget if using the same provider account. Never fetch once per visitor. A 15-minute freshness default in the pure helper is conservative, not a selected production policy; explicitly configure an age limit consistent with the schedule and market closures before integration.

Next: confirm provider units and authorized server access, provision a server-only secret, implement strict response adapter and cached refresh, then wire display and run integration tests. Payments remain off. No real customer data needed.

Run: node --test backend/exchange-rates.test.cjs
