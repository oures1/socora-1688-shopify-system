const fs = require('fs');
const path = require('path');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_STORE_TABLE = process.env.SUPABASE_STORE_TABLE || 'admin_store';
const SUPABASE_STORE_KEY = process.env.SUPABASE_STORE_KEY || 'main';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。');
  process.exit(1);
}

const input = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'store.json'));
const store = JSON.parse(fs.readFileSync(input, 'utf8'));
const url = new URL(`/rest/v1/${SUPABASE_STORE_TABLE}`, SUPABASE_URL);
url.searchParams.set('on_conflict', 'key');

(async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      key: SUPABASE_STORE_KEY,
      data: store,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Supabaseへの保存に失敗しました: ${res.status}`);
    console.error(text);
    process.exit(1);
  }
  console.log(`Supabaseへ保存しました: ${SUPABASE_STORE_TABLE}/${SUPABASE_STORE_KEY}`);
})();
