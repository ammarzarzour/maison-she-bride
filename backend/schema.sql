-- Maison She Bride starter schema for Supabase/PostgreSQL.
-- Not deployed. Apply only to a controlled Supabase project after reviewing policies.
create extension if not exists pgcrypto;
create table if not exists public.stores (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 owner_id uuid not null references auth.users(id),
 status text not null default 'pending' check(status in ('pending','approved','suspended')),
 created_at timestamptz not null default now()
);
create table if not exists public.categories (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique,
 name_ar text not null,
 name_en text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 category_id uuid references public.categories(id),
 title_ar text not null,
 title_en text not null,
 description_ar text,
 description_en text,
 price_usd numeric(12,2) not null check(price_usd>=0),
 stock integer not null default 0 check(stock>=0),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid not null references auth.users(id),
 status text not null default 'pending' check(status in ('pending','confirmed','shipped','delivered','cancelled')),
 currency text not null check(currency in ('SYP','USD','SAR','AED')),
 fx_per_usd numeric(18,6) not null check(fx_per_usd>0),
 total_amount numeric(16,2) not null check(total_amount>=0),
 created_at timestamptz not null default now()
);
create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 product_id uuid not null references public.products(id),
 quantity integer not null check(quantity>0),
 unit_price_usd numeric(12,2) not null check(unit_price_usd>=0)
);
create index if not exists products_store_idx on public.products(store_id);
create index if not exists orders_buyer_idx on public.orders(buyer_id);
create index if not exists order_items_order_idx on public.order_items(order_id);
alter table public.stores enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
-- Only approved stores can publicly expose published products.
create policy "Public can read categories" on public.categories for select using (true);
create policy "Public can read approved published products" on public.products for select using (
 status='published' and exists(select 1 from public.stores s where s.id=store_id and s.status='approved')
);
create policy "Owners can read their stores" on public.stores for select to authenticated using(owner_id=(select auth.uid()));
create policy "Owners can create pending stores" on public.stores for insert to authenticated with check(owner_id=(select auth.uid()) and status='pending');
create policy "Owners can read their products" on public.products for select to authenticated using (
 exists(select 1 from public.stores s where s.id=store_id and s.owner_id=(select auth.uid()))
);
create policy "Owners can insert draft products" on public.products for insert to authenticated with check (
 status='draft' and exists(select 1 from public.stores s where s.id=store_id and s.owner_id=(select auth.uid()) and s.status='approved')
);
-- Restrict both the existing row and its replacement to drafts. Publishing
-- requires a separately reviewed trusted workflow, not browser UPDATE.
create policy "Owners can update their products" on public.products for update to authenticated using (
 status='draft' and exists(select 1 from public.stores s where s.id=store_id and s.owner_id=(select auth.uid()) and s.status='approved')
) with check (
 status='draft' and exists(select 1 from public.stores s where s.id=store_id and s.owner_id=(select auth.uid()) and s.status='approved')
);
create policy "Buyers can read their orders" on public.orders for select to authenticated using(buyer_id=(select auth.uid()));
create policy "Buyers can read their order items" on public.order_items for select to authenticated using (
 exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=(select auth.uid()))
);
-- Intentionally no client-side order insert/update or payment policies:
-- create orders in a trusted backend that validates prices, inventory and exchange rates.
-- Admin store approval must happen via a trusted server role, never a browser service key.
