'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepareOrder}=require('./order-preparation.cjs');
const buyer='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const other='cccccccc-cccc-cccc-cccc-cccccccccccc';
const product=(patch={})=>({id,status:'published',store_status:'approved',stock:10,price_usd:'0.10',...patch});
const request=(quantity=3)=>[{product_id:id,quantity}];
test('uses trusted prices and exact decimal totals',()=>{
 const result=prepareOrder(buyer,request(),[product()]);
 assert.equal(result.order.total_amount,'0.30');
 assert.equal(result.order.currency,'USD');
 assert.equal(result.items[0].unit_price_usd,'0.10');
 assert.equal(result.order.buyer_id,buyer);
});
test('rejects price and buyer overrides in item input',()=>{
 for(const extra of [{price_usd:'0.01'},{buyer_id:other},{total_amount:0}])
 assert.throws(()=>prepareOrder(buyer,[{...request()[0],...extra}],[product()]),/INVALID_ITEM_FIELDS/);
});
test('rejects absent identity, empty orders and oversized orders',()=>{
 assert.throws(()=>prepareOrder(null,request(),[product()]));
 for(const items of [[],null,Array(101).fill(request()[0])])
 assert.throws(()=>prepareOrder(buyer,items,[product()]));
});
test('rejects duplicate IDs including different casing',()=>{
 assert.throws(()=>prepareOrder(buyer,[...request(),{product_id:id.toUpperCase(),quantity:1}],[product()]),/DUPLICATE_PRODUCT/);
 assert.throws(()=>prepareOrder(buyer,request(),[product(),product()]),/DUPLICATE_CATALOG_ID/);
});
test('rejects missing, unpublished or unapproved products',()=>{
 for(const products of [[],[product({status:'draft'})],[product({store_status:'suspended'})]])
 assert.throws(()=>prepareOrder(buyer,request(),products),/PRODUCT_UNAVAILABLE/);
});
test('rejects overselling and invalid stock',()=>{
 assert.throws(()=>prepareOrder(buyer,request(11),[product()]),/INSUFFICIENT_STOCK/);
 for(const stock of [null,'10',-1,1.5,2147483648])
 assert.throws(()=>prepareOrder(buyer,request(),[product({stock})]),/INVALID_STOCK/);
});
test('rejects invalid quantities without coercion',()=>{
 for(const quantity of [0,-1,1.5,'2',null,NaN,Infinity,2147483648])
 assert.throws(()=>prepareOrder(buyer,request(quantity),[product()]),/INVALID_QUANTITY/);
});
test('rejects malformed and out-of-schema decimal prices',()=>{
 for(const price_usd of ['1e2',' 1','1.001','-1','10000000000',null,0.1,true])
 assert.throws(()=>prepareOrder(buyer,request(),[product({price_usd})]),/INVALID_PRICE/);
});
test('accepts free products and rejects totals above schema limit',()=>{
 assert.equal(prepareOrder(buyer,request(),[product({price_usd:'0'})]).order.total_amount,'0.00');
 assert.throws(()=>prepareOrder(buyer,request(2147483647),[product({stock:2147483647,price_usd:'9999999999.99'})]),/TOTAL_OVERFLOW/);
});
test('handles multiple products without mutating inputs',()=>{
 const items=[...request(),{product_id:other,quantity:2}];
 const products=[product(),product({id:other,price_usd:'1.25'})];
 const before=JSON.stringify({items,products});
 assert.equal(prepareOrder(buyer,items,products).order.total_amount,'2.80');
 assert.equal(JSON.stringify({items,products}),before);
});
