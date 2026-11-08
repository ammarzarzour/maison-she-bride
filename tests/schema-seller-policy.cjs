const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const schema = fs.readFileSync(path.join(__dirname, '../backend/schema.sql'), 'utf8');
const policy = schema.match(/create policy "Owners can update their products"[\s\S]*?;(?=\s*create policy|\s*--|\s*$)/i);
assert.ok(policy, 'seller update policy must exist');
const [using, check] = policy[0].split(/\bwith check\s*\(/i);
assert.ok(using && check, 'seller update must include WITH CHECK');
assert.match(using, /\busing\s*\(\s*status\s*=\s*'draft'/i);
assert.match(check, /^\s*status\s*=\s*'draft'/i);
assert.match(using, /owner_id\s*=\s*\(select auth\.uid\(\)\)/i);
assert.match(check, /owner_id\s*=\s*\(select auth\.uid\(\)\)/i);
assert.match(using, /s\.status\s*=\s*'approved'/i, 'seller must belong to an approved store');
assert.match(check, /s\.status\s*=\s*'approved'/i, 'replacement must remain in an approved store');
assert.doesNotMatch(schema, /create\s+policy\s+[^;]*\bon\s+public\.orders\s+for\s+(?:insert|update|delete|all)\b/i, 'browser order writes must remain disabled');
assert.doesNotMatch(schema, /create\s+policy\s+[^;]*\bon\s+public\.order_items\s+for\s+(?:insert|update|delete|all)\b/i, 'browser order-item writes must remain disabled');

// Prevent future policy edits from exposing unapproved inventory or permitting
// browser-side publication through an INSERT policy.
const publicRead = schema.match(/create policy "Public can read approved published products"[\s\S]*?;/i);
assert.ok(publicRead, 'public product read policy must exist');
assert.match(publicRead[0], /status\s*=\s*'published'/i);
assert.match(publicRead[0], /s\.status\s*=\s*'approved'/i);
const sellerInsert = schema.match(/create policy "Owners can insert draft products"[\s\S]*?;/i);
assert.ok(sellerInsert, 'seller product insert policy must exist');
assert.match(sellerInsert[0], /\bwith check\s*\(\s*status\s*=\s*'draft'/i);
assert.match(sellerInsert[0], /owner_id\s*=\s*\(select auth\.uid\(\)\)/i);
assert.match(sellerInsert[0], /s\.status\s*=\s*'approved'/i);
assert.doesNotMatch(schema, /create\s+policy\s+[^;]*\bon\s+public\.products\s+for\s+(?:delete|all)\b/i, 'browser product delete or broad ALL policies must remain disabled');
console.log('Seller draft and no-order-write policy checks passed');
