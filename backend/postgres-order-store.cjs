'use strict';
// Server-only adapter for a node-postgres-compatible Pool; never load in a browser.
// Requires reviewed schema prerequisites and a separately authenticated endpoint.
function createPostgresOrderStore(pool) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('POOL_REQUIRED');
  return {
    async transaction(work) {
      const client = await pool.connect();
      let active = false;
      let destroy;
      let committing = false;
      const query = (...args) => {
        if (!active) throw new Error('TRANSACTION_CLOSED');
        return client.query(...args);
      };
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        active = true;
        await query("SET LOCAL lock_timeout = '5s'");
        await query("SET LOCAL statement_timeout = '15s'");
        const tx = {
          async lockRequest(buyer, key) {
            // Transaction-scoped lock also covers a retry record that does not exist.
            await query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))',
              ['msb-order:' + buyer + ':' + key]);
          },
          async findRequest(buyer, key) {
            const r = await query(
              'SELECT fingerprint, order_id FROM private.order_requests WHERE buyer_id=$1::uuid AND request_key=$2::uuid',
              [buyer,key]);
            return r.rows[0];
          },
          async lockProducts(ids) {
            const r = await query(
              'SELECT p.id, p.status, p.stock, p.price_usd::text AS price_usd, s.status AS store_status ' +
              'FROM public.products p JOIN public.stores s ON s.id=p.store_id ' +
              'WHERE p.id=ANY($1::uuid[]) ORDER BY p.id FOR UPDATE OF p FOR SHARE OF s',
              [ids]);
            return r.rows;
          },
          async reserveInventory(items) {
            for (const item of items) {
              const r = await query(
                'UPDATE public.products SET stock=stock-$2::integer, updated_at=now() ' +
                "WHERE id=$1::uuid AND stock >= $2::integer AND status='published' RETURNING id",
                [item.product_id,item.quantity]);
              if (r.rowCount !== 1) throw new Error('INVENTORY_CONFLICT');
            }
          },
          async insertOrder(prepared) {
            const o = prepared.order;
            const r = await query(
              'INSERT INTO public.orders (buyer_id,status,currency,fx_per_usd,total_amount) ' +
              'VALUES ($1::uuid,$2::text,$3::text,$4::numeric,$5::numeric) RETURNING id',
              [o.buyer_id,o.status,o.currency,o.fx_per_usd,o.total_amount]);
            const orderId = r.rows[0]?.id;
            if (!orderId) throw new Error('ORDER_INSERT_FAILED');
            const lines = await query(
              'INSERT INTO public.order_items (order_id,product_id,quantity,unit_price_usd) ' +
              'SELECT $1::uuid,x.product_id,x.quantity,x.unit_price_usd ' +
              'FROM jsonb_to_recordset($2::jsonb) AS x(product_id uuid, quantity integer, unit_price_usd numeric)',
              [orderId,JSON.stringify(prepared.items)]);
            if (lines.rowCount !== prepared.items.length) throw new Error('ITEM_INSERT_FAILED');
            return orderId;
          },
          async rememberRequest(record) {
            await query(
              'INSERT INTO private.order_requests (buyer_id,request_key,fingerprint,order_id) VALUES ($1::uuid,$2::uuid,$3::text,$4::uuid)',
              [record.buyer_id,record.key,record.fingerprint,record.order_id]);
          }
        };
        const result = await work(tx);
        committing = true;
        await query('COMMIT');
        active = false;
        return result;
      } catch (error) {
        if (committing) destroy = error; // outcome can be unknown; retry SAME key
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) { destroy = rollbackError; }
        active = false;
        throw error;
      } finally {
        active = false;
        client.release(destroy);
      }
    }
  };
}
module.exports = {createPostgresOrderStore};
