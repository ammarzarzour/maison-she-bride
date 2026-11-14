# Node orders runtime (prepared, not deployed)

Node 22+. Install from the committed lockfile: `npm ci --ignore-scripts --prefix backend/runtime`. Start: `node backend/runtime/start.cjs`.

By default ORDERS_ENABLED is false and the server binds 127.0.0.1:3000. GET /health reports process health and whether orders are enabled; it is NOT a database readiness or authentication test. All other requests receive ORDERS_DISABLED while disabled. No DB connection or Auth client is created in disabled mode.

For a reviewed activation, supply protected server environment values: ORDERS_ENABLED=true; DATABASE_URL for the approved least-privilege backend role; SUPABASE_URL; SUPABASE_PUBLISHABLE_KEY; ORDER_ALLOWED_ORIGINS as comma-separated exact HTTPS origins; optional PG_CA_CERT containing the trusted provider CA. PORT and HOST configure the listener. Database SSL verification is mandatory and connection-string ssl* overrides are rejected. No real values belong in GitHub. The Supabase key is publishable, never service_role or sb_secret. The database connection string is a separate secret, not an API key.

The runtime uses one PostgreSQL connection per transaction through the tested adapter, calls Supabase auth.getUser for every order, sets an 8-second Auth request timeout, and has basic HTTP header/request timeouts. It does not yet add production rate limiting, reverse proxy TLS, operational monitoring, or certificate provisioning. Those hosting controls and the reviewed private retry-table migration are prerequisites. No live database schema, permissions, secrets or hosting are changed by committing this runtime.

A host or container runtime must run this process; GitHub Pages only hosts static files and cannot run it. Publish behind TLS, configure origin restrictions, verify least privilege, and complete deployed frontend/Auth tests with synthetic accounts before exposing order creation. Keep payments off and FX deferred. Changes to sensitive access require explicit approval.
