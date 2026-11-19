# Multi-item rental cart preflight / فحص سلة التأجير

This is an **offline, read-only** helper for Maison She Bride, not a reservation service.

`scripts/rental-cart-policy.mjs` exports `checkRentalCartAvailability({ lines, catalog, holds, start, end })`.

- `catalog`: `[{ sku, units }]` with unique SKU values and nonnegative integer units.
- `lines`: `[{ sku, quantity }]`, with duplicate SKU quantities aggregated before availability checks.
- `holds`: `[{ sku, start, end, quantity }]` for existing allocations; all referenced SKUs must exist in the catalog. Invalid or overbooked overlapping holds are rejected, including holds on products not in the cart.
- `start` and `end`: strict UTC calendar dates in `YYYY-MM-DD`, using a half-open interval `[start, end)`. A rental ending on the requested start date does not overlap.
- The result includes `eligible` and per-product availability, with `authorized: false` and `persisted: false` always.

**العربية:** تفحص الوحدة توافر عدة منتجات للتأجير، وتجمع الكميات المتكررة لنفس المنتج، وتراعي تداخل الحجوزات والفترات الزمنية. لا تنشئ حجزاً ولا تخصم المخزون ولا تتصل بقاعدة البيانات أو المدفوعات.

Run locally:

```sh
node --test scripts/inventory-policy.test.mjs scripts/rental-cart-policy.test.mjs
```

The workflow `.github/workflows/rental-cart-policy.yml` runs the same checks on relevant changes. Before real bookings, implement server-side authorization, transactional/atomic allocation, database constraints, and audit logging. A successful offline preflight **does not reserve inventory** and may become stale immediately under concurrent requests. No customer identifiers or personal data are needed.
