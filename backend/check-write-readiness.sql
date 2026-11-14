-- Read-only preflight for product and order activation.
-- Run with an administrative connection. Does not read customer records.
-- Results describe grants and RLS, not end-to-end authorization or API reachability.
with targets(table_name) as (
 values ('stores'), ('products'), ('orders'), ('order_items')
), roles(role_name) as (values ('anon'), ('authenticated'))
select t.table_name, r.role_name,
 to_regclass(format('public.%I', t.table_name)) is not null as table_exists,
 c.relrowsecurity as rls_enabled,
 has_table_privilege(r.role_name, c.oid, 'SELECT') as table_select,
 has_table_privilege(r.role_name, c.oid, 'INSERT') as table_insert,
 has_table_privilege(r.role_name, c.oid, 'UPDATE') as table_update,
 has_table_privilege(r.role_name, c.oid, 'DELETE') as table_delete,
 has_table_privilege(r.role_name, c.oid, 'TRUNCATE') as truncate_granted,
 exists (
   select 1 from information_schema.column_privileges cp
   where cp.table_schema='public' and cp.table_name=t.table_name
     and cp.grantee=r.role_name and cp.privilege_type='UPDATE'
     and cp.column_name='stock'
 ) as explicit_stock_update,
 (select count(*) from pg_policies p
   where p.schemaname='public' and p.tablename=t.table_name) as policy_count
from targets t cross join roles r
left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=t.table_name
order by t.table_name, r.role_name;
-- TRUNCATE grants are a review blocker: RLS does not govern TRUNCATE.
-- Do not enable UI writes solely because a grant or policy exists.
-- Product ownership, approved store, allowed columns, and draft-only writes
-- require role-specific tests. Orders need trusted price/stock validation,
-- atomic inventory reservation, idempotency, and cancellation handling.
-- Payments remain disabled. No GRANT/REVOKE is applied by this file.
