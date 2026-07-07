// options.js - 1688→Shopify 設定

const FIELDS = ['storeSlug', 'cnyRate', 'adminAppUrl'];
const PRODUCT_NO_COUNTER_KEY = 'productNoCounterSocora1688S';
const PRODUCT_NO_START = 1;
const PRODUCT_NO_SEED = PRODUCT_NO_START - 1;
const DEFAULT_ADMIN_APP_URL = 'https://socora-order-admin.onrender.com';

function normalizeAdminAppUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_ADMIN_APP_URL;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(raw)) return DEFAULT_ADMIN_APP_URL;
  return raw;
}

// 設定を読み込んでフォームに反映
chrome.storage.local.get([...FIELDS, PRODUCT_NO_COUNTER_KEY], data => {
  if (data.storeSlug)   document.getElementById('storeSlug').value   = data.storeSlug;
  document.getElementById('cnyRate').value    = data.cnyRate    || 24;
  document.getElementById('adminAppUrl').value = normalizeAdminAppUrl(data.adminAppUrl);
  updateCounterDisplay(Math.max(Number(data[PRODUCT_NO_COUNTER_KEY] || 0), PRODUCT_NO_SEED));
});

function updateCounterDisplay(counter) {
  const next = Math.max(Number(counter || 0), PRODUCT_NO_SEED) + 1;
  const el = document.getElementById('counterDisplay');
  if (el) el.textContent = '次の管理番号: S' + String(next).padStart(4, '0');
}

// 管理番号リセット
document.getElementById('resetCounterBtn').addEventListener('click', () => {
  if (!confirm('管理番号をS0001からリセットしますか？\n（過去の番号と重複する可能性があります）')) return;
  chrome.storage.local.set({ [PRODUCT_NO_COUNTER_KEY]: PRODUCT_NO_SEED }, () => {
    updateCounterDisplay(PRODUCT_NO_SEED);
    showStatus('ok', '管理番号をリセットしました。次回からS0001になります');
  });
});

// Shopify接続確認
document.getElementById('checkBtn').addEventListener('click', async () => {
  const slug = document.getElementById('storeSlug').value.trim();
  if (!slug) { showStatus('err', 'ストアスラッグを入力してください'); return; }
  showStatus('ok', '確認中...');
  const res = await chrome.runtime.sendMessage({ action: 'checkShopifyLogin', storeSlug: slug });
  if (res.loggedIn) {
    showStatus('ok', '接続成功 - Shopifyにログイン済みです');
  } else {
    showStatus('err', '接続失敗。admin.shopify.com にログインしてから再試行してください');
  }
});

// 保存
document.getElementById('saveBtn').addEventListener('click', () => {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  const values = {
    storeSlug:   document.getElementById('storeSlug').value.trim(),
    cnyRate:     parseFloat(document.getElementById('cnyRate').value)    || 24,
    adminAppUrl: normalizeAdminAppUrl(document.getElementById('adminAppUrl').value),
    markupRate:  300,
  };

  chrome.storage.local.set(values, () => {
    showStatus('ok', '保存しました');
    btn.disabled = false;
    btn.textContent = '保存';
    setTimeout(() => { document.getElementById('status').style.display = 'none'; }, 3000);
  });
});

function showStatus(type, msg) {
  const el = document.getElementById('status');
  el.className = 'status ' + type;
  el.textContent = msg;
  el.style.display = 'block';
}
