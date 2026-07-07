const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function loadLocalEnvFile() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadLocalEnvFile();

const PORT = Number(process.env.PORT || 4877);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const EXPORT_DIR = path.join(DATA_DIR, 'exports');
const STORE_BACKEND = process.env.STORE_BACKEND || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'local');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_STORE_TABLE = process.env.SUPABASE_STORE_TABLE || 'admin_store';
const SUPABASE_STORE_KEY = process.env.SUPABASE_STORE_KEY || 'main';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUTH_COOKIE_NAME = 'socora_admin_session';
const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const LOCAL_SMALLORDER_TEMPLATE = path.join(ROOT, 'templates', 'smallorder.xlsx');
const LEGACY_SMALLORDER_TEMPLATE = '/Users/yuta/Downloads/smallorder.xlsx';
const SMALLORDER_TEMPLATE = process.env.SMALLORDER_TEMPLATE
  || (fs.existsSync(LOCAL_SMALLORDER_TEMPLATE) ? LOCAL_SMALLORDER_TEMPLATE : LEGACY_SMALLORDER_TEMPLATE);
const CODEX_PYTHON = '/Users/yuta/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const PYTHON = process.env.PYTHON || (fs.existsSync(CODEX_PYTHON) ? CODEX_PYTHON : 'python3');
const SMALLORDER_SCRIPT = path.join(ROOT, 'scripts', 'fill_smallorder.py');
const INVOICE_SCRIPT = path.join(ROOT, 'scripts', 'extract_banri_invoice.py');
const BILLING_SHEET_SCRIPT = path.join(ROOT, 'scripts', 'extract_billing_sheet.py');
const BILLING_EXPORT_SCRIPT = path.join(ROOT, 'scripts', 'export_billing_reconciliation.py');
const INVENTORY_EXPORT_SCRIPT = path.join(ROOT, 'scripts', 'export_inventory_checks.py');
const PRODUCT_NO_START = 1;
const PRODUCT_NO_SEED = PRODUCT_NO_START - 1;
const DEFAULT_FEE_CNY = 6;
const SHOPIFY_SOURCE_AVAILABLE_STOCK_QTY = 100;
const SHOPIFY_SOURCE_OUT_OF_STOCK_QTY = 0;
const INVENTORY_CHECK_STALE_DAYS = 14;
const MAX_BODY_BYTES = 120_000_000;
const LOW_MARGIN_THRESHOLD = 0.3;
const IGNORED_SHOPIFY_ORDER_MIN = 1;
const IGNORED_SHOPIFY_ORDER_MAX = 1009;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || '';
const SHOPIFY_ADMIN_STORE_SLUG = process.env.SHOPIFY_ADMIN_STORE_SLUG || process.env.SHOPIFY_STORE_SLUG || 'y9wpse-tn';
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || '';
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '';
const SHOPIFY_INVENTORY_LOCATION_ID = process.env.SHOPIFY_INVENTORY_LOCATION_ID || '';
const SHOPIFY_TRACKING_COMPANY = process.env.SHOPIFY_TRACKING_COMPANY || 'Sagawa Express';
const SHOPIFY_AUTO_MEDIA_ENABLED = process.env.SHOPIFY_AUTO_MEDIA_ENABLED !== '0';
const SHOPIFY_TRACK_INVENTORY = process.env.SHOPIFY_TRACK_INVENTORY === '1';
const LOCAL_STORE_GUARD_ENABLED = process.env.LOCAL_STORE_GUARD !== '0';
const LOCAL_STORE_MIN_PRODUCT_NO = Number(process.env.LOCAL_STORE_MIN_PRODUCT_NO || 0);
const LOCAL_STORE_MIN_ORDER_NO = Number(process.env.LOCAL_STORE_MIN_ORDER_NO || 0);
const LOCAL_STORE_BACKUP_ON_WRITE = process.env.LOCAL_STORE_BACKUP_ON_WRITE !== '0';
const LOCAL_STORE_BACKUP_KEEP = Math.max(20, Number(process.env.LOCAL_STORE_BACKUP_KEEP || 200));
const SHOPIFY_TRACKING_COMPANY_LABELS = {
  'Sagawa Express': '佐川急便',
};
const SAGAWA_TRACKING_API_URL = process.env.SAGAWA_TRACKING_API_URL || '';
const SAGAWA_TRACKING_API_KEY = process.env.SAGAWA_TRACKING_API_KEY || '';
const SAGAWA_PUBLIC_TRACKING_URL = 'https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do';
const IMAGE_PROXY_ALLOWED_HOSTS = [
  'alicdn.com',
  'shopify.com',
  'shopifycdn.net',
];
const IMAGE_PROXY_MAX_BYTES = 12 * 1024 * 1024;

function cleanProductMemo(value) {
  const memo = String(value || '').trim();
  if (!memo) return '';
  if (/^Chrome拡張機能で取得/.test(memo)) return '';
  return memo;
}

const shopifyTokenCache = {
  domain: '',
  accessToken: '',
  expiresAt: 0,
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function sampleImage(color) {
  const fills = {
    black: '#111827',
    blue: '#9ec5ef',
    gray: '#d1d5db',
  };
  const fill = fills[color] || '#e5e7eb';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220"><rect width="220" height="220" fill="${fill}"/><path d="M60 62h100l-18 116H78L60 62Z" fill="white" fill-opacity=".72"/><path d="M83 62c7 18 47 18 54 0" fill="none" stroke="#111827" stroke-opacity=".28" stroke-width="7"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function createInitialStore() {
  return {
    version: 2,
    productNoCounter: PRODUCT_NO_SEED,
    products: [],
    inventoryChecks: [],
    orderItems: [],
    orderHistory: [],
    autoOrderHistory: [],
    shopifyOrders: [],
    billingItems: [],
    billingImports: [],
  };
}

function defaultShopifySyncState(overrides = {}) {
  return {
    status: '未照合',
    lastCheckedAt: '',
    confirmedAt: '',
    appliedAt: '',
    okCount: 0,
    diffCount: 0,
    missingCount: 0,
    reviewCount: 0,
    lastSummary: '',
    lastError: '',
    lastResult: null,
    ...overrides,
  };
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createInitialStore(), null, 2));
  }
}

function useSupabaseStore() {
  return STORE_BACKEND === 'supabase';
}

function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseEndpoint(pathname, params = {}) {
  const url = new URL(`/rest/v1/${pathname}`, SUPABASE_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

async function supabaseJson(pathname, options = {}) {
  if (!supabaseConfigured()) {
    throw new Error('Supabaseの接続情報が未設定です。SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。');
  }
  const res = await fetch(supabaseEndpoint(pathname, options.params), {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.headers || {}),
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase保存でエラーが発生しました: ${res.status} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

function readLocalStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function timestampForBackupName(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function pruneLocalStoreBackups() {
  if (!fs.existsSync(DATA_DIR)) return;
  const backups = fs.readdirSync(DATA_DIR)
    .filter(name => /^store\.backup-before-write-\d{14}(?:-[a-z0-9-]+)?\.json$/.test(name))
    .sort()
    .reverse();
  backups.slice(LOCAL_STORE_BACKUP_KEEP).forEach(name => {
    try { fs.unlinkSync(path.join(DATA_DIR, name)); } catch(e) {}
  });
}

function backupLocalStoreBeforeWrite(nextStore) {
  if (!LOCAL_STORE_BACKUP_ON_WRITE || !fs.existsSync(DATA_FILE)) return;
  const currentText = fs.readFileSync(DATA_FILE, 'utf8');
  const nextText = JSON.stringify(nextStore, null, 2);
  if (currentText === nextText) return;
  const backupFile = path.join(DATA_DIR, `store.backup-before-write-${timestampForBackupName()}-${crypto.randomUUID().slice(0, 8)}.json`);
  fs.writeFileSync(backupFile, currentText);
  pruneLocalStoreBackups();
}

function writeLocalStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  backupLocalStoreBeforeWrite(store);
  const tmpFile = `${DATA_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2));
  fs.renameSync(tmpFile, DATA_FILE);
}

async function readStore() {
  if (!useSupabaseStore()) {
    const store = readLocalStore();
    if (migrateStore(store)) await writeStore(store);
    return store;
  }

  const rows = await supabaseJson(SUPABASE_STORE_TABLE, {
    params: {
      key: `eq.${SUPABASE_STORE_KEY}`,
      select: 'data',
      limit: '1',
    },
  });
  const store = rows?.[0]?.data || createInitialStore();
  if (!rows?.length || migrateStore(store)) await writeStore(store);
  return store;
}

async function writeStore(store) {
  if (!useSupabaseStore()) {
    writeLocalStore(store);
    return;
  }
  await supabaseJson(SUPABASE_STORE_TABLE, {
    method: 'POST',
    params: { on_conflict: 'key' },
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      key: SUPABASE_STORE_KEY,
      data: store,
    },
  });
}

function authEnabled() {
  return Boolean(ADMIN_PASSWORD);
}

function authSecret() {
  return process.env.SESSION_SECRET || crypto
    .createHash('sha256')
    .update(`socora-admin-session:${ADMIN_PASSWORD}`)
    .digest('hex');
}

function authDigest(value) {
  return crypto.createHmac('sha256', authSecret()).update(String(value)).digest('hex');
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function cookieSecureAttribute(req) {
  return req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
}

function createAuthCookie(req) {
  const issuedAt = String(Date.now());
  const token = `${issuedAt}.${authDigest(issuedAt)}`;
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_SESSION_MAX_AGE_SECONDS}${cookieSecureAttribute(req)}`;
}

function clearAuthCookie(req) {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecureAttribute(req)}`;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((cookies, part) => {
    const splitAt = part.indexOf('=');
    if (splitAt < 0) return cookies;
    const key = part.slice(0, splitAt).trim();
    const value = part.slice(splitAt + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value || '');
    return cookies;
  }, {});
}

function hasValidSession(req) {
  if (!authEnabled()) return true;
  const token = parseCookies(req)[AUTH_COOKIE_NAME];
  if (!token) return false;
  const [issuedAt, signature] = String(token).split('.');
  const issuedAtNumber = Number(issuedAt);
  if (!issuedAt || !signature || !Number.isFinite(issuedAtNumber)) return false;
  if (Date.now() - issuedAtNumber > AUTH_SESSION_MAX_AGE_SECONDS * 1000) return false;
  return constantTimeEqual(signature, authDigest(issuedAt));
}

function sanitizeNextPath(value) {
  const next = String(value || '/').trim();
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function htmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, {
    Location: location,
    ...headers,
  });
  res.end();
}

function unauthorized(req, res) {
  const accept = req.headers.accept || '';
  if (req.url.startsWith('/api/') || !accept.includes('text/html')) {
    return send(res, 401, { error: 'ログインしてください' });
  }
  const next = encodeURIComponent(req.url || '/');
  redirect(res, `/login?next=${next}`);
}

function serveLogin(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const next = sanitizeNextPath(url.searchParams.get('next'));
  const hasError = url.searchParams.get('error') === '1';
  const errorHtml = hasError ? '<div class="login-error">パスワードが違います。</div>' : '';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>管理画面ログイン</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f6f7f9;
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, "Noto Sans JP", "Helvetica Neue", sans-serif;
    }
    .login-box {
      width: min(420px, calc(100vw - 32px));
      background: #fff;
      border: 1px solid #d9dde5;
      border-radius: 8px;
      padding: 28px;
      box-shadow: 0 16px 40px rgba(17, 24, 39, .08);
    }
    h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: 0; }
    p { margin: 0 0 20px; color: #6b7280; line-height: 1.6; }
    label { display: grid; gap: 8px; color: #374151; font-weight: 700; }
    input {
      width: 100%;
      min-height: 44px;
      border: 1px solid #d9dde5;
      border-radius: 6px;
      padding: 10px 12px;
      font: inherit;
      outline: none;
    }
    input:focus { border-color: #111827; }
    button {
      width: 100%;
      min-height: 44px;
      margin-top: 16px;
      border: 1px solid #111827;
      border-radius: 6px;
      background: #111827;
      color: #fff;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .login-error {
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 6px;
      background: #fef3f2;
      color: #b42318;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <form class="login-box" method="post" action="/api/login">
    <h1>管理画面ログイン</h1>
    <p>パスワードを入力してください。</p>
    ${errorHtml}
    <input type="hidden" name="next" value="${htmlEscape(next)}">
    <label>パスワード
      <input name="password" type="password" autocomplete="current-password" autofocus required>
    </label>
    <button type="submit">ログイン</button>
  </form>
</body>
</html>`);
}

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
  res.end(body);
}

function sendBinary(res, status, buffer, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': buffer.length,
    ...headers,
  });
  res.end(buffer);
}

function isAllowedProxyImageUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return IMAGE_PROXY_ALLOWED_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
  } catch (_) {
    return false;
  }
}

async function proxyExternalImage(req, res, url) {
  const rawUrl = String(url.searchParams.get('url') || '').trim();
  if (!isAllowedProxyImageUrl(rawUrl)) {
    return send(res, 400, { error: '画像URLを表示できません' });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; socora-admin-image-proxy/1.0)',
      },
    });
    if (!response.ok) {
      return send(res, response.status, { error: '画像を取得できません' });
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return send(res, 415, { error: '画像ではありません' });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > IMAGE_PROXY_MAX_BYTES) {
      return send(res, 413, { error: '画像が大きすぎます' });
    }
    return sendBinary(res, 200, buffer, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    });
  } catch (error) {
    return send(res, 502, { error: '画像の取得に失敗しました' });
  } finally {
    clearTimeout(timeout);
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('送信データが大きすぎます。'));
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('送信データが大きすぎます。CSVの対象期間を短くして、分けてアップロードしてください。'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch(e) { reject(new Error('JSONを読み取れません')); }
    });
    req.on('error', reject);
  });
}

async function readLoginBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    return JSON.parse(raw);
  }
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

function httpError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || crypto.randomUUID();
}

function numberOrDefault(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedSourceStockQuantity(value, stockStatus = 'available') {
  if (value !== undefined && value !== null && value !== '') {
    const number = Number(value);
    if (Number.isFinite(number)) return Math.max(0, Math.round(number));
  }
  return stockStatus === 'out' ? SHOPIFY_SOURCE_OUT_OF_STOCK_QTY : SHOPIFY_SOURCE_AVAILABLE_STOCK_QTY;
}

function formatProductNo(number) {
  return `S${String(number).padStart(4, '0')}`;
}

function parseProductNoNumber(value) {
  const match = String(value || '').trim().match(/^s(\d+)$/i);
  if (!match) return 0;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : 0;
}

function normalizeProductNo(value) {
  const raw = String(value || '').trim();
  const number = parseProductNoNumber(raw);
  return number ? formatProductNo(number) : raw;
}

function highestProductNoNumber(products = []) {
  return products.reduce((max, product) => Math.max(max, parseProductNoNumber(product.productNo)), 0);
}

function highestOrderNoNumber(store = {}) {
  const orders = [
    ...(Array.isArray(store.shopifyOrders) ? store.shopifyOrders : []),
    ...(Array.isArray(store.orders) ? store.orders : []),
    ...(Array.isArray(store.orderHistory) ? store.orderHistory : []),
  ];
  return orders.reduce((max, order) => Math.max(
    max,
    orderNumberValue(order.name || order.orderName || order.orderNumber || order.orderNo || order.shopifyOrderName),
  ), 0);
}

function storeSafetySummary(store = {}) {
  const backend = useSupabaseStore() ? 'supabase' : 'local';
  const productCount = Array.isArray(store.products) ? store.products.length : 0;
  const orderCount = [
    ...(Array.isArray(store.shopifyOrders) ? store.shopifyOrders : []),
    ...(Array.isArray(store.orders) ? store.orders : []),
  ].length;
  const maxProductNo = highestProductNoNumber(store.products || []);
  const maxOrderNo = highestOrderNoNumber(store);
  const reasons = [];

  if (backend === 'local' && LOCAL_STORE_GUARD_ENABLED) {
    if (LOCAL_STORE_MIN_PRODUCT_NO > 0 && maxProductNo < LOCAL_STORE_MIN_PRODUCT_NO) {
      reasons.push(`商品データがS${String(LOCAL_STORE_MIN_PRODUCT_NO).padStart(4, '0')}より古い`);
    }
    if (LOCAL_STORE_MIN_ORDER_NO > 0 && maxOrderNo < LOCAL_STORE_MIN_ORDER_NO) {
      reasons.push(`注文データが#${LOCAL_STORE_MIN_ORDER_NO}より古い`);
    }
  }

  return {
    backend,
    sourceLabel: backend === 'supabase' ? '本番DB' : 'ローカル保存',
    isLocalCopy: backend === 'local',
    guardEnabled: LOCAL_STORE_GUARD_ENABLED,
    stale: reasons.length > 0,
    severity: reasons.length > 0 ? 'danger' : backend === 'local' ? 'warn' : 'ok',
    reasons,
    productCount,
    orderCount,
    maxProductNo,
    maxOrderNo,
    expectedMinProductNo: LOCAL_STORE_MIN_PRODUCT_NO,
    expectedMinOrderNo: LOCAL_STORE_MIN_ORDER_NO,
  };
}

function storeStaleMessage(summary = {}) {
  const reasons = Array.isArray(summary.reasons) && summary.reasons.length
    ? `理由: ${summary.reasons.join(' / ')}。`
    : '';
  return `古いローカル保存を読んでいる可能性があるため、保存・反映処理を停止しました。${reasons}先に本番データから復元してください。`;
}

function isWriteIntent(req, url) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  if (req.method !== 'GET') return false;
  if (url.pathname === '/' && url.searchParams.get('x')) return true;
  if (url.pathname === '/system-status-run.html' && url.searchParams.get('product')) return true;
  if ((url.pathname === '/api/integration-health' || url.pathname === '/api/system-status') && url.searchParams.get('runProduct')) return true;
  return false;
}

function nextProductNo(store) {
  const counter = numberOrDefault(store.productNoCounter, PRODUCT_NO_SEED);
  const highest = highestProductNoNumber(store.products);
  return formatProductNo(Math.max(PRODUCT_NO_START, counter + 1, highest + 1));
}

function reserveProductNo(store, productNo) {
  const number = parseProductNoNumber(productNo);
  if (!number) return;
  store.productNoCounter = Math.max(numberOrDefault(store.productNoCounter, PRODUCT_NO_SEED), number);
}

function shippingWeightFromCny(value) {
  const shipping = Number(value || 38);
  if (shipping === 46) return 1;
  if (shipping === 54) return 1.5;
  return 0.5;
}

function normalizeStatus(status) {
  if (status === 'stopped') return 'stopped';
  return 'active';
}

function normalizeRegistrationStage(value) {
  const stage = String(value || '').trim();
  if (stage === 'ready_for_shopify_draft') return 'ready_for_shopify_draft';
  if (stage === 'shopify_draft_created') return 'shopify_draft_created';
  if (stage === 'published') return 'published';
  if (stage === 'archived') return 'archived';
  return 'needs_review';
}

function normalizeShopifyPublishStatus(value) {
  return String(value || '').trim() === 'active' ? 'active' : 'draft';
}

function normalizeLinkStatus(status) {
  if (status === 'broken') return 'broken';
  if (status === 'partial') return 'broken';
  return 'ok';
}

function inferSourceSite(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('taobao.com')) return 'taobao';
  if (text.includes('tmall.com')) return 'tmall';
  return '1688';
}

function normalizeSourceSite(value, sourceUrl = '') {
  const text = String(value || '').toLowerCase();
  if (text.includes('taobao')) return 'taobao';
  if (text.includes('tmall')) return 'tmall';
  if (text.includes('1688')) return '1688';
  return inferSourceSite(sourceUrl);
}

function toYmd(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function isOlderThanDays(value, days) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > days * 24 * 60 * 60 * 1000;
}

function isInventoryCheckStale(check) {
  return Boolean(check?.checkedAt) && isOlderThanDays(check.checkedAt, INVENTORY_CHECK_STALE_DAYS);
}

function canApplyInventoryCheck(check) {
  return Boolean(
    check?.checkedAt
    && Number(check.knownRows || 0) > 0
    && !isInventoryCheckStale(check)
    && !['error', 'protected', 'unknown', 'link_broken'].includes(check.status)
  );
}

function migrateStore(store) {
  let changed = false;
  if (!Array.isArray(store.products)) {
    store.products = [];
    changed = true;
  }
  const migratedCounter = Math.max(
    numberOrDefault(store.productNoCounter, PRODUCT_NO_SEED),
    highestProductNoNumber(store.products),
  );
  if (store.productNoCounter !== migratedCounter) {
    store.productNoCounter = migratedCounter;
    changed = true;
  }
  if (!Array.isArray(store.orderItems)) {
    store.orderItems = [];
    changed = true;
  }
  if (!Array.isArray(store.orderHistory)) {
    store.orderHistory = [];
    changed = true;
  }
  if (!Array.isArray(store.autoOrderHistory)) {
    store.autoOrderHistory = [];
    changed = true;
  }
  if (!Array.isArray(store.inventoryChecks)) {
    store.inventoryChecks = [];
    changed = true;
  }
  if (!Array.isArray(store.shopifyOrders)) {
    store.shopifyOrders = [];
    changed = true;
  }
  const activeShopifyOrders = store.shopifyOrders.filter(order => !isIgnoredShopifyOrder(order));
  if (activeShopifyOrders.length !== store.shopifyOrders.length) {
    store.shopifyOrders = activeShopifyOrders;
    changed = true;
  }
  if (!Array.isArray(store.billingItems)) {
    store.billingItems = [];
    changed = true;
  }
  if (!Array.isArray(store.billingImports)) {
    store.billingImports = [];
    changed = true;
  }
  ['mailStates', 'scheduledEmails', 'gmailOAuth', 'gmailToken'].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(store, key)) {
      delete store[key];
      changed = true;
    }
  });
  store.shopifyOrders.forEach(order => {
    if (order.billingName == null) {
      order.billingName = order.customerName || '';
      changed = true;
    }
    if (order.shippingName == null) {
      order.shippingName = order.customerName || '';
      changed = true;
    }
    ['billingZip', 'billingAddress', 'billingPhone', 'shippingZip', 'shippingAddress', 'shippingPhone'].forEach(key => {
      if (order[key] == null) {
        order[key] = '';
        changed = true;
      }
    });
  });
  store.products.forEach(product => {
    if (!product.localTitle) {
      product.localTitle = product.shopifyTitle || product.title || '';
      changed = true;
    }
    if (!product.sourceTitle) {
      product.sourceTitle = product.originalTitle || '';
      changed = true;
    }
    const normalizedSourceSite = normalizeSourceSite(product.sourceSite, product.sourceUrl);
    if (product.sourceSite !== normalizedSourceSite) {
      product.sourceSite = normalizedSourceSite;
      changed = true;
    }
    if (!product.registeredAt) {
      product.registeredAt = toYmd(product.createdAt) || '';
      changed = true;
    }
    const normalizedStatus = normalizeStatus(product.status);
    if (product.status !== normalizedStatus) {
      product.status = normalizedStatus;
      changed = true;
    }
    const normalizedStage = normalizeRegistrationStage(product.registrationStage);
    if (product.registrationStage !== normalizedStage) {
      product.registrationStage = normalizedStage;
      changed = true;
    }
    const normalizedShopifyPublishStatus = normalizeShopifyPublishStatus(product.shopifyPublishStatus);
    if (product.shopifyPublishStatus !== normalizedShopifyPublishStatus) {
      product.shopifyPublishStatus = normalizedShopifyPublishStatus;
      changed = true;
    }
    const normalizedLinkStatus = normalizeLinkStatus(product.linkStatus);
    if (product.linkStatus !== normalizedLinkStatus) {
      product.linkStatus = normalizedLinkStatus;
      changed = true;
    }
    if (product.linkCheckedAt == null) {
      product.linkCheckedAt = '';
      changed = true;
    }
    if (product.replacementUrl == null) {
      product.replacementUrl = '';
      changed = true;
    }
    if (product.shopifyAdminUrl == null) {
      product.shopifyAdminUrl = '';
      changed = true;
    }
    if (product.shopifyProductId == null) {
      product.shopifyProductId = '';
      changed = true;
    }
    if (product.shopifyProductType == null) {
      product.shopifyProductType = product.productType || '';
      changed = true;
    }
    if (product.shopifyCategory == null) {
      product.shopifyCategory = product.category || product.collectionTitle || '';
      changed = true;
    }
    const normalizedTags = normalizeTagList(product.shopifyTags ?? product.tags);
    if (!Array.isArray(product.shopifyTags) || product.shopifyTags.join(',') !== normalizedTags.join(',')) {
      product.shopifyTags = normalizedTags;
      changed = true;
    }
    if (!Array.isArray(product.shopifyCollections)) {
      product.shopifyCollections = [];
      changed = true;
    }
    if (product.shopifyVendor == null) {
      product.shopifyVendor = product.vendor || 'socora';
      changed = true;
    }
    if (!product.shopifySync || typeof product.shopifySync !== 'object') {
      product.shopifySync = defaultShopifySyncState();
      changed = true;
    } else {
      product.shopifySync = defaultShopifySyncState(product.shopifySync);
    }
    if (product.shopifySnapshot == null) {
      product.shopifySnapshot = null;
      changed = true;
    }
    if (product.inventoryCheck == null) {
      product.inventoryCheck = null;
      changed = true;
    }
    if (!Array.isArray(product.shopifySyncHistory)) {
      product.shopifySyncHistory = [];
      changed = true;
    }
    if (product.registrationType == null) {
      product.registrationType = product.manualEntry ? 'manual' : 'extension';
      changed = true;
    }
    if (product.salePriceJpy == null) {
      product.salePriceJpy = 0;
      changed = true;
    }
    if (product.shippingCny == null) {
      product.shippingCny = 38;
      changed = true;
    }
    if (product.shippingWeightKg == null) {
      product.shippingWeightKg = shippingWeightFromCny(product.shippingCny);
      changed = true;
    }
    if (product.cnyRate == null) {
      product.cnyRate = 24;
      changed = true;
    }
    if (Number(product.feeCny) !== DEFAULT_FEE_CNY) {
      product.feeCny = DEFAULT_FEE_CNY;
      changed = true;
    }
    const cleanMemo = cleanProductMemo(product.memo);
    if (product.memo !== cleanMemo) {
      product.memo = cleanMemo;
      changed = true;
    }
    if (!Array.isArray(product.colors)) {
      product.colors = [];
      changed = true;
    }
    product.colors.forEach(color => {
      if (color.imageUrl == null) {
        color.imageUrl = '';
        changed = true;
      }
      if (!Array.isArray(color.sizes)) {
        color.sizes = [];
        changed = true;
      }
    });
  });
  return changed;
}

function normalizeProduct(input) {
  const now = new Date().toISOString();
  const productNo = normalizeProductNo(input.productNo || input.managementNo || input.id || `local-${Date.now()}`);
  const sourceTitle = input.sourceTitle || input.originalTitle || input.titleCn || input.product?.originalTitle || '';
  const sourceUrl = input.sourceUrl || input.url || input.source?.url || '';
  const product = {
    id: input.id || slug(productNo),
    productNo,
    localTitle: input.localTitle || input.managementTitle || input.shopifyTitle || input.title || input.product?.title || '',
    shopifyTitle: input.shopifyTitle || '',
    sourceTitle,
    originalTitle: sourceTitle,
    sourceSite: normalizeSourceSite(input.sourceSite || input.site || input.source?.site, sourceUrl),
    sourceUrl,
    replacementUrl: input.replacementUrl || '',
    shopifyUrl: input.shopifyUrl || '',
    shopifyAdminUrl: input.shopifyAdminUrl || '',
    shopifyProductId: input.shopifyProductId || '',
    shopifyProductType: input.shopifyProductType || input.productType || '',
    shopifyCategory: input.shopifyCategory || input.category || input.collectionTitle || '',
    shopifyVendor: input.shopifyVendor || input.vendor || 'socora',
    shopifyTags: normalizeTagList(input.shopifyTags ?? input.tags),
    shopifyCollections: Array.isArray(input.shopifyCollections) ? input.shopifyCollections : [],
    shopifyDescriptionHtml: input.shopifyDescriptionHtml || input.descriptionHtml || input.product?.description || '',
    descriptionSourceText: input.descriptionSourceText || input.sourceDescription || input.originalDescription || '',
    sourceSnapshot: input.sourceSnapshot || input.sourceData || input.rawSourceData || null,
    inventoryCheck: input.inventoryCheck || null,
    imageProcessing: input.imageProcessing || null,
    modelImageNote: input.modelImageNote || '',
    registrationStage: normalizeRegistrationStage(input.registrationStage),
    registrationSource: input.registrationSource || (input.registrationType === 'manual' || input.manualEntry ? 'manual_web' : 'chrome_extension'),
    shopifyPublishStatus: normalizeShopifyPublishStatus(input.shopifyPublishStatus || input.product?.status),
    compareAtPriceJpy: numberOrDefault(input.compareAtPriceJpy ?? input.pricing?.compareAtPriceJpy, 0),
    inventoryPerVariant: numberOrDefault(input.inventoryPerVariant ?? input.product?.inventoryPerVariant, 0),
    capturedAt: input.capturedAt || input.exportedAt || now,
    shopifySnapshot: input.shopifySnapshot || null,
    shopifySync: defaultShopifySyncState(input.shopifySync || {}),
    shopifySyncHistory: Array.isArray(input.shopifySyncHistory) ? input.shopifySyncHistory.slice(0, 50) : [],
    registrationType: input.registrationType === 'manual' || input.manualEntry ? 'manual' : 'extension',
    status: normalizeStatus(input.status || input.product?.status),
    registeredAt: input.registeredAt || toYmd(input.createdAt) || now.slice(0, 10),
    linkStatus: normalizeLinkStatus(input.linkStatus),
    linkCheckedAt: input.linkCheckedAt || '',
    costCny: numberOrDefault(input.costCny ?? input.sourcePriceCny ?? input.pricing?.costCny, 0),
    salePriceJpy: numberOrDefault(input.salePriceJpy ?? input.pricing?.salePriceJpy, 0),
    shippingCny: numberOrDefault(input.shippingCny ?? input.pricing?.shippingCny, 38),
    shippingWeightKg: numberOrDefault(input.shippingWeightKg, shippingWeightFromCny(input.shippingCny ?? input.pricing?.shippingCny)),
    cnyRate: numberOrDefault(input.cnyRate ?? input.pricing?.cnyRate, 24),
    feeCny: DEFAULT_FEE_CNY,
    memo: cleanProductMemo(input.memo),
    createdAt: input.createdAt || now,
    updatedAt: now,
    colors: [],
  };

  if (Array.isArray(input.colors)) {
    product.colors = input.colors.map(normalizeColor);
  } else if (Array.isArray(input.variantRows)) {
    product.colors = groupVariantRows(input.variantRows);
  } else if (Array.isArray(input.variants)) {
    product.colors = variantsToColors(input.variants, product.productNo);
  }

  return product;
}

function normalizeTagList(value) {
  if (Array.isArray(value)) {
    return uniqueSorted(value.flatMap(item => normalizeTagList(item)));
  }
  return String(value || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
    .filter((tag, index, list) => list.findIndex(item => item.toLowerCase() === tag.toLowerCase()) === index);
}

function uniqueSorted(values) {
  const seen = new Set();
  return values
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, 'ja', { numeric: true, sensitivity: 'base' }));
}

function normalizeCollectionList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(item => ({
    id: String(item?.id || '').trim(),
    title: String(item?.title || item?.name || item || '').trim(),
    handle: String(item?.handle || '').trim(),
  })).filter(item => {
    if (!item.title) return false;
    const key = normalizedCompareText(item.title || item.handle || item.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.title.localeCompare(b.title, 'ja', { numeric: true, sensitivity: 'base' }));
}

function normalizeColor(color) {
  const originalColor = color.originalColor || color.cnColor || color.colorOriginal || color.name || '';
  const colorJa = color.colorJa || color.jaColor || color.translatedColor || originalColor;
  return {
    id: color.id || slug(originalColor || colorJa),
    originalColor,
    colorJa,
    colorCode: color.colorCode || color.code || '',
    colorHex: color.colorHex || color.hex || '',
    imageUrl: color.imageUrl || color.image || '',
    localImagePath: color.localImagePath || '',
    memo: color.memo || '',
    sizes: (color.sizes || []).map(size => {
      const stockStatus = size.stockStatus || (size.outOfStock ? 'out' : 'available');
      return {
        id: size.id || slug(`${originalColor}-${size.originalSize || size.sizeJa || size.name}`),
        originalSize: size.originalSize || size.cnSize || size.sizeOriginal || size.name || '',
        sizeJa: size.sizeJa || size.jaSize || size.translatedSize || size.originalSize || size.name || '',
        sku: size.sku || '',
        shopifySku: size.shopifySku || '',
        shopifyVariantId: size.shopifyVariantId || '',
        stockStatus,
        stockQuantity: normalizedSourceStockQuantity(size.stockQuantity ?? size.inventoryQuantity ?? size.quantity, stockStatus),
        memo: size.memo || '',
      };
    }),
  };
}

function groupVariantRows(rows) {
  const map = new Map();
  rows.forEach(row => {
    const key = row.originalColor || row.cnColor || row.colorJa || 'default';
    if (!map.has(key)) {
      map.set(key, normalizeColor({
        originalColor: row.originalColor || row.cnColor || '',
        colorJa: row.colorJa || row.jaColor || row.originalColor || '',
        imageUrl: row.imageUrl || '',
        sizes: [],
      }));
    }
    const color = map.get(key);
    color.sizes.push({
      id: row.id || slug(`${key}-${row.originalSize || row.cnSize || row.sizeJa}`),
      originalSize: row.originalSize || row.cnSize || '',
      sizeJa: row.sizeJa || row.jaSize || row.originalSize || '',
      sku: row.sku || '',
      stockStatus: row.stockStatus || 'available',
      stockQuantity: normalizedSourceStockQuantity(row.stockQuantity ?? row.inventoryQuantity ?? row.quantity, row.stockStatus || 'available'),
      memo: row.memo || '',
    });
  });
  return [...map.values()];
}

function variantsToColors(variants, productNo) {
  const colorVariant = variants.find(v => /color|カラー|颜色|色/i.test(v.label || v.jaLabel || v.name || ''));
  const sizeVariant = variants.find(v => /size|サイズ|尺码|尺寸/i.test(v.label || v.jaLabel || v.name || ''));
  const colorValues = colorVariant?.values || colorVariant?.jaValues || [''];
  const sizeValues = sizeVariant?.values || sizeVariant?.jaValues || [''];
  return colorValues.map(color => normalizeColor({
    originalColor: color,
    colorJa: color,
    sizes: sizeValues.map(size => ({
      originalSize: size,
      sizeJa: size,
      sku: [productNo, color, size].filter(Boolean).join('-'),
      stockStatus: 'available',
      stockQuantity: SHOPIFY_SOURCE_AVAILABLE_STOCK_QTY,
    })),
  }));
}

function updateProduct(store, id, updates) {
  const index = store.products.findIndex(p => p.id === id);
  if (index < 0) return null;
  const normalizedUpdates = { ...updates };
  if ('memo' in normalizedUpdates) {
    normalizedUpdates.memo = cleanProductMemo(normalizedUpdates.memo);
  }
  if ('shopifyTags' in normalizedUpdates || 'tags' in normalizedUpdates) {
    normalizedUpdates.shopifyTags = normalizeTagList(normalizedUpdates.shopifyTags ?? normalizedUpdates.tags);
  }
  if ('shopifyCollections' in normalizedUpdates) {
    normalizedUpdates.shopifyCollections = normalizeCollectionList(normalizedUpdates.shopifyCollections);
  }
  store.products[index] = {
    ...store.products[index],
    ...normalizedUpdates,
    id,
    updatedAt: new Date().toISOString(),
  };
  return store.products[index];
}

function canonicalSourceUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text);
    parsed.hash = '';
    ['spm', 'from', 'scene', 'clickid', 'trackInfo', 'tracelog'].forEach(key => parsed.searchParams.delete(key));
    return parsed.toString().replace(/\/+$/, '');
  } catch (_) {
    return text.replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

function sourceUrlItemId(value) {
  const text = String(value || '');
  return text.match(/\/offer\/(\d+)/i)?.[1]
    || text.match(/[?&](?:id|itemId|offerId)=(\d+)/i)?.[1]
    || '';
}

function sourceUrlsMatch(a, b) {
  const leftId = sourceUrlItemId(a);
  const rightId = sourceUrlItemId(b);
  if (leftId && rightId && leftId === rightId) return true;
  const left = canonicalSourceUrl(a);
  const right = canonicalSourceUrl(b);
  return Boolean(left && right && left === right);
}

function sameProductIdentity(product, idOrNo) {
  const key = String(idOrNo || '').trim();
  if (!product || !key) return false;
  return product.id === key || normalizeProductNo(product.productNo) === normalizeProductNo(key);
}

function duplicateProductSummary(product) {
  if (!product) return null;
  return {
    id: product.id || '',
    productNo: product.productNo || '',
    title: product.localTitle || product.shopifyTitle || product.sourceTitle || product.originalTitle || '',
    sourceUrl: product.sourceUrl || '',
    shopifyAdminUrl: product.shopifyAdminUrl || '',
    shopifyUrl: product.shopifyUrl || '',
  };
}

function findSourceUrlDuplicateProduct(store, sourceUrl, excludeIdOrNo = '') {
  if (!sourceUrl) return null;
  return (store.products || []).find(product => {
    if (!product?.sourceUrl) return false;
    if (excludeIdOrNo && sameProductIdentity(product, excludeIdOrNo)) return false;
    return sourceUrlsMatch(product.sourceUrl, sourceUrl);
  }) || null;
}

function makeSourceUrlDuplicateError(duplicate, sourceUrl) {
  const summary = duplicateProductSummary(duplicate);
  const label = `${summary?.productNo || summary?.id || ''} ${summary?.title || ''}`.trim() || '既存商品';
  const error = new Error(`同じ仕入れ元URLの商品が既に登録されています: ${label}。重複登録を止めました。既存商品を確認してください。`);
  error.status = 409;
  error.code = 'SOURCE_URL_DUPLICATE';
  error.duplicateProduct = summary;
  error.sourceUrl = sourceUrl || '';
  return error;
}

function ensureNoSourceUrlDuplicate(store, product, excludeIdOrNo = '') {
  const sourceUrl = product?.sourceUrl || '';
  const duplicate = findSourceUrlDuplicateProduct(store, sourceUrl, excludeIdOrNo || product?.id || product?.productNo || '');
  if (duplicate) throw makeSourceUrlDuplicateError(duplicate, sourceUrl);
}

function productDuplicateCheck(store, input = {}) {
  const sourceUrl = input.sourceUrl || input.url || '';
  const productNo = normalizeProductNo(input.productNo || input.managementNo || '');
  const excludeIdOrNo = String(input.excludeId || input.excludeProductNo || '').trim();
  const sourceUrlDuplicate = findSourceUrlDuplicateProduct(store, sourceUrl, excludeIdOrNo);
  const productNoDuplicate = productNo
    ? (store.products || []).find(product => (
      normalizeProductNo(product.productNo) === productNo
      && !(excludeIdOrNo && sameProductIdentity(product, excludeIdOrNo))
    )) || null
    : null;
  return {
    duplicate: Boolean(sourceUrlDuplicate || productNoDuplicate),
    sourceUrlDuplicate: duplicateProductSummary(sourceUrlDuplicate),
    productNoDuplicate: duplicateProductSummary(productNoDuplicate),
  };
}

function findProductForInventoryCheck(store, input = {}) {
  const productNo = normalizeProductNo(input.productNo || input.managementNo || '');
  const sourceUrl = input.sourceUrl || input.url || '';
  if (productNo) {
    const byNo = (store.products || []).find(product => normalizeProductNo(product.productNo) === productNo);
    if (!byNo) return null;
    if (sourceUrl && byNo.sourceUrl && !sourceUrlsMatch(byNo.sourceUrl, sourceUrl)) {
      const pageProduct = (store.products || []).find(product => sourceUrlsMatch(product.sourceUrl, sourceUrl));
      const pageLabel = pageProduct
        ? `${pageProduct.productNo || ''} ${pageProduct.localTitle || pageProduct.shopifyTitle || pageProduct.sourceTitle || ''}`.trim()
        : '商品マスターにないページ';
      const targetLabel = `${byNo.productNo || ''} ${byNo.localTitle || byNo.shopifyTitle || byNo.sourceTitle || ''}`.trim();
      const error = new Error(`在庫保存を拒否しました。現在ページは「${pageLabel}」、保存対象は「${targetLabel}」です。対象商品の1688/Taobaoページを開き直してください。`);
      error.status = 409;
      throw error;
    }
    return byNo;
  }
  if (sourceUrl) {
    return (store.products || []).find(product => sourceUrlsMatch(product.sourceUrl, sourceUrl)) || null;
  }
  return null;
}

function activeInventoryProducts(store = {}) {
  return (store.products || []).filter(product => {
    if (!product.sourceUrl) return false;
    return product.shopifyPublishStatus === 'active'
      || product.registrationStage === 'published'
      || product.registrationStage === 'archived'
      || Boolean(product.shopifyUrl || product.shopifyProductId || product.shopifyAdminUrl);
  });
}

function inventoryShopifyStatus(product = {}) {
  const syncText = [
    product.shopifySync?.status,
    product.shopifySync?.lastSummary,
    product.shopifyStatusLabel,
  ].filter(Boolean).join(' ');
  if (/アーカイブ|ARCHIVED/i.test(syncText)) return 'archived';
  if (/下書き|DRAFT/i.test(syncText)) return 'draft';
  if (/未存在|見つかりません|NOT_FOUND|DELETED|MISSING/i.test(syncText)) return 'missing';
  if (product.registrationStage === 'archived') return 'archived';
  if (normalizeStatus(product.status) === 'stopped') return 'stopped';
  const snapshotStatus = String(product.shopifySnapshot?.status || '').toUpperCase();
  if (snapshotStatus === 'ARCHIVED') return 'archived';
  if (snapshotStatus === 'DRAFT') return 'draft';
  if (snapshotStatus === 'ACTIVE') return 'active';
  if (['NOT_FOUND', 'DELETED', 'MISSING'].includes(snapshotStatus)) return 'missing';
  return normalizeShopifyPublishStatus(product.shopifyPublishStatus) === 'active' ? 'active' : 'draft';
}

function inventoryShopifyStatusLabel(status) {
  if (status === 'active') return '公開中';
  if (status === 'archived') return 'アーカイブ済み';
  if (status === 'draft') return '下書き';
  if (status === 'missing') return 'Shopify未存在';
  if (status === 'stopped') return '停止中';
  return '要確認';
}

function inventoryVariantGroups(product) {
  return (product.colors || []).map(color => {
    const sizes = Array.isArray(color.sizes) ? color.sizes : [];
    return {
      colorId: color.id || '',
      color: color.colorJa || color.originalColor || 'カラー未設定',
      originalColor: color.originalColor || '',
      imageUrl: color.imageUrl || '',
      sizes: sizes.map(size => {
        const sourceCheckedAt = size.sourceStockCheckedAt || '';
        const hasSourceStock = Boolean(sourceCheckedAt && size.sourceStockQuantity != null);
        return {
          size: size.sizeJa || size.originalSize || 'ONE',
          originalSize: size.originalSize || '',
          sku: size.sku || size.shopifySku || '',
          stockQuantity: hasSourceStock ? size.sourceStockQuantity : null,
          stockStatus: hasSourceStock ? (size.stockStatus || '') : '',
          checkedAt: sourceCheckedAt,
        };
      }),
    };
  }).filter(group => group.sizes.length);
}

function inventoryCheckTarget(product) {
  const rows = product ? productVariantRows(product) : [];
  const shopifyStatus = inventoryShopifyStatus(product);
  const sellingUrl = product.shopifyUrl || shopifyStorefrontUrl(expectedShopifyHandle(product)) || '';
  return {
    id: product.id || '',
    productNo: product.productNo || '',
    title: product.localTitle || product.shopifyTitle || product.sourceTitle || '',
    sourceSite: product.sourceSite || '',
    sourceUrl: product.sourceUrl || '',
    shopifyUrl: sellingUrl,
    sellingUrl,
    shopifyAdminUrl: product.shopifyAdminUrl || '',
    status: normalizeStatus(product.status),
    registrationStage: product.registrationStage || '',
    shopifyPublishStatus: product.shopifyPublishStatus || '',
    shopifyStatus,
    shopifyStatusLabel: inventoryShopifyStatusLabel(shopifyStatus),
    shopifyStatusCheckedAt: product.shopifySync?.lastCheckedAt || product.shopifySnapshot?.fetchedAt || '',
    linkStatus: product.linkStatus || '',
    linkCheckedAt: product.linkCheckedAt || '',
    memo: cleanProductMemo(product.memo),
    shopifySync: {
      status: product.shopifySync?.status || '',
      lastCheckedAt: product.shopifySync?.lastCheckedAt || '',
      appliedAt: product.shopifySync?.appliedAt || '',
      lastSummary: product.shopifySync?.lastSummary || '',
      lastError: product.shopifySync?.lastError || '',
    },
    lastInventoryCheck: product.inventoryCheck || null,
    skuCount: rows.filter(row => row.size?.sku || row.size?.shopifySku).length,
    variants: inventoryVariantGroups(product),
  };
}

function normalizeInventoryStock(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  const text = String(value).replace(/,/g, '').trim();
  if (!text) return null;
  if (/库存不足|缺货|售罄|无货|在庫なし|out/i.test(text)) return 0;
  const match = text.match(/-?\d+/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function normalizeInventoryPart(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[()（）【】\[\]{}]/g, '')
    .toLowerCase();
}

function normalizeInventorySkuRows(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 1000).map(row => {
    const spec = String(row.spec || row.name || row.specAttrs || '').trim();
    const parts = Array.isArray(row.parts) && row.parts.length
      ? row.parts.map(part => String(part || '').trim()).filter(Boolean)
      : spec.split('>').map(part => String(part || '').trim()).filter(Boolean);
    const stockNumber = normalizeInventoryStock(row.stockNumber ?? row.stock ?? row.inventory ?? row.quantity ?? row.stockRaw);
    return {
      spec,
      parts,
      color: String(row.color || parts[0] || '').trim(),
      size: String(row.size || parts[1] || '').trim(),
      price: String(row.price || '').trim(),
      stockRaw: String(row.stock ?? row.stockRaw ?? row.inventory ?? row.quantity ?? '').trim(),
      stockNumber,
      outOfStock: stockNumber === 0 || Boolean(row.outOfStock),
    };
  }).filter(row => row.spec || row.parts.length || row.stockRaw || row.price);
}

function productVariantRows(product) {
  return (product.colors || []).flatMap(color => {
    const sizes = Array.isArray(color.sizes) && color.sizes.length ? color.sizes : [{ id: 'default', originalSize: '', sizeJa: '', sku: '' }];
    return sizes.map(size => ({ product, color, size }));
  });
}

function inventoryRowMatchesVariant(row, color, size) {
  const parts = (row.parts || []).map(normalizeInventoryPart).filter(Boolean);
  const colorKeys = [color.originalColor, color.colorJa].map(normalizeInventoryPart).filter(Boolean);
  const sizeKeys = [size.originalSize, size.sizeJa].map(normalizeInventoryPart).filter(Boolean);
  const colorMatch = !colorKeys.length || parts.some(part => colorKeys.some(key => part === key || part.includes(key) || key.includes(part)));
  const sizeMatch = !sizeKeys.length || parts.some(part => sizeKeys.some(key => part === key || part.includes(key) || key.includes(part)));
  return colorMatch && sizeMatch;
}

function applyInventoryRowsToProduct(product, skuRows) {
  let updated = 0;
  let matched = 0;
  productVariantRows(product).forEach(({ color, size }) => {
    const row = skuRows.find(candidate => inventoryRowMatchesVariant(candidate, color, size));
    if (!row || row.stockNumber == null) return;
    matched += 1;
    size.stockQuantity = row.stockNumber;
    size.sourceStockQuantity = row.stockNumber;
    size.sourceStockCheckedAt = new Date().toISOString();
    size.stockStatus = row.stockNumber <= 0 ? 'out' : 'available';
    updated += 1;
  });
  return { updated, matched };
}

function inventoryProductSnapshot(product) {
  if (!product) return [];
  return productVariantRows(product).map(({ color, size }) => ({
    key: size.sku || `${color.originalColor || color.colorJa || ''}|${size.originalSize || size.sizeJa || ''}`,
    sku: size.sku || '',
    color: color.colorJa || color.originalColor || '',
    size: size.sizeJa || size.originalSize || '',
    stockQuantity: size.stockQuantity ?? size.sourceStockQuantity ?? null,
    stockStatus: size.stockStatus || '',
  }));
}

function valueForChange(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

function buildInventoryCheckChanges({ beforeCheck, afterCheck, beforeRows, afterRows, beforeLinkStatus, afterLinkStatus }) {
  const changes = [];
  const beforeStatus = beforeCheck?.statusLabel || beforeCheck?.status || '';
  const afterStatus = afterCheck?.statusLabel || afterCheck?.status || '';
  if (valueForChange(beforeStatus) !== valueForChange(afterStatus)) {
    changes.push({ field: 'inventoryStatus', label: '在庫判定', before: beforeStatus, after: afterStatus });
  }
  if (valueForChange(beforeLinkStatus) !== valueForChange(afterLinkStatus)) {
    changes.push({ field: 'linkStatus', label: '仕入れURL状態', before: beforeLinkStatus, after: afterLinkStatus });
  }
  const beforeByKey = new Map((beforeRows || []).map(row => [row.key, row]));
  (afterRows || []).forEach(row => {
    const before = beforeByKey.get(row.key);
    if (!before) return;
    if (valueForChange(before.stockQuantity) !== valueForChange(row.stockQuantity)) {
      changes.push({
        field: 'stockQuantity',
        label: '在庫数',
        sku: row.sku,
        color: row.color,
        size: row.size,
        before: before.stockQuantity,
        after: row.stockQuantity,
      });
    }
    if (valueForChange(before.stockStatus) !== valueForChange(row.stockStatus)) {
      changes.push({
        field: 'stockStatus',
        label: 'SKU状態',
        sku: row.sku,
        color: row.color,
        size: row.size,
        before: before.stockStatus,
        after: row.stockStatus,
      });
    }
  });
  return changes.slice(0, 200);
}

function inventoryChangeSummary(changes = []) {
  if (!changes.length) return '変更なし';
  return changes.slice(0, 5).map(change => {
    const sku = change.sku ? `${change.sku} ` : '';
    const before = valueForChange(change.before) || 'なし';
    const after = valueForChange(change.after) || 'なし';
    return `${sku}${change.label || change.field}: ${before} → ${after}`;
  }).join(' / ') + (changes.length > 5 ? ` / ほか${changes.length - 5}件` : '');
}

function summarizeInventoryRows(skuRows, input = {}) {
  if (input.pageStatus === 'link_broken') {
    return {
      status: 'link_broken',
      label: 'リンク切れ',
      totalStock: null,
      knownRows: 0,
      outRows: 0,
      availableRows: 0,
    };
  }
  if (input.error || input.pageStatus === 'error' || input.pageStatus === 'protected') {
    return {
      status: input.pageStatus === 'protected' ? 'protected' : 'error',
      label: input.pageStatus === 'protected' ? '認証/保護' : '取得失敗',
      totalStock: null,
      knownRows: 0,
      outRows: 0,
      availableRows: 0,
    };
  }
  const known = skuRows.filter(row => row.stockNumber != null);
  const totalStock = known.reduce((sum, row) => sum + Number(row.stockNumber || 0), 0);
  const outRows = known.filter(row => Number(row.stockNumber || 0) <= 0).length;
  const availableRows = known.filter(row => Number(row.stockNumber || 0) > 0).length;
  let status = 'unknown';
  let label = '要確認';
  if (known.length) {
    if (availableRows > 0 && outRows > 0) {
      status = 'partial';
      label = '一部在庫なし';
    } else if (availableRows > 0) {
      status = 'available';
      label = '在庫あり';
    } else {
      status = 'out';
      label = '在庫なし';
    }
  }
  return { status, label, totalStock, knownRows: known.length, outRows, availableRows };
}

function recordInventoryCheck(store, input = {}) {
  const now = new Date().toISOString();
  const product = findProductForInventoryCheck(store, input);
  const beforeCheck = product?.inventoryCheck ? { ...product.inventoryCheck } : null;
  const beforeLinkStatus = product?.linkStatus || '';
  const beforeRows = inventoryProductSnapshot(product);
  const skuRows = normalizeInventorySkuRows(input.skuStocks || input.skus || input.rows || []);
  const summary = summarizeInventoryRows(skuRows, input);
  const matchResult = product ? applyInventoryRowsToProduct(product, skuRows) : { updated: 0, matched: 0 };
  const check = {
    id: crypto.randomUUID(),
    checkedAt: input.checkedAt || now,
    productId: product?.id || '',
    productNo: product?.productNo || normalizeProductNo(input.productNo || ''),
    title: product?.localTitle || product?.shopifyTitle || input.title || '',
    sourceSite: input.sourceSite || input.site || product?.sourceSite || '',
    sourceUrl: input.sourceUrl || input.url || product?.sourceUrl || '',
    pageStatus: input.pageStatus || (input.error ? 'error' : 'ok'),
    status: summary.status,
    statusLabel: summary.label,
    totalStock: summary.totalStock,
    knownRows: summary.knownRows,
    outRows: summary.outRows,
    availableRows: summary.availableRows,
    matchedVariants: matchResult.matched,
    updatedVariants: matchResult.updated,
    error: input.error || '',
    rows: skuRows.slice(0, 1000),
  };
  const nextLinkStatus = check.status === 'link_broken'
    ? 'broken'
    : (!['error', 'protected'].includes(check.status) ? 'ok' : beforeLinkStatus);
  const afterRows = inventoryProductSnapshot(product);
  check.changes = buildInventoryCheckChanges({
    beforeCheck,
    afterCheck: check,
    beforeRows,
    afterRows,
    beforeLinkStatus,
    afterLinkStatus: nextLinkStatus,
  });
  check.changeSummary = inventoryChangeSummary(check.changes);

  store.inventoryChecks = [check, ...(store.inventoryChecks || [])].slice(0, 3000);
  if (product) {
    product.inventoryCheck = {
      id: check.id,
      checkedAt: check.checkedAt,
      status: check.status,
      statusLabel: check.statusLabel,
      totalStock: check.totalStock,
      knownRows: check.knownRows,
      outRows: check.outRows,
      availableRows: check.availableRows,
      matchedVariants: check.matchedVariants,
      updatedVariants: check.updatedVariants,
      error: check.error,
      changes: check.changes,
      changeSummary: check.changeSummary,
    };
    product.linkCheckedAt = check.checkedAt.slice(0, 10);
    if (check.status === 'link_broken') product.linkStatus = 'broken';
    else if (!['error', 'protected'].includes(check.status)) product.linkStatus = 'ok';
    product.updatedAt = now;
  }
  return { check, product };
}

function latestInventoryChecksByProduct(store = {}) {
  const map = new Map();
  (store.inventoryChecks || []).forEach(check => {
    const key = check.productNo || check.productId || check.sourceUrl || check.id;
    if (key && !map.has(key)) map.set(key, check);
  });
  return map;
}

function inventoryChecksForResponse(store = {}) {
  const latest = latestInventoryChecksByProduct(store);
  const targets = activeInventoryProducts(store).map(product => {
    const key = product.productNo || product.id || product.sourceUrl;
    const latestCheck = latest.get(key) || product.inventoryCheck || null;
    return {
      ...inventoryCheckTarget(product),
      latestCheck: latestCheck ? {
        ...latestCheck,
        stale: isInventoryCheckStale(latestCheck),
      } : null,
    };
  });
  return {
    targets,
    checks: (store.inventoryChecks || []).slice(0, 500),
    shopifyConnection: shopifyConnectionStatus(),
    summary: {
      targetCount: targets.length,
      checkedCount: targets.filter(item => item.latestCheck?.checkedAt).length,
      availableCount: targets.filter(item => !item.latestCheck?.stale && (item.latestCheck?.status === 'available' || item.latestCheck?.status === 'partial')).length,
      outCount: targets.filter(item => !item.latestCheck?.stale && item.latestCheck?.status === 'out').length,
      errorCount: targets.filter(item => item.latestCheck?.stale || ['error', 'protected', 'unknown', 'link_broken'].includes(item.latestCheck?.status)).length,
    },
  };
}

function createInventoryWorkbook(store) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const id = crypto.randomUUID();
  const jsonFile = path.join(EXPORT_DIR, `inventory_checks_${stamp}_${id}.json`);
  const outFile = path.join(EXPORT_DIR, `inventory_checks_${stamp}.xlsx`);
  fs.writeFileSync(jsonFile, JSON.stringify(inventoryChecksForResponse(store), null, 2));
  const result = spawnSync(PYTHON, [INVENTORY_EXPORT_SCRIPT, jsonFile, outFile], {
    encoding: 'utf8',
    maxBuffer: 10_000_000,
  });
  fs.rmSync(jsonFile, { force: true });
  if (result.status !== 0) {
    const error = new Error((result.stderr || result.stdout || '在庫確認Excelを作成できませんでした').trim());
    error.status = 500;
    throw error;
  }
  return outFile;
}

async function applyInventoryCheckToShopify(store, input = {}) {
  const product = findProductForInventoryCheck(store, input)
    || (store.products || []).find(item => item.id === input.id || item.productNo === input.id);
  if (!product) {
    const error = new Error('商品が見つかりません');
    error.status = 404;
    throw error;
  }
  const check = product.inventoryCheck || null;
  if (!check?.checkedAt || !Number(check.knownRows || 0)) {
    const error = new Error('在庫確認済みのSKUがありません。先にChrome拡張で在庫確認を保存してください。');
    error.status = 400;
    throw error;
  }
  if (['error', 'protected', 'unknown', 'link_broken'].includes(check.status)) {
    const error = new Error(`在庫確認結果が「${check.statusLabel || check.status}」のためShopifyへ反映できません。`);
    error.status = 400;
    throw error;
  }
  if (isInventoryCheckStale(check)) {
    const error = new Error('最終確認から2週間を過ぎているためShopifyへ反映できません。Chrome拡張で在庫を確認し直してください。');
    error.status = 400;
    throw error;
  }
  const existing = await fetchShopifyProductForLocalProduct(product);
  if (!existing.snapshot) {
    const error = new Error('Shopify商品が見つかりません。先にShopify照合または商品登録を確認してください。');
    error.status = 404;
    throw error;
  }
  const appliedAt = new Date().toISOString();
  const rows = productRowsForShopifyCreate(product);
  const inventorySync = await syncShopifyInventoryRuleForRegistration(product, existing.snapshot, rows);
  const snapshot = inventorySync.snapshot || existing.snapshot;
  const result = compareShopifyProduct(product, snapshot, existing.duplicates || []);
  const trackingErrors = inventorySync.tracking?.errors || [];
  updateShopifySyncState(product, result, snapshot, {
    status: inventorySync.missing?.length || trackingErrors.length ? '要確認' : 'Shopify在庫追跡OFF確認済み',
    appliedAt,
  });
  addShopifySyncHistory(
    product,
    '在庫確認をShopifyへ反映',
    result,
    [
      `在庫確認 ${check.checkedAt}`,
      inventorySync.skipped ? (inventorySync.reason || 'Shopify販売可能数は変更していません') : `反映SKU ${inventorySync.updated || 0}件`,
      inventorySync.tracking ? `在庫追跡${inventorySync.tracking.tracked ? 'ON' : 'OFF'}確認 ${inventorySync.tracking.updated || 0}件` : '',
      inventorySync.missing?.length ? `未照合 ${inventorySync.missing.slice(0, 5).join(' / ')}` : '',
      trackingErrors.length ? `追跡設定エラー ${trackingErrors.slice(0, 3).join(' / ')}` : '',
    ].filter(Boolean).join(' / ')
  );
  product.inventoryCheck = {
    ...product.inventoryCheck,
    shopifyAppliedAt: appliedAt,
    shopifyAppliedCount: inventorySync.updated || 0,
    shopifyMissing: inventorySync.missing || [],
    shopifyLastError: trackingErrors.join(' / '),
  };
  const checks = store.inventoryChecks || [];
  const checkIndex = checks.findIndex(item => item.id === check.id);
  if (checkIndex >= 0) {
    checks[checkIndex] = {
      ...checks[checkIndex],
      shopifyAppliedAt: appliedAt,
      shopifyAppliedCount: inventorySync.updated || 0,
      shopifyMissing: inventorySync.missing || [],
      shopifyLastError: trackingErrors.join(' / '),
    };
    store.inventoryChecks = checks;
  }
  product.updatedAt = new Date().toISOString();
  return {
    product,
    check: product.inventoryCheck,
    inventory: inventorySync,
    snapshot,
    result: product.shopifySync?.lastResult || result,
  };
}

async function applyInventoryChecksToShopifyBulk(store, input = {}) {
  const productNos = new Set(
    (Array.isArray(input.productNos) ? input.productNos : [])
      .map(normalizeProductNo)
      .filter(Boolean)
  );
  const candidates = activeInventoryProducts(store)
    .filter(product => !productNos.size || productNos.has(normalizeProductNo(product.productNo)))
    .filter(product => inventoryShopifyStatus(product) === 'active')
    .filter(product => canApplyInventoryCheck(product.inventoryCheck));
  const results = [];
  for (const product of candidates) {
    try {
      const result = await applyInventoryCheckToShopify(store, { productNo: product.productNo });
      results.push({
        ok: true,
        productNo: product.productNo,
        title: product.localTitle || product.shopifyTitle || product.sourceTitle || '',
        appliedCount: result.inventory?.updated || result.check?.shopifyAppliedCount || 0,
        missingCount: result.inventory?.missing?.length || 0,
      });
    } catch (error) {
      results.push({
        ok: false,
        productNo: product.productNo,
        title: product.localTitle || product.shopifyTitle || product.sourceTitle || '',
        error: error.message,
      });
    }
  }
  return {
    ok: true,
    total: candidates.length,
    successCount: results.filter(result => result.ok).length,
    failedCount: results.filter(result => !result.ok).length,
    skippedCount: Math.max(0, activeInventoryProducts(store).length - candidates.length),
    results,
  };
}

async function refreshInventoryShopifyStatuses(store, input = {}) {
  const productNos = new Set(
    (Array.isArray(input.productNos) ? input.productNos : [])
      .map(normalizeProductNo)
      .filter(Boolean)
  );
  const candidates = activeInventoryProducts(store)
    .filter(product => !productNos.size || productNos.has(normalizeProductNo(product.productNo)))
    .filter(product => product.shopifyProductId || product.shopifyAdminUrl || product.shopifyUrl);
  const results = [];
  for (const product of candidates) {
    try {
      const beforeStatus = inventoryShopifyStatus(product);
      const reconciled = await reconcileShopifyProduct(store, product.id);
      const afterStatus = inventoryShopifyStatus(reconciled.product);
      results.push({
        ok: true,
        productNo: product.productNo,
        title: product.localTitle || product.shopifyTitle || product.sourceTitle || '',
        beforeStatus,
        afterStatus,
        statusLabel: inventoryShopifyStatusLabel(afterStatus),
      });
    } catch (error) {
      results.push({
        ok: false,
        productNo: product.productNo,
        title: product.localTitle || product.shopifyTitle || product.sourceTitle || '',
        error: error.message,
      });
    }
  }
  return {
    ok: true,
    total: candidates.length,
    successCount: results.filter(result => result.ok).length,
    failedCount: results.filter(result => !result.ok).length,
    activeCount: results.filter(result => result.afterStatus === 'active').length,
    archivedCount: results.filter(result => result.afterStatus === 'archived').length,
    draftCount: results.filter(result => result.afterStatus === 'draft' || result.afterStatus === 'stopped').length,
    results,
  };
}

function completeOrder(store, input = {}) {
  const items = Array.isArray(input.orderItems) ? input.orderItems : store.orderItems || [];
  if (!items.length) return null;
  const now = new Date().toISOString();
  const history = {
    id: crypto.randomUUID(),
    orderedAt: input.orderedAt || now,
    memo: input.memo || '',
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
    items: JSON.parse(JSON.stringify(items)),
  };
  store.orderHistory = [history, ...(store.orderHistory || [])];
  store.orderItems = [];

  return history;
}

function recordAutoOrderHistory(store, preview, input = {}) {
  const items = Array.isArray(preview.items) ? preview.items : [];
  if (!items.length) return null;
  const now = new Date().toISOString();
  const history = {
    id: crypto.randomUUID(),
    orderedAt: input.orderedAt || now,
    source: input.source || 'banri',
    csvHash: input.csv ? crypto.createHash('sha1').update(String(input.csv)).digest('hex') : '',
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    totalCny: Number(items.reduce((sum, item) => sum + Number(item.totalCny || 0), 0).toFixed(2)),
    items: JSON.parse(JSON.stringify(items)),
  };
  store.autoOrderHistory = [history, ...(store.autoOrderHistory || [])];
  return history;
}

function markShopifyOrdersExported(store, preview, exportedAt = new Date().toISOString()) {
  const rowIds = new Set((preview.items || []).flatMap(item => item.orderRowIds || []).filter(Boolean));
  if (!rowIds.size) return 0;
  let updated = 0;
  (store.shopifyOrders || []).forEach(row => {
    if (!rowIds.has(row.id)) return;
    if (purchaseStatusForOrder(row) === '発注済') return;
    row.purchaseStatus = '発注済';
    row.banriExportedAt = exportedAt;
    row.updatedAt = exportedAt;
    updated += 1;
  });
  return updated;
}

function normalizeExportOrderName(value, fallback) {
  const text = String(value || fallback || '').trim();
  if (!text) return '';
  return text.startsWith('#') ? text : `#${text}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const input = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some(value => value !== '')) rows.push(row);

  if (!rows.length) return [];
  const headers = rows[0].map(header => String(header || '').trim());
  return rows.slice(1).map(values => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = values[index] ?? '';
    });
    return item;
  });
}

function csvHeaderSet(csvText) {
  const rows = parseCsv(csvText);
  const first = rows[0] || {};
  return new Set(Object.keys(first).map(key => key.trim().toLowerCase()));
}

function hasCsvHeader(headers, key) {
  return headers.has(String(key || '').trim().toLowerCase());
}

function classifyShopifyCsv(csvText) {
  const headers = csvHeaderSet(csvText);
  if (!headers.size) return 'empty';

  const isProductCsv = hasCsvHeader(headers, 'Handle')
    && hasCsvHeader(headers, 'Title')
    && (
      hasCsvHeader(headers, 'Option1 Value')
      || hasCsvHeader(headers, 'Variant SKU')
      || hasCsvHeader(headers, 'Variant Price')
    );
  if (isProductCsv) return 'product';

  const isOrderCsv = hasCsvHeader(headers, 'Name')
    && (
      hasCsvHeader(headers, 'Lineitem name')
      || hasCsvHeader(headers, 'Lineitem sku')
      || hasCsvHeader(headers, 'SKU')
    )
    && (
      hasCsvHeader(headers, 'Shipping Name')
      || hasCsvHeader(headers, 'Shipping Address1')
      || hasCsvHeader(headers, 'Shipping Street')
      || hasCsvHeader(headers, 'Shipping Zip')
    );
  if (isOrderCsv) return 'order';

  return 'unknown';
}

function csvInputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function assertShopifyOrderCsv(csvText, targetLabel) {
  const csvKind = classifyShopifyCsv(csvText);
  if (csvKind === 'order') return;
  if (csvKind === 'product') {
    throw csvInputError(`${targetLabel}にはShopifyの商品CSVが選択されています。Shopifyの「注文管理」から注文CSVをエクスポートして入れてください。商品CSVには配送先がないため、発注Excelには使えません。`);
  }
  if (csvKind === 'empty') {
    throw csvInputError('CSVの中身が空です。Shopifyの注文CSVを選択してください。');
  }
  throw csvInputError(`${targetLabel}として読み取れる列が見つかりません。Shopifyの注文CSV（Name / Lineitem name / Lineitem sku / Shipping列があるCSV）を入れてください。`);
}

function pickValue(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function normalizeMoney(value) {
  const text = String(value || '').replace(/[^\d.-]/g, '');
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeOrderDate(value) {
  if (!value) return '';
  const date = new Date(String(value).replace(' +0900', '+09:00'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function paidAtFromFinancialStatus(financialStatus, paidAtValue, fallbackValue = '') {
  const raw = String(financialStatus || '').toLowerCase().trim();
  const paidAt = normalizeOrderDate(paidAtValue);
  if (paidAt) return paidAt;
  if (['paid', 'partially_paid'].includes(raw)) return normalizeOrderDate(fallbackValue);
  return '';
}

function orderNumberValue(orderName) {
  const match = String(orderName || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function isIgnoredShopifyOrder(orderOrName) {
  const text = typeof orderOrName === 'object'
    ? String(orderOrName.orderName || orderOrName.name || orderOrName.customerOrderNo || '')
    : String(orderOrName || '');
  if (/\btest\b/i.test(text) || /^#?TEST/i.test(text.trim())) return true;
  const orderNo = typeof orderOrName === 'object'
    ? Number(orderOrName.orderNo || orderNumberValue(orderOrName.orderName))
    : orderNumberValue(orderOrName);
  return orderNo >= IGNORED_SHOPIFY_ORDER_MIN && orderNo <= IGNORED_SHOPIFY_ORDER_MAX;
}

function productNoFromSku(sku, lineName = '') {
  const source = `${sku || ''} ${lineName || ''}`;
  const match = source.match(/\bS\d{4}\b/i);
  return match ? normalizeProductNo(match[0]) : '';
}

function statusJa(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'paid') return '支払い済み';
  if (status === 'pending') return '支払い保留中';
  if (status === 'authorized') return '支払い保留中';
  if (status === 'unpaid') return '未入金';
  if (status === 'partially_paid') return '一部入金';
  if (status === 'refunded') return '返金済み';
  if (status === 'partially_refunded') return '一部返金';
  if (status === 'voided') return '無効';
  if (status === 'expired') return '期限切れ';
  return value || '';
}

function fulfillmentJa(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'fulfilled') return '発送済み';
  if (status === 'partial' || status === 'partially_fulfilled' || status === 'partially fulfilled') return '一部発送済み';
  if (status === 'unfulfilled') return '未発送';
  if (status === 'pending') return '未発送';
  return value || '';
}

const PURCHASE_STATUS_OPTIONS = ['未発注', '発注済', '発送済', '失注', '返品', 'その他'];

function normalizePurchaseStatus(value) {
  const text = String(value || '').trim();
  if (!text) return '未発注';
  if (text.includes('手動発送')) return '発送済';
  if (text.includes('発注Excel') || text.includes('出力済') || text.includes('発注済')) return '発注済';
  if (text.includes('発送済') || text.includes('配送済')) return '発送済';
  if (text.includes('失注') || text.includes('キャンセル') || text.includes('取消')) return '失注';
  if (text.includes('返品') || text.includes('返送') || text.toLowerCase().includes('return')) return '返品';
  if (text.includes('その他') || text.includes('其他')) return 'その他';
  if (text.includes('未発注')) return '未発注';
  return PURCHASE_STATUS_OPTIONS.includes(text) ? text : 'その他';
}

function isLostShopifyOrder(row = {}) {
  const financial = String(row.financialStatus || row.financialStatusJa || '').toLowerCase();
  const cancelled = String(row.cancelledAt || row.cancelReason || '').trim();
  return Boolean(cancelled)
    || financial.includes('refunded')
    || financial.includes('返金')
    || financial.includes('voided')
    || financial.includes('無効')
    || financial.includes('cancel');
}

function isPaidShopifyOrder(row = {}) {
  const raw = String(row.financialStatus || '').toLowerCase().trim();
  const label = String(row.financialStatusJa || '').trim();
  return raw === 'paid' || label === '支払い済み';
}

function hasShopifyTrackingNumber(row = {}) {
  return Boolean(String(row.shopifyTrackingNumber || row.trackingNumber || row.logisticsNo || '').trim());
}

function isShippedShopifyOrder(row = {}) {
  return hasShopifyTrackingNumber(row);
}

function purchaseStatusForOrder(row = {}) {
  const current = normalizePurchaseStatus(row.purchaseStatus);
  if (current === '返品') return '返品';
  if (isLostShopifyOrder(row) || current === '失注') return '失注';
  if (current === 'その他') return 'その他';
  if (isShippedShopifyOrder(row)) return '発送済';
  if (current === '発送済') return '発送済';
  if (current === '発注済' || row.banriExportedAt) return '発注済';
  return '未発注';
}

function withPurchaseStatus(row = {}) {
  return {
    ...row,
    purchaseStatus: purchaseStatusForOrder(row),
  };
}

function isOtherPurchaseOrder(row = {}) {
  return normalizePurchaseStatus(row.purchaseStatus) === 'その他';
}

function accountingShopifyOrderRows(rows = []) {
  const excludedOrderNames = new Set(
    rows
      .filter(row => isOtherPurchaseOrder(row))
      .map(row => String(row.orderName || '').trim())
      .filter(Boolean)
  );
  return rows.filter(row => {
    if (isOtherPurchaseOrder(row)) return false;
    const orderName = String(row.orderName || '').trim();
    return !(orderName && excludedOrderNames.has(orderName));
  });
}

function isSoldCountableShopifyOrder(row = {}) {
  if (isIgnoredShopifyOrder(row) || isLostShopifyOrder(row)) return false;
  if (normalizePurchaseStatus(row.purchaseStatus) === 'その他') return false;
  if (normalizePurchaseStatus(row.purchaseStatus) === '失注') return false;
  if (normalizePurchaseStatus(row.purchaseStatus) === '返品') return false;
  const raw = String(row.financialStatus || '').toLowerCase().trim();
  const label = String(row.financialStatusJa || '').trim();
  if (raw.includes('pending') || raw.includes('authorized') || raw.includes('unpaid')) return false;
  if (label.includes('保留') || label.includes('未入金')) return false;
  return true;
}

function productSalesSummary(store = {}) {
  const summary = new Map();
  (store.shopifyOrders || []).forEach(row => {
    if (!isSoldCountableShopifyOrder(row)) return;
    const productNo = normalizeProductNo(row.productNo || productNoFromSku(row.sku, row.lineName || row.productName));
    if (!productNo) return;
    const current = summary.get(productNo) || { soldQuantity: 0, soldOrderCount: 0 };
    const quantity = Math.max(0, Number(row.quantity || 1));
    current.soldQuantity += Number.isFinite(quantity) ? quantity : 1;
    current.soldOrderCount += 1;
    summary.set(productNo, current);
  });
  return summary;
}

function productsForResponse(store = {}) {
  const sales = productSalesSummary(store);
  return (store.products || []).map(product => {
    const productNo = normalizeProductNo(product.productNo);
    const productSales = sales.get(productNo) || { soldQuantity: 0, soldOrderCount: 0 };
    return {
      ...product,
      memo: cleanProductMemo(product.memo),
      soldQuantity: productSales.soldQuantity,
      soldOrderCount: productSales.soldOrderCount,
    };
  });
}

function channelLabel(value) {
  const source = String(value || '').trim();
  if (source === 'web') return 'Online Store';
  return source;
}

function uniqueParts(parts) {
  const seen = new Set();
  return parts
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .filter(part => {
      if (seen.has(part)) return false;
      seen.add(part);
      return true;
    });
}

function nameFromParts(lastName, firstName) {
  return uniqueParts([lastName, firstName]).join(' ');
}

function shopifyCsvAddressNameParts(row = {}, prefix = 'Shipping') {
  const firstName = pickValue(row, [
    `${prefix} First Name`,
    `${prefix} First name`,
    `${prefix} FirstName`,
    `${prefix} first name`,
  ]);
  const lastName = pickValue(row, [
    `${prefix} Last Name`,
    `${prefix} Last name`,
    `${prefix} LastName`,
    `${prefix} last name`,
  ]);
  return {
    firstName,
    lastName,
    fullName: nameFromParts(lastName, firstName) || pickValue(row, [`${prefix} Name`]),
  };
}

function orderShippingName(row = {}) {
  return nameFromParts(row.shippingLastName, row.shippingFirstName)
    || row.shippingName
    || row.customerName
    || '';
}

function normalizeAddressKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim();
}

function compactJapaneseAddress(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[ \t]+/g, ' ')
    .replace(/(都|道|府|県)\s+(?=[^\s]{1,12}[市区町村郡])/g, '$1')
    .replace(/([市区町村])\s+(?=[^\s]{1,12}[区町村])/g, '$1')
    .trim();
}

function addressIncludesPart(address, part) {
  const normalizedAddress = normalizeAddressKey(address);
  const normalizedPart = normalizeAddressKey(part);
  return Boolean(normalizedAddress && normalizedPart && normalizedAddress.includes(normalizedPart));
}

function addressFrom(row, prefix) {
  const province = pickValue(row, [`${prefix} Province Name`, `${prefix} Province`]);
  const city = pickValue(row, [`${prefix} City`]);
  const address1 = pickValue(row, [`${prefix} Address1`]);
  const address2 = pickValue(row, [`${prefix} Address2`]);
  const street = pickValue(row, [`${prefix} Street`]);
  const streetParts = address1 || address2 ? uniqueParts([address1, address2]) : uniqueParts([street]);
  const streetText = compactJapaneseAddress(streetParts.join(' '));
  const hasProvince = province && addressIncludesPart(streetText, province);
  const hasCity = city && addressIncludesPart(streetText, city);
  const prefixParts = [];

  if (province && !hasProvince) prefixParts.push(province);
  if (city && !hasProvince && !hasCity) prefixParts.push(city);

  return compactJapaneseAddress([prefixParts.join(''), streetText].filter(Boolean).join(''));
}

function stableOrderRowId(row) {
  const sourceSku = row.sourceSku !== undefined ? row.sourceSku : row.sku;
  const key = [
    row.orderName,
    row.shopifyOrderId,
    sourceSku,
    row.lineName,
  ].join('|');
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

function orderRowIdentityKeys(row = {}) {
  const orderName = String(row.orderName || row.name || '').trim();
  const shopifyOrderId = String(row.shopifyOrderId || '').trim();
  const lineItemId = String(row.shopifyLineItemId || '').trim();
  const sku = normalizeSku(row.sourceSku || row.sku || '');
  const lineName = normalizeVariantKey(row.lineName || row.name || '');
  const productNo = normalizeProductNo(row.productNo || productNoFromSku(sku, row.lineName));
  const keys = [];
  if (row.id) keys.push(`id:${row.id}`);
  if (lineItemId) keys.push(`line:${lineItemId}`);
  if (shopifyOrderId && lineItemId) keys.push(`order-line:${shopifyOrderId}|${lineItemId}`);
  if (orderName && lineItemId) keys.push(`name-line:${orderName}|${lineItemId}`);
  if (shopifyOrderId && sku) keys.push(`order-sku:${shopifyOrderId}|${sku}|${lineName}`);
  if (orderName && sku) keys.push(`name-sku:${orderName}|${sku}|${lineName}`);
  if (orderName && productNo && lineName) keys.push(`name-product:${orderName}|${productNo}|${lineName}`);
  if (orderName && lineName) keys.push(`name-line-text:${orderName}|${lineName}`);
  return uniqueParts(keys);
}

function addOrderRowToKeyIndex(index, row) {
  orderRowIdentityKeys(row).forEach(key => index.add(key));
}

function hasOrderRowInKeyIndex(index, row) {
  return orderRowIdentityKeys(row).some(key => index.has(key));
}

const SHOPIFY_ORDER_INHERITED_KEYS = [
  'Name',
  'Created at',
  'Financial Status',
  'Fulfillment Status',
  'Total',
  'Subtotal',
  'Shipping',
  'Taxes',
  'Shipping Method',
  'Tags',
  'Source',
  'Id',
  'Shipping Name',
  'Shipping First Name',
  'Shipping First name',
  'Shipping FirstName',
  'Shipping Last Name',
  'Shipping Last name',
  'Shipping LastName',
  'Shipping Street',
  'Shipping Address1',
  'Shipping Address2',
  'Shipping City',
  'Shipping Zip',
  'Shipping Province',
  'Shipping Province Name',
  'Shipping Country',
  'Shipping Phone',
  'Billing Name',
  'Billing First Name',
  'Billing First name',
  'Billing FirstName',
  'Billing Last Name',
  'Billing Last name',
  'Billing LastName',
  'Billing Street',
  'Billing Address1',
  'Billing Address2',
  'Billing City',
  'Billing Zip',
  'Billing Province',
  'Billing Province Name',
  'Billing Country',
  'Billing Phone',
  'Phone',
  'Email',
];

function inheritShopifyOrderFields(rows) {
  const last = {};
  return rows.map(row => {
    SHOPIFY_ORDER_INHERITED_KEYS.forEach(key => {
      if (String(row[key] || '').trim()) last[key] = row[key];
    });
    const merged = { ...last, ...row };
    Object.keys(merged).forEach(key => {
      if (String(merged[key] || '').trim() === '' && last[key]) merged[key] = last[key];
    });
    return merged;
  });
}

function skuFromVariantMatch(match) {
  if (!match) return '';
  return [match.sku, match.size?.sku, match.size?.shopifySku]
    .map(value => String(value || '').trim())
    .find(Boolean) || '';
}

function parseShopifyOrderRows(csvText, store = null) {
  const rows = parseCsv(csvText);
  const variantIndex = store ? buildVariantIndex(store) : null;
  return inheritShopifyOrderFields(rows).map(merged => {
    const orderName = pickValue(merged, ['Name', 'Order']);
    const sourceSku = pickValue(merged, ['Lineitem sku', 'SKU', 'Variant SKU']);
    const lineName = pickValue(merged, ['Lineitem name', 'Product', 'Title']);
    if (isIgnoredShopifyOrder(orderName)) return null;
    if (!orderName || (!sourceSku && !lineName)) return null;

    const match = variantIndex ? findVariantMatch(variantIndex, merged, sourceSku, lineName) : null;
    const sku = sourceSku || skuFromVariantMatch(match);
    const productNo = match?.product?.productNo || productNoFromSku(sourceSku || sku, lineName);

    const financialStatus = pickValue(merged, ['Financial Status']);
    const createdAt = normalizeOrderDate(pickValue(merged, ['Created at', 'Date']));
    const quantity = Math.max(1, Number(pickValue(merged, ['Lineitem quantity', 'Quantity']) || 1));
    const linePrice = normalizeMoney(pickValue(merged, ['Lineitem price', 'Price']));
    const total = normalizeMoney(pickValue(merged, ['Total', 'Order Total']));
    const currentTotal = normalizeMoney(pickValue(merged, ['Current Total', 'Current total', 'Current Total Price']));
    const explicitRefund = normalizeMoney(pickValue(merged, ['Refunded Amount', 'Total Refunded', 'Refunded', 'Refund', 'Refund Amount']));
    const orderCurrentTotal = currentTotal || total;
    const orderOriginalTotal = total || orderCurrentTotal;
    const orderRefundAmountJpy = explicitRefund || Math.max(0, Math.round(orderOriginalTotal - orderCurrentTotal));
    const shippingJpy = normalizeMoney(pickValue(merged, ['Shipping']));
    const shippingNameParts = shopifyCsvAddressNameParts(merged, 'Shipping');
    const billingNameParts = shopifyCsvAddressNameParts(merged, 'Billing');
    const shippingName = shippingNameParts.fullName;
    const billingName = billingNameParts.fullName;
    const order = {
      orderName,
      orderNo: orderNumberValue(orderName),
      shopifyOrderId: pickValue(merged, ['Id']),
      createdAt,
      paidAt: paidAtFromFinancialStatus(financialStatus, pickValue(merged, ['Paid at', 'Paid At', 'Processed at', 'Processed At']), createdAt),
      email: pickValue(merged, ['Email']),
      customerName: shippingName || billingName,
      billingName,
      billingFirstName: billingNameParts.firstName,
      billingLastName: billingNameParts.lastName,
      billingZip: pickValue(merged, ['Billing Zip']),
      billingAddress: addressFrom(merged, 'Billing'),
      billingPhone: pickValue(merged, ['Billing Phone', 'Phone']),
      shippingName,
      shippingFirstName: shippingNameParts.firstName,
      shippingLastName: shippingNameParts.lastName,
      shippingZip: pickValue(merged, ['Shipping Zip']),
      shippingAddress: addressFrom(merged, 'Shipping'),
      shippingPhone: pickValue(merged, ['Shipping Phone', 'Phone', 'Billing Phone']),
      channel: channelLabel(pickValue(merged, ['Channel', 'Source'])),
      financialStatus,
      financialStatusJa: statusJa(financialStatus),
      fulfillmentStatus: pickValue(merged, ['Fulfillment Status']),
      fulfillmentStatusJa: fulfillmentJa(pickValue(merged, ['Fulfillment Status'])),
      lineFulfillmentStatus: pickValue(merged, ['Lineitem fulfillment status']),
      lineFulfillmentStatusJa: fulfillmentJa(pickValue(merged, ['Lineitem fulfillment status'])),
      cancelledAt: normalizeOrderDate(pickValue(merged, ['Cancelled at', 'Cancelled At', 'Canceled at', 'Canceled At'])),
      cancelReason: pickValue(merged, ['Cancel Reason', 'Cancelled Reason', 'Cancellation Reason']),
      shippingMethod: pickValue(merged, ['Shipping Method']),
      tags: pickValue(merged, ['Tags']),
      subtotal: normalizeMoney(pickValue(merged, ['Subtotal'])),
      shipping: shippingJpy,
      orderShippingJpy: shippingJpy,
      customerShippingRevenueJpy: 0,
      taxes: normalizeMoney(pickValue(merged, ['Taxes'])),
      total: orderCurrentTotal,
      orderCurrentTotalJpy: orderCurrentTotal,
      orderOriginalTotalJpy: orderOriginalTotal,
      orderRefundAmountJpy,
      quantity,
      lineName,
      linePrice,
      lineTotal: Number((quantity * linePrice).toFixed(2)),
      sourceSku,
      sku,
      skuInferred: !sourceSku && Boolean(sku),
      skuSource: sourceSku ? 'csv' : (sku ? 'product-master' : ''),
      productNo,
      purchaseStatus: '未発注',
      note: '',
      importedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    order.id = stableOrderRowId(order);
    return order;
  }).filter(Boolean);
}

function sortShopifyOrders(rows) {
  return [...rows].sort((a, b) => {
    const orderDiff = Number(b.orderNo || 0) - Number(a.orderNo || 0);
    if (orderDiff) return orderDiff;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function normalizeDeliveryValue(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function deliveryKeyForOrder(order) {
  const name = normalizeDeliveryValue(order.shippingName || order.billingName || order.customerName);
  const address = normalizeDeliveryValue(order.shippingAddress || order.billingAddress);
  const phone = digitsOnly(order.shippingPhone || order.billingPhone);
  if (!name || !address || !phone) return '';
  return [name, address, phone].join('|');
}

function formatOrderRange(orderNames) {
  const sorted = [...new Set(orderNames)]
    .sort((a, b) => orderNumberValue(a) - orderNumberValue(b));
  const nums = sorted.map(orderNumberValue).filter(Boolean);
  if (sorted.length > 1 && nums.length === sorted.length) {
    const consecutive = nums.every((num, index) => index === 0 || num === nums[index - 1] + 1);
    if (consecutive) return `#${nums[0]}-#${nums[nums.length - 1]}`;
  }
  return sorted.join(' / ');
}

function enrichShopifyOrdersWithDeliveryGroups(rows = []) {
  const cloned = rows.map(row => ({ ...row }));
  const rowMap = new Map();
  const uniqueOrders = new Map();
  cloned.forEach(row => {
    const orderName = String(row.orderName || '').trim();
    if (!orderName) return;
    if (!rowMap.has(orderName)) rowMap.set(orderName, []);
    rowMap.get(orderName).push(row);
    if (!uniqueOrders.has(orderName)) {
      uniqueOrders.set(orderName, {
        orderName,
        orderNo: Number(row.orderNo || orderNumberValue(orderName)),
        deliveryKey: deliveryKeyForOrder(row),
        total: Number(row.total || row.lineTotal || 0),
        quantity: 0,
      });
    }
    uniqueOrders.get(orderName).quantity += Number(row.quantity || 0);
  });

  rowMap.forEach(orderRows => {
    const orderShippingJpy = Math.round(Number(orderRows.find(row => Number(row.orderShippingJpy || row.shipping || 0) > 0)?.orderShippingJpy
      || orderRows.find(row => Number(row.shipping || 0) > 0)?.shipping
      || 0));
    const allocations = allocateOrderRevenue(orderRows, orderShippingJpy);
    orderRows.forEach(row => {
      row.orderShippingJpy = orderShippingJpy;
      row.customerShippingRevenueJpy = Number(allocations.get(row.id) || 0);
    });
  });

  const candidates = [...uniqueOrders.values()]
    .filter(order => order.deliveryKey && order.orderNo)
    .sort((a, b) => a.orderNo - b.orderNo);
  let current = [];
  const groups = [];
  const flush = () => {
    if (current.length > 1) groups.push(current);
    current = [];
  };
  candidates.forEach(order => {
    const previous = current[current.length - 1];
    if (previous && previous.deliveryKey === order.deliveryKey && order.orderNo === previous.orderNo + 1) {
      current.push(order);
      return;
    }
    flush();
    current = [order];
  });
  flush();

  groups.forEach((group, index) => {
    const orderNames = group.map(order => order.orderName);
    const label = `同梱候補 ${group.length}件 ${formatOrderRange(orderNames)}`;
    const groupId = `delivery-${group[0].orderNo}-${group[group.length - 1].orderNo}-${index + 1}`;
    const totalSales = Math.round(group.reduce((sum, order) => sum + Number(order.total || 0), 0));
    const totalQuantity = group.reduce((sum, order) => sum + Number(order.quantity || 0), 0);
    orderNames.forEach(orderName => {
      (rowMap.get(orderName) || []).forEach(row => {
        Object.assign(row, {
          deliveryGroupId: groupId,
          deliveryGroupSize: group.length,
          deliveryGroupOrderNames: orderNames,
          deliveryGroupLabel: label,
          deliveryGroupReason: '連番 + 同一配送先',
          deliveryGroupTotalSales: totalSales,
          deliveryGroupTotalQuantity: totalQuantity,
        });
      });
    });
  });
  return cloned;
}

function allocateOrderRevenue(rows, total) {
  const amount = Math.round(Number(total || 0));
  if (!amount || !rows.length) return new Map(rows.map(row => [row.id, 0]));
  const bases = rows.map(row => Number(row.lineTotal || 0) > 0 ? Number(row.lineTotal) : Number(row.quantity || 1));
  const baseTotal = bases.reduce((sum, value) => sum + value, 0) || rows.length;
  let allocated = 0;
  const map = new Map();
  rows.forEach((row, index) => {
    const value = index === rows.length - 1
      ? amount - allocated
      : Math.round(amount * ((bases[index] || 1) / baseTotal));
    allocated += value;
    map.set(row.id, value);
  });
  return map;
}

function deliveryGroupSummary(rows = []) {
  const groups = new Map();
  rows.forEach(row => {
    if (!row.deliveryGroupId || Number(row.deliveryGroupSize || 0) <= 1) return;
    if (!groups.has(row.deliveryGroupId)) {
      groups.set(row.deliveryGroupId, { orderNames: new Set(), rowCount: 0 });
    }
    const group = groups.get(row.deliveryGroupId);
    group.rowCount += 1;
    (row.deliveryGroupOrderNames || [row.orderName]).forEach(orderName => {
      if (orderName) group.orderNames.add(orderName);
    });
  });
  return {
    deliveryGroupCount: groups.size,
    deliveryGroupOrderCount: [...groups.values()].reduce((sum, group) => sum + group.orderNames.size, 0),
    deliveryGroupRowCount: [...groups.values()].reduce((sum, group) => sum + group.rowCount, 0),
  };
}

function analyzeShopifyOrderRowsImport(store, parsedRows, options = {}) {
  const rawRowCount = Number(options.rawRowCount || parsedRows.length || 0);
  const incomingKeys = new Set();
  const incoming = [];
  let duplicateFileRows = 0;
  parsedRows.forEach(row => {
    if (isIgnoredShopifyOrder(row)) return;
    if (hasOrderRowInKeyIndex(incomingKeys, row)) {
      duplicateFileRows += 1;
      return;
    }
    addOrderRowToKeyIndex(incomingKeys, row);
    incoming.push(row);
  });

  const existingKeys = new Set();
  (store.shopifyOrders || [])
    .filter(row => !isIgnoredShopifyOrder(row))
    .forEach(row => addOrderRowToKeyIndex(existingKeys, row));

  const duplicateOrderNames = new Set();
  const importable = incoming.filter(row => {
    if (!hasOrderRowInKeyIndex(existingKeys, row)) return true;
    const orderName = String(row.orderName || '').trim();
    if (orderName) duplicateOrderNames.add(orderName);
    return false;
  });
  const duplicateRows = incoming.length - importable.length;

  const groupedImportable = enrichShopifyOrdersWithDeliveryGroups(importable);
  const summary = shopifyOrderSummary(importable);
  return {
    added: importable.length,
    updated: 0,
    duplicateRows,
    duplicateOrders: duplicateOrderNames.size,
    duplicateFileRows,
    skipped: Math.max(0, rawRowCount - parsedRows.length),
    noSku: importable.filter(row => !String(row.sku || '').trim()).length,
    noProductNo: importable.filter(row => !String(row.productNo || '').trim()).length,
    summary,
    previewRows: sortShopifyOrders(groupedImportable).slice(0, 12),
    allIncoming: incoming,
    incoming: importable,
  };
}

function analyzeShopifyOrderImport(store, csvText) {
  assertShopifyOrderCsv(csvText, '注文CSV台帳');
  const rawRows = parseCsv(csvText);
  const parsedRows = parseShopifyOrderRows(csvText, store);
  return analyzeShopifyOrderRowsImport(store, parsedRows, { rawRowCount: rawRows.length, source: 'csv' });
}

function mergeShopifyOrderRows(store, parsedRows, options = {}) {
  const analysis = analyzeShopifyOrderRowsImport(store, parsedRows, {
    rawRowCount: Number(options.rawRowCount || parsedRows.length || 0),
    source: options.source || '',
  });
  const incoming = options.updateExisting ? analysis.allIncoming : analysis.incoming;
  const existing = new Map((store.shopifyOrders || [])
    .filter(row => !isIgnoredShopifyOrder(row))
    .map(row => [row.id, row]));
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;

  incoming.forEach(row => {
    const current = existing.get(row.id);
    if (!current) {
      if (options.purchaseStatus) row.purchaseStatus = normalizePurchaseStatus(options.purchaseStatus);
      if (options.banriExportedAt) row.banriExportedAt = options.banriExportedAt;
      existing.set(row.id, row);
      added += 1;
      return;
    }

    if (!options.updateExisting) return;
    let changed = false;
    if (!String(current.sku || '').trim() && String(row.sku || '').trim()) {
      current.sku = row.sku;
      current.skuInferred = row.skuInferred;
      current.skuSource = row.skuSource;
      changed = true;
    }
    if (!String(current.productNo || '').trim() && String(row.productNo || '').trim()) {
      current.productNo = row.productNo;
      changed = true;
    }
    if (row.sourceSku !== undefined && current.sourceSku !== row.sourceSku) {
      current.sourceSku = row.sourceSku;
      changed = true;
    }
    [
      'customerName',
      'billingName',
      'billingFirstName',
      'billingLastName',
      'billingZip',
      'billingAddress',
      'billingPhone',
      'shippingName',
      'shippingFirstName',
      'shippingLastName',
      'shippingZip',
      'shippingAddress',
      'shippingPhone',
      'email',
      'financialStatus',
      'financialStatusJa',
      'paidAt',
      'fulfillmentStatus',
      'fulfillmentStatusJa',
      'lineFulfillmentStatus',
      'lineFulfillmentStatusJa',
      'cancelledAt',
      'cancelReason',
      'total',
      'orderCurrentTotalJpy',
      'orderOriginalTotalJpy',
      'orderRefundAmountJpy',
    ].forEach(field => {
      if (row[field] !== undefined && current[field] !== row[field]) {
        current[field] = row[field];
        changed = true;
      }
    });
    if (options.purchaseStatus && current.purchaseStatus !== options.purchaseStatus) {
      current.purchaseStatus = normalizePurchaseStatus(options.purchaseStatus);
      changed = true;
    }
    if (options.banriExportedAt) {
      current.banriExportedAt = options.banriExportedAt;
      changed = true;
    }
    if (changed) {
      current.updatedAt = now;
      updated += 1;
    }
  });

  store.shopifyOrders = sortShopifyOrders([...existing.values()].filter(row => !isIgnoredShopifyOrder(row)));
  return {
    added,
    updated,
    duplicateRows: analysis.duplicateRows,
    duplicateOrders: analysis.duplicateOrders,
    duplicateFileRows: analysis.duplicateFileRows,
    skipped: analysis.skipped,
    noSku: analysis.noSku,
    noProductNo: analysis.noProductNo,
    rows: store.shopifyOrders,
  };
}

function mergeShopifyOrders(store, csvText, options = {}) {
  assertShopifyOrderCsv(csvText, '注文CSV台帳');
  const rawRows = parseCsv(csvText);
  const parsedRows = parseShopifyOrderRows(csvText, store);
  return mergeShopifyOrderRows(store, parsedRows, {
    ...options,
    rawRowCount: rawRows.length,
    source: 'csv',
  });
}

function shopifyOrderSummary(rows) {
  const accountingRows = accountingShopifyOrderRows(rows);
  const groupedRows = enrichShopifyOrdersWithDeliveryGroups(accountingRows);
  const orderTotals = new Map();
  const productNos = new Set();
  let totalQuantity = 0;
  groupedRows.forEach(row => {
    if (row.orderName && !orderTotals.has(row.orderName)) {
      orderTotals.set(row.orderName, Number(row.total || 0));
    }
    if (row.productNo) productNos.add(row.productNo);
    totalQuantity += Number(row.quantity || 0);
  });
  return {
    orderCount: orderTotals.size,
    rowCount: accountingRows.length,
    visibleRowCount: rows.length,
    totalSales: Number([...orderTotals.values()].reduce((sum, value) => sum + value, 0).toFixed(2)),
    totalQuantity,
    productCount: productNos.size,
    ...deliveryGroupSummary(groupedRows),
  };
}

function isTrustedBillingOrderMatch(item = {}) {
  if (normalizeOrderKey(item.customerOrderNo)) return true;
  return String(item.shopifyOrderMatchSource || '').trim() === 'order-id';
}

function trustedBillingOrderKeys(item = {}) {
  if (!isTrustedBillingOrderMatch(item)) return [];
  return uniqueParts([item.customerOrderNo, item.shopifyOrderName])
    .map(normalizeOrderKey)
    .filter(Boolean);
}

function trustedBillingTrackingOrderName(item = {}) {
  if (!isTrustedBillingOrderMatch(item)) return '';
  return trackingOrderName(item.customerOrderNo || item.shopifyOrderName || '');
}

function billingItemMatchesOrder(item = {}, order = {}) {
  const itemOrderKeys = trustedBillingOrderKeys(item);
  const orderKey = normalizeOrderKey(order.orderName);
  const orderMatchesById = Boolean(isTrustedBillingOrderMatch(item) && item.shopifyOrderId && order.id && String(item.shopifyOrderId) === String(order.id));
  const orderMatchesByName = Boolean(orderKey && itemOrderKeys.includes(orderKey));
  if (!orderMatchesById && !orderMatchesByName) return false;

  const itemSku = normalizeSku(item.sku);
  const orderSku = normalizeSku(order.sku);
  if (itemSku && orderSku && itemSku === orderSku) return true;
  if (itemSku && orderSku && itemSku !== orderSku) return false;

  const itemProductNo = normalizeProductNo(item.productNo);
  const orderProductNo = normalizeProductNo(order.productNo);
  if (itemProductNo && orderProductNo && itemProductNo === orderProductNo) return true;
  if (itemProductNo && orderProductNo && itemProductNo !== orderProductNo) return false;
  if ((itemSku || itemProductNo) && (orderSku || orderProductNo)) return false;

  const recipient = normalizeNameKey(item.recipientName || item.displayRecipientName);
  return Boolean(recipient && shopifyOrderMatchesRecipient(order, recipient));
}

function billingRowRevenueForOrder(order = {}) {
  return Math.round(Number(order.lineTotal || order.total || 0) + Number(order.customerShippingRevenueJpy || 0));
}

function manualOtherFeeForOrder(order = {}) {
  if (order.manualOtherFeeJpy == null || String(order.manualOtherFeeJpy).trim() === '') return null;
  const value = Number(order.manualOtherFeeJpy);
  return Number.isFinite(value) ? Math.round(value) : null;
}

const MANUAL_BILLING_FIELDS = [
  ['manualProductCostJpy', 'billingProductCostJpy'],
  ['manualDomesticShippingJpy', 'billingDomesticShippingJpy'],
  ['manualWorkFeeJpy', 'billingWorkFeeJpy'],
  ['manualInternationalShippingJpy', 'billingInternationalShippingJpy'],
  ['manualOtherFeeJpy', 'billingOtherFeeJpy'],
];

function manualBillingBreakdownForOrder(order = {}) {
  const breakdown = {
    billingProductCostJpy: 0,
    billingDomesticShippingJpy: 0,
    billingWorkFeeJpy: 0,
    billingInternationalShippingJpy: 0,
    billingOtherFeeJpy: 0,
  };
  let hasManual = false;
  MANUAL_BILLING_FIELDS.forEach(([sourceKey, targetKey]) => {
    if (order[sourceKey] == null || String(order[sourceKey]).trim() === '') return;
    const value = Number(String(order[sourceKey]).replace(/,/g, ''));
    if (!Number.isFinite(value)) return;
    breakdown[targetKey] = Math.round(value);
    hasManual = true;
  });
  return {
    ...breakdown,
    hasManual,
    billingCostJpy: Math.round(Object.values(breakdown).reduce((sum, value) => sum + Number(value || 0), 0)),
  };
}

function billingItemSelectionScore(item = {}) {
  let score = 0;
  if (digitsOnly(item.logisticsNo)) score += 100000;
  if (String(item.shopifyTrackingStatus || '') === '反映済み') score += 5000;
  if (Number(item.allocatedInternationalShippingJpy || 0) > 0) score += 2000;
  if (Number(item.csvInternationalShippingJpy || 0) > 0) score += 1000;
  if (Number(item.workFeeJpy || 0) > 0) score += 500;
  score += Math.max(0, Number(item.totalCostJpy || 0));
  score += Math.max(0, Number(item.sourceRowNo || 0)) / 1000;
  return score;
}

function billingItemLineKey(item = {}) {
  const sku = normalizeSku(item.sku);
  if (sku) return `sku:${sku}`;
  const productNo = normalizeProductNo(item.productNo);
  if (productNo) return `product:${productNo}`;
  const name = normalizedCompareText(item.productName || item.shopifyLineName);
  if (name) return `name:${name}`;
  return `id:${item.id || `${item.customerOrderNo || ''}:${item.banriOrderNo || ''}:${item.logisticsNo || ''}`}`;
}

function selectedBillingItemsForOrder(order = {}, matches = []) {
  if (!matches.length) return [];
  const grouped = new Map();
  const adjustmentItems = [];
  matches.forEach(item => {
    if (isBillingAdjustmentItem(item)) {
      adjustmentItems.push(item);
      return;
    }
    const key = billingItemLineKey(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });
  const wantedQuantity = Math.max(1, Number(order.quantity || 1));
  const selected = [...adjustmentItems];
  grouped.forEach(items => {
    const sorted = [...items].sort((a, b) => billingItemSelectionScore(b) - billingItemSelectionScore(a));
    selected.push(...sorted.slice(0, wantedQuantity));
  });
  return selected.filter(Boolean);
}

function billingProfitForOrder(order = {}, billingItems = []) {
  const matches = selectedBillingItemsForOrder(order, billingItems.filter(item => billingItemMatchesOrder(item, order)));
  const rowRevenueJpy = billingRowRevenueForOrder(order);
  const manualOtherFeeJpy = manualOtherFeeForOrder(order);
  if (!matches.length) {
    const manualBilling = manualBillingBreakdownForOrder(order);
    const grossProfitJpy = manualBilling.hasManual ? rowRevenueJpy - manualBilling.billingCostJpy : 0;
    const grossMarginPct = manualBilling.hasManual && rowRevenueJpy ? grossProfitJpy / rowRevenueJpy : 0;
    return {
      billingMatched: false,
      billingManual: manualBilling.hasManual,
      billingItemIds: [],
      billingCostJpy: manualBilling.hasManual ? manualBilling.billingCostJpy : 0,
      billingProductCostJpy: manualBilling.billingProductCostJpy,
      billingDomesticShippingJpy: manualBilling.billingDomesticShippingJpy,
      billingWorkFeeJpy: manualBilling.billingWorkFeeJpy,
      billingInternationalShippingJpy: manualBilling.billingInternationalShippingJpy,
      billingOtherFeeJpy: manualBilling.billingOtherFeeJpy,
      billingRevenueJpy: rowRevenueJpy,
      grossProfitJpy,
      grossMarginPct,
      otherFeeManual: manualBilling.hasManual && order.manualOtherFeeJpy != null && String(order.manualOtherFeeJpy).trim() !== '',
      billingStatus: manualBilling.hasManual ? '手入力' : '',
      billingIssues: [],
      billingNotices: manualBilling.hasManual ? ['料金明細CSV未取込・手入力'] : [],
    };
  }

  const sumBy = key => Math.round(matches.reduce((sum, item) => sum + Number(item[key] || 0), 0));
  const csvOtherFeeJpy = sumBy('otherFeeJpy');
  const billingOtherFeeJpy = manualOtherFeeJpy ?? csvOtherFeeJpy;
  const billingCostJpy = sumBy('totalCostJpy') - csvOtherFeeJpy + billingOtherFeeJpy;
  const grossProfitJpy = rowRevenueJpy - billingCostJpy;
  const grossMarginPct = rowRevenueJpy ? grossProfitJpy / rowRevenueJpy : 0;
  const statuses = uniqueParts(matches.map(item => item.status));
  const issues = uniqueParts(matches.flatMap(item => item.issues || []));
  const notices = uniqueParts(matches.flatMap(item => item.notices || []));
  const trackingDisabled = Boolean(order.trackingNumberDisabled);
  const billingTrackingNumber = trackingDisabled ? '' : (matches
    .map(item => digitsOnly(item.logisticsNo))
    .find(Boolean) || '');

  return {
    billingMatched: true,
    billingManual: false,
    billingMatchCount: matches.length,
    billingItemIds: matches.map(item => item.id).filter(Boolean),
    billingCostJpy,
    billingProductCostJpy: sumBy('productCostJpy'),
    billingDomesticShippingJpy: sumBy('domesticShippingJpy'),
    billingWorkFeeJpy: sumBy('workFeeJpy'),
    billingInternationalShippingJpy: sumBy('allocatedInternationalShippingJpy'),
    billingOtherFeeJpy,
    billingRevenueJpy: rowRevenueJpy,
    grossProfitJpy,
    grossMarginPct,
    otherFeeManual: manualOtherFeeJpy != null,
    billingStatus: statuses.includes('要確認') ? '要確認'
      : statuses.includes('未請求') ? '未請求'
        : statuses.includes('未処理') ? '未処理'
          : statuses[0] || '',
    trackingNumberDisabled: trackingDisabled,
    logisticsNo: trackingDisabled ? '' : (order.logisticsNo || billingTrackingNumber),
    trackingNumber: trackingDisabled ? '' : (order.trackingNumber || billingTrackingNumber),
    billingTrackingNumber,
    billingIssues: issues,
    billingNotices: notices,
    billingUpdatedAt: matches.map(item => item.updatedAt || item.importedAt || '').sort().at(-1) || '',
  };
}

function enrichShopifyOrdersWithBilling(store, rows = []) {
  const billingItems = enrichBillingItemsWithDeliveryGroups(store, store.billingItems || []);
  return rows.map(row => ({
    ...row,
    ...billingProfitForOrder(row, billingItems),
  }));
}

function shopifyOrdersForResponse(store, rows = store.shopifyOrders || []) {
  const baseRows = rows.filter(order => !isIgnoredShopifyOrder(order)).map(withPurchaseStatus);
  const groupedRows = enrichShopifyOrdersWithDeliveryGroups(baseRows);
  return sortShopifyOrders(enrichShopifyOrdersWithBilling(store, groupedRows));
}

function moneyBagAmount(value) {
  const amount = Number(value?.shopMoney?.amount || value?.presentmentMoney?.amount || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function extractShopifyLegacyId(value) {
  const match = String(value || '').match(/\/(\d+)(?:\?.*)?$/);
  return match ? match[1] : '';
}

function addressName(address = {}) {
  return nameFromParts(address.lastName, address.firstName)
    || String(address.name || '').trim();
}

const JAPAN_PREFECTURE_BY_CODE = {
  'JP-01': '北海道', '01': '北海道', 'HOKKAIDO': '北海道',
  'JP-02': '青森県', '02': '青森県', 'AOMORI': '青森県',
  'JP-03': '岩手県', '03': '岩手県', 'IWATE': '岩手県',
  'JP-04': '宮城県', '04': '宮城県', 'MIYAGI': '宮城県',
  'JP-05': '秋田県', '05': '秋田県', 'AKITA': '秋田県',
  'JP-06': '山形県', '06': '山形県', 'YAMAGATA': '山形県',
  'JP-07': '福島県', '07': '福島県', 'FUKUSHIMA': '福島県',
  'JP-08': '茨城県', '08': '茨城県', 'IBARAKI': '茨城県',
  'JP-09': '栃木県', '09': '栃木県', 'TOCHIGI': '栃木県',
  'JP-10': '群馬県', '10': '群馬県', 'GUNMA': '群馬県',
  'JP-11': '埼玉県', '11': '埼玉県', 'SAITAMA': '埼玉県',
  'JP-12': '千葉県', '12': '千葉県', 'CHIBA': '千葉県',
  'JP-13': '東京都', '13': '東京都', 'TOKYO': '東京都',
  'JP-14': '神奈川県', '14': '神奈川県', 'KANAGAWA': '神奈川県',
  'JP-15': '新潟県', '15': '新潟県', 'NIIGATA': '新潟県',
  'JP-16': '富山県', '16': '富山県', 'TOYAMA': '富山県',
  'JP-17': '石川県', '17': '石川県', 'ISHIKAWA': '石川県',
  'JP-18': '福井県', '18': '福井県', 'FUKUI': '福井県',
  'JP-19': '山梨県', '19': '山梨県', 'YAMANASHI': '山梨県',
  'JP-20': '長野県', '20': '長野県', 'NAGANO': '長野県',
  'JP-21': '岐阜県', '21': '岐阜県', 'GIFU': '岐阜県',
  'JP-22': '静岡県', '22': '静岡県', 'SHIZUOKA': '静岡県',
  'JP-23': '愛知県', '23': '愛知県', 'AICHI': '愛知県',
  'JP-24': '三重県', '24': '三重県', 'MIE': '三重県',
  'JP-25': '滋賀県', '25': '滋賀県', 'SHIGA': '滋賀県',
  'JP-26': '京都府', '26': '京都府', 'KYOTO': '京都府',
  'JP-27': '大阪府', '27': '大阪府', 'OSAKA': '大阪府',
  'JP-28': '兵庫県', '28': '兵庫県', 'HYOGO': '兵庫県',
  'JP-29': '奈良県', '29': '奈良県', 'NARA': '奈良県',
  'JP-30': '和歌山県', '30': '和歌山県', 'WAKAYAMA': '和歌山県',
  'JP-31': '鳥取県', '31': '鳥取県', 'TOTTORI': '鳥取県',
  'JP-32': '島根県', '32': '島根県', 'SHIMANE': '島根県',
  'JP-33': '岡山県', '33': '岡山県', 'OKAYAMA': '岡山県',
  'JP-34': '広島県', '34': '広島県', 'HIROSHIMA': '広島県',
  'JP-35': '山口県', '35': '山口県', 'YAMAGUCHI': '山口県',
  'JP-36': '徳島県', '36': '徳島県', 'TOKUSHIMA': '徳島県',
  'JP-37': '香川県', '37': '香川県', 'KAGAWA': '香川県',
  'JP-38': '愛媛県', '38': '愛媛県', 'EHIME': '愛媛県',
  'JP-39': '高知県', '39': '高知県', 'KOCHI': '高知県',
  'JP-40': '福岡県', '40': '福岡県', 'FUKUOKA': '福岡県',
  'JP-41': '佐賀県', '41': '佐賀県', 'SAGA': '佐賀県',
  'JP-42': '長崎県', '42': '長崎県', 'NAGASAKI': '長崎県',
  'JP-43': '熊本県', '43': '熊本県', 'KUMAMOTO': '熊本県',
  'JP-44': '大分県', '44': '大分県', 'OITA': '大分県',
  'JP-45': '宮崎県', '45': '宮崎県', 'MIYAZAKI': '宮崎県',
  'JP-46': '鹿児島県', '46': '鹿児島県', 'KAGOSHIMA': '鹿児島県',
  'JP-47': '沖縄県', '47': '沖縄県', 'OKINAWA': '沖縄県',
};

function normalizeLatinKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function shopifyProvinceName(address = {}) {
  const code = String(address.provinceCode || '').trim().toUpperCase();
  if (JAPAN_PREFECTURE_BY_CODE[code]) return JAPAN_PREFECTURE_BY_CODE[code];
  const raw = String(address.province || '').trim();
  if (!raw) return '';
  if (/[都道府県]$/.test(raw)) return raw;
  return JAPAN_PREFECTURE_BY_CODE[normalizeLatinKey(raw)] || raw;
}

function addressTextFromShopify(address = {}) {
  const province = shopifyProvinceName(address);
  const city = String(address.city || '').trim();
  const streetText = compactJapaneseAddress(uniqueParts([
    address.address1,
    address.address2,
  ]).join(' '));
  const hasProvince = province && addressIncludesPart(streetText, province);
  const hasCity = city && addressIncludesPart(streetText, city);
  const prefixParts = [];
  if (province && !hasProvince) prefixParts.push(province);
  if (city && !hasProvince && !hasCity) prefixParts.push(city);
  return compactJapaneseAddress([prefixParts.join(''), streetText].filter(Boolean).join(''));
}

function optionRowFromShopifyLine(line = {}) {
  const row = {};
  const selectedOptions = line.variant?.selectedOptions || [];
  selectedOptions.slice(0, 3).forEach((option, index) => {
    row[`Option${index + 1} Value`] = option.value || '';
  });
  row['Lineitem variant title'] = line.variantTitle
    || selectedOptions.map(option => option.value).filter(Boolean).join(' / ');
  return row;
}

function productNoFromShopifyLine(line = {}) {
  const product = line.product || line.variant?.product || {};
  return productNoFromSku('', uniqueParts([
    line.sku,
    line.name,
    line.title,
    line.variantTitle,
    product.handle,
    product.title,
  ]).join(' '));
}

function orderNodeToLedgerRows(store, order) {
  const variantIndex = buildVariantIndex(store);
  const shippingAddress = order.shippingAddress || {};
  const billingAddress = order.billingAddress || {};
  const shippingName = addressName(shippingAddress);
  const billingName = addressName(billingAddress);
  const customerName = shippingName || billingName || '';
  const orderTotal = moneyBagAmount(order.currentTotalPriceSet || order.totalPriceSet);
  const orderOriginalTotal = moneyBagAmount(order.totalPriceSet) || orderTotal;
  const orderRefundAmountJpy = Math.max(0, Math.round(orderOriginalTotal - orderTotal));
  const orderShippingJpy = moneyBagAmount(order.totalShippingPriceSet);
  const financialStatus = String(order.displayFinancialStatus || '').toLowerCase();
  const fulfillmentStatus = String(order.displayFulfillmentStatus || '').toLowerCase();
  const createdAt = normalizeOrderDate(order.createdAt || order.processedAt);
  const paidAt = paidAtFromFinancialStatus(financialStatus, order.processedAt, createdAt);
  return extractGraphqlEdges(order.lineItems).map(line => {
    const sourceSku = String(line.sku || line.variant?.sku || '').trim();
    const lineName = line.name || uniqueParts([line.title, line.variantTitle]).join(' - ');
    const rowForMatch = optionRowFromShopifyLine(line);
    const match = findVariantMatch(variantIndex, rowForMatch, sourceSku, lineName);
    const sku = sourceSku || skuFromVariantMatch(match);
    const productNo = match?.product?.productNo
      || productNoFromSku(sourceSku || sku, lineName)
      || productNoFromShopifyLine(line);
    const quantity = Math.max(1, Number(line.quantity || line.currentQuantity || 1));
    const linePrice = moneyBagAmount(line.originalUnitPriceSet);
    const lineTotal = moneyBagAmount(line.discountedTotalSet)
      || moneyBagAmount(line.originalTotalSet)
      || Number((quantity * linePrice).toFixed(2));
    const row = {
      orderName: order.name || '',
      orderNo: orderNumberValue(order.name),
      shopifyOrderId: String(order.legacyResourceId || extractShopifyLegacyId(order.id) || order.id || ''),
      shopifyOrderGid: order.id || '',
      shopifyLineItemId: line.id || '',
      shopifyLineItemLegacyId: extractShopifyLegacyId(line.id),
      shopifyProductId: String((line.product || line.variant?.product || {}).legacyResourceId || extractShopifyLegacyId((line.product || line.variant?.product || {}).id) || ''),
      shopifyVariantId: String(line.variant?.legacyResourceId || extractShopifyLegacyId(line.variant?.id) || ''),
      createdAt,
      paidAt,
      customerName,
      billingName,
      billingFirstName: billingAddress.firstName || '',
      billingLastName: billingAddress.lastName || '',
      billingZip: billingAddress.zip || '',
      billingAddress: addressTextFromShopify(billingAddress),
      billingPhone: billingAddress.phone || order.phone || '',
      shippingName,
      shippingFirstName: shippingAddress.firstName || '',
      shippingLastName: shippingAddress.lastName || '',
      shippingZip: shippingAddress.zip || '',
      shippingAddress: addressTextFromShopify(shippingAddress),
      shippingPhone: shippingAddress.phone || order.phone || billingAddress.phone || '',
      channel: channelLabel(order.sourceName || ''),
      financialStatus,
      financialStatusJa: statusJa(financialStatus),
      fulfillmentStatus,
      fulfillmentStatusJa: fulfillmentJa(fulfillmentStatus),
      lineFulfillmentStatus: fulfillmentStatus,
      lineFulfillmentStatusJa: fulfillmentJa(fulfillmentStatus),
      cancelledAt: normalizeOrderDate(order.cancelledAt || ''),
      cancelReason: order.cancelReason || '',
      shippingMethod: '',
      tags: Array.isArray(order.tags) ? order.tags.join(', ') : '',
      subtotal: 0,
      shipping: orderShippingJpy,
      orderShippingJpy,
      customerShippingRevenueJpy: 0,
      taxes: 0,
      total: orderTotal,
      orderCurrentTotalJpy: orderTotal,
      orderOriginalTotalJpy: orderOriginalTotal,
      orderRefundAmountJpy,
      quantity,
      lineName,
      linePrice,
      lineTotal: Number(lineTotal.toFixed(2)),
      sourceSku,
      sku,
      skuInferred: !sourceSku && Boolean(sku),
      skuSource: sourceSku ? 'shopify' : (sku ? 'product-master' : ''),
      productNo,
      purchaseStatus: '未発注',
      note: '',
      importedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    row.id = stableOrderRowId(row);
    return row;
  }).filter(row => row.orderName && (row.sku || row.lineName));
}

function shopifyOrderFetchLimit(input = {}) {
  const value = Number(input.limit || 100);
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(250, Math.floor(value)));
}

function shopifyOrderSearchQuery(input = {}) {
  const raw = String(input.query || '').trim();
  if (raw) return raw;
  const days = Number(input.days || 0);
  if (Number.isFinite(days) && days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return `status:any created_at:>=${since}`;
  }
  return 'status:any';
}

async function fetchShopifyOrderRowsForLedger(store, input = {}) {
  const limit = shopifyOrderFetchLimit(input);
  const queryText = shopifyOrderSearchQuery(input);
  const query = `#graphql
    query OrdersForLedger($first: Int!, $after: String, $query: String!) {
      orders(first: $first, after: $after, reverse: true, query: $query) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            legacyResourceId
            name
            createdAt
            processedAt
            displayFinancialStatus
            displayFulfillmentStatus
            cancelledAt
            cancelReason
            sourceName
            tags
            phone
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalShippingPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            shippingAddress {
              name
              firstName
              lastName
              address1
              address2
              city
              province
              provinceCode
              zip
              phone
            }
            billingAddress {
              name
              firstName
              lastName
              address1
              address2
              city
              province
              provinceCode
              zip
              phone
            }
            lineItems(first: 100) {
              edges {
                node {
                  id
                  name
                  title
                  sku
                  quantity
                  currentQuantity
                  variantTitle
                  discountedTotalSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  originalTotalSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  product {
                    id
                    legacyResourceId
                    title
                    handle
                  }
                  variant {
                    id
                    legacyResourceId
                    sku
                    title
                    selectedOptions {
                      name
                      value
                    }
                    product {
                      id
                      legacyResourceId
                      title
                      handle
                    }
                  }
                }
              }
            }
            fulfillmentOrders(first: 20) {
              edges {
                node {
                  id
                  status
                  requestStatus
                }
              }
            }
          }
        }
      }
    }`;

  let after = null;
  let remaining = limit;
  let hasNextPage = false;
  const orders = [];
  const rows = [];
  while (remaining > 0) {
    const first = Math.min(50, remaining);
    const data = await shopifyGraphql(query, { first, after, query: queryText });
    const connection = data.orders || {};
    const nodes = extractGraphqlEdges(connection);
    orders.push(...nodes);
    nodes.forEach(order => rows.push(...orderNodeToLedgerRows(store, order)));
    hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    after = connection.pageInfo?.endCursor || null;
    remaining -= nodes.length;
    if (!hasNextPage || !after || !nodes.length) break;
  }

  return {
    rows,
    orders,
    fetchedOrders: orders.length,
    query: queryText,
    limit,
    hasNextPage,
  };
}

function shopifyProcessingTargetOrderNames(rows = [], existingIndex = new Set()) {
  return new Set((rows || [])
    .filter(row => row.orderName && !hasOrderRowInKeyIndex(existingIndex, row))
    .map(row => row.orderName));
}

function fulfillmentOrdersForProcessing(order = {}) {
  return extractGraphqlEdges(order.fulfillmentOrders)
    .filter(fulfillmentOrder => {
      if (!fulfillmentOrder?.id) return false;
      const status = String(fulfillmentOrder.status || '').toUpperCase();
      if (!['OPEN', 'IN_PROGRESS'].includes(status)) return false;
      const requestStatus = String(fulfillmentOrder.requestStatus || '').toUpperCase();
      return !['CANCELLATION_REQUESTED', 'CANCELLATION_ACCEPTED'].includes(requestStatus);
    });
}

async function reportShopifyFulfillmentOrderProgress(fulfillmentOrderId, message) {
  const mutation = `#graphql
    mutation FulfillmentOrderReportProgress($id: ID!, $progressReport: FulfillmentOrderReportProgressInput) {
      fulfillmentOrderReportProgress(id: $id, progressReport: $progressReport) {
        fulfillmentOrder {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }`;
  const data = await shopifyGraphql(mutation, {
    id: fulfillmentOrderId,
    progressReport: { reasonNotes: message },
  });
  const payload = data.fulfillmentOrderReportProgress || {};
  if (payload.userErrors?.length) {
    throw new Error(payload.userErrors.map(error => error.message).join(' / '));
  }
  return payload.fulfillmentOrder || { id: fulfillmentOrderId };
}

function markLocalShopifyOrderProcessing(store, orderName, syncedAt) {
  (store.shopifyOrders || []).forEach(row => {
    if (String(row.orderName || '') !== String(orderName || '')) return;
    if (hasShopifyTrackingNumber(row)) return;
    row.fulfillmentStatus = 'unfulfilled';
    row.fulfillmentStatusJa = '未発送';
    row.lineFulfillmentStatus = 'unfulfilled';
    row.lineFulfillmentStatusJa = '未発送';
    row.shopifyProcessingStatus = '未発送のまま保持';
    row.shopifyProcessingSyncedAt = syncedAt;
    row.shopifyProcessingLastError = '';
    row.updatedAt = syncedAt;
  });
}

async function reportShopifyProcessingForFetchedOrders(store, orders = [], options = {}) {
  const targetOrderNames = options.targetOrderNames || new Set();
  const summary = {
    attempted: 0,
    success: 0,
    skipped: 0,
    failed: 0,
    source: 'shopify-fulfillment-progress',
    errors: [],
  };
  const now = new Date().toISOString();
  const message = '管理システムに注文データを取り込み済み';
  const seenFulfillmentOrders = new Set();
  for (const order of orders || []) {
    const orderName = order?.name || '';
    if (targetOrderNames.size && !targetOrderNames.has(orderName)) {
      summary.skipped += 1;
      continue;
    }
    const fulfillmentOrders = fulfillmentOrdersForProcessing(order)
      .filter(fulfillmentOrder => {
        if (seenFulfillmentOrders.has(fulfillmentOrder.id)) return false;
        seenFulfillmentOrders.add(fulfillmentOrder.id);
        return true;
      });
    if (!fulfillmentOrders.length) {
      summary.skipped += 1;
      continue;
    }
    for (const fulfillmentOrder of fulfillmentOrders) {
      summary.attempted += 1;
      try {
        await reportShopifyFulfillmentOrderProgress(fulfillmentOrder.id, message);
        summary.success += 1;
        markLocalShopifyOrderProcessing(store, orderName, now);
      } catch (error) {
        summary.failed += 1;
        summary.errors.push({
          orderName,
          fulfillmentOrderId: fulfillmentOrder.id,
          message: error.message || String(error),
        });
      }
    }
  }
  summary.errors = summary.errors.slice(0, 5);
  return summary;
}

async function analyzeShopifyOrderApiImport(store, input = {}) {
  const fetched = await fetchShopifyOrderRowsForLedger(store, input);
  const analysis = analyzeShopifyOrderRowsImport(store, fetched.rows, {
    rawRowCount: fetched.rows.length,
    source: 'shopify',
  });
  return {
    ...analysis,
    fetchedOrders: fetched.fetchedOrders,
    fetchLimit: fetched.limit,
    fetchQuery: fetched.query,
    hasNextPage: fetched.hasNextPage,
  };
}

async function mergeShopifyOrderApiImport(store, input = {}) {
  const fetched = await fetchShopifyOrderRowsForLedger(store, input);
  const existingIndex = new Set();
  (store.shopifyOrders || []).forEach(row => addOrderRowToKeyIndex(existingIndex, row));
  const processingTargetOrderNames = shopifyProcessingTargetOrderNames(fetched.rows, existingIndex);
  const result = mergeShopifyOrderRows(store, fetched.rows, {
    rawRowCount: fetched.rows.length,
    source: 'shopify',
    updateExisting: true,
  });
  const processing = {
    attempted: 0,
    success: 0,
    skipped: processingTargetOrderNames.size || 0,
    failed: 0,
    source: 'shopify-fulfillment-unchanged',
    disabled: true,
    message: 'Shopify側のフルフィルメントは未発送のまま保持します',
    errors: [],
  };
  return {
    ...result,
    fetchedOrders: fetched.fetchedOrders,
    fetchLimit: fetched.limit,
    fetchQuery: fetched.query,
    hasNextPage: fetched.hasNextPage,
    shopifyProcessing: processing,
  };
}

function normalizeHeaderKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）［］\[\]「」]/g, '');
}

function pickFlex(row, keys) {
  const direct = pickValue(row, keys);
  if (direct) return direct;
  const normalized = new Map(Object.keys(row || {}).map(key => [normalizeHeaderKey(key), key]));
  for (const key of keys) {
    const actual = normalized.get(normalizeHeaderKey(key));
    if (actual && String(row[actual] || '').trim() !== '') return String(row[actual]).trim();
  }
  return '';
}

function digitsOnly(value) {
  return String(value || '').normalize('NFKC').replace(/[^\d]/g, '');
}

function normalizeOrderKey(value) {
  return digitsOnly(value);
}

function decodeCsvBytes(buffer) {
  const candidates = [
    new TextDecoder('utf-8').decode(buffer),
    new TextDecoder('shift_jis').decode(buffer),
  ];
  const score = text => [
    'BANRI注文番号',
    '物流番号',
    '商品代金',
    '国内送料',
    '作業代',
    'カスタマー注文番号',
    '受取人',
  ].reduce((sum, key) => sum + (text.includes(key) ? 2 : 0), 0)
    - ((text.match(/[�]/g) || []).length * 3);
  return candidates.sort((a, b) => score(b) - score(a))[0].replace(/^\uFEFF/, '');
}

function csvTextFromBillingInput(input) {
  if (input.sheetBase64 || input.xlsxBase64) {
    if (!fs.existsSync(BILLING_SHEET_SCRIPT)) {
      const error = new Error('料金明細Excelの読取スクリプトが見つかりません。');
      error.status = 500;
      throw error;
    }
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const id = crypto.randomUUID();
    const xlsxFile = path.join(EXPORT_DIR, `billing_sheet_${id}.xlsx`);
    const raw = String(input.sheetBase64 || input.xlsxBase64 || '').replace(/^data:[^,]+,/, '');
    fs.writeFileSync(xlsxFile, Buffer.from(raw, 'base64'));
    const result = spawnSync(PYTHON, [BILLING_SHEET_SCRIPT, xlsxFile], {
      encoding: 'utf8',
      maxBuffer: 20_000_000,
    });
    fs.rmSync(xlsxFile, { force: true });
    if (result.status !== 0) {
      const error = new Error((result.stderr || result.stdout || '料金明細Excelを読み取れませんでした').trim());
      error.status = 400;
      throw error;
    }
    return String(result.stdout || '').replace(/^\uFEFF/, '');
  }
  if (input.csvBase64) {
    return decodeCsvBytes(Buffer.from(String(input.csvBase64).replace(/^data:[^,]+,/, ''), 'base64'));
  }
  return String(input.csv || '').replace(/^\uFEFF/, '');
}

function normalizeBillingStatus(value) {
  const status = String(value || '').trim();
  if (['未処理', '要確認', '未請求', '確認済み'].includes(status)) return status;
  return '未処理';
}

function billingRowId(row) {
  const key = [
    row.sourceRowNo,
    row.customerOrderNo,
    row.banriOrderNo,
    row.logisticsNo,
    row.productNo,
    row.sku,
    row.itemNo,
    row.productName,
    row.productStateRaw,
    row.productCostJpy,
    row.orderDate,
  ].map(value => String(value || '').trim()).join('|');
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 18);
}

function quantityFromBillingRow(row) {
  const quantity = Number(String(pickFlex(row, ['数量', '個数', 'Quantity', 'Qty']) || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function weightFromBillingRow(row) {
  const weight = Number(String(pickFlex(row, ['重量(kg)', '重量', 'Weight(kg)', 'Weight']) || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

function otherFeeFromBillingRow(row) {
  return Object.entries(row || {}).reduce((sum, [header, value]) => {
    const key = normalizeHeaderKey(header);
    const isOther = key.includes('その他') || key.includes('手数料') || key.includes('梱包') || key.includes('保険') || key.includes('関税');
    const isKnown = key.includes('作業代') || key.includes('BANRI手数料') || key.includes('手数料') || key.includes('商品代金') || key.includes('国内送料') || key.includes('国際送料');
    return isOther && !isKnown ? sum + normalizeMoney(value) : sum;
  }, 0);
}

function inheritBtocBillingRows(rows = []) {
  const carryKeys = ['カスタマー注文番号', '受取人', 'BANRI注文番号', 'ステータス', '発注日'];
  let carry = {};
  return rows.map(row => {
    const next = { ...row };
    const startsNewBillingLine = Boolean(String(next['番号'] || '').trim());
    if (startsNewBillingLine) {
      carry = {};
      carryKeys.forEach(key => {
        const value = String(next[key] || '').trim();
        if (value) carry[key] = value;
      });
      return next;
    }
    carryKeys.forEach(key => {
      const value = String(next[key] || '').trim();
      if (value) {
        carry[key] = value;
      } else if (carry[key]) {
        next[key] = carry[key];
      }
    });
    return next;
  });
}

function isBillingAdjustmentItem(item = {}) {
  const text = `${item.statusRaw || ''} ${item.productStateRaw || ''}`.normalize('NFKC');
  return Number(item.productCostJpy || 0) < 0 || /キャンセル|取消|返金/.test(text);
}

function parseBtocBillingRows(csvText) {
  const rawRows = parseCsv(csvText);
  const rows = inheritBtocBillingRows(rawRows);
  if (!rows.length) {
    const error = new Error('BTOC/BANRI料金明細CSVが空です。CSVを選択してください。');
    error.status = 400;
    throw error;
  }
  const headers = new Set(Object.keys(rows[0] || {}).map(normalizeHeaderKey));
  const hasBillingHeaders = headers.has(normalizeHeaderKey('BANRI注文番号'))
    || headers.has(normalizeHeaderKey('物流番号'))
    || headers.has(normalizeHeaderKey('商品代金(JPY)'));
  if (!hasBillingHeaders) {
    const error = new Error('BTOC/BANRI料金明細CSVとして必要な列が見つかりません。BANRI注文番号・物流番号・商品代金(JPY)があるCSVを入れてください。');
    error.status = 400;
    throw error;
  }

  return rows.map((row, index) => {
    const sku = pickFlex(row, ['SKU', 'sku']);
    const itemNo = pickFlex(row, ['品番', '商品品番', 'Item No', 'Item Number']);
    const lineName = pickFlex(row, ['商品名', '品名', '商品', '商品タイトル']);
    const productNo = normalizeProductNo(
      pickFlex(row, ['管理番号', '商品管理番号', '商品番号'])
      || productNoFromSku(sku, lineName)
    );
    const quantity = quantityFromBillingRow(row);
    const productCostJpy = normalizeMoney(pickFlex(row, ['商品代金(JPY)', '商品代金', '商品金額(JPY)', '商品金額']));
    const item = {
      id: '',
      sourceRowNo: index + 1,
      customerOrderNo: pickFlex(row, ['カスタマー注文番号', '顧客注文番号', '注文番号', 'Customer Order No']),
      recipientName: pickFlex(row, ['受取人', '受取人名', '配送先名', 'お届け先']),
      banriOrderNo: digitsOnly(pickFlex(row, ['BANRI注文番号', '発注番号', '注文番号(BANRI)', 'INVOCE NO'])),
      logisticsNo: digitsOnly(pickFlex(row, ['物流番号', '追跡番号', '中国追跡番号', '配送番号'])),
      orderDate: toYmd(pickFlex(row, ['発注日', '注文日', '買付日'])),
      shippedDate: toYmd(pickFlex(row, ['発送日', '出荷日'])),
      statusRaw: pickFlex(row, ['ステータス', '状態']),
      productStateRaw: pickFlex(row, ['商品状態', '商品ステータス', '商品状態詳細']),
      productNo,
      sku,
      itemNo,
      productName: lineName,
      quantity,
      rate: numberOrDefault(pickFlex(row, ['レート', '為替レート']), 0),
      productCostJpy,
      domesticShippingJpy: normalizeMoney(pickFlex(row, ['国内送料(JPY)', '国内送料'])),
      workFeeJpy: normalizeMoney(pickFlex(row, ['作業代(JPY)', '作業代', 'BANRI手数料(JPY)', 'BANRI手数料', '手数料(JPY)', '手数料'])),
      csvInternationalShippingJpy: normalizeMoney(pickFlex(row, ['国際送料(JPY)', '国際送料'])),
      otherFeeJpy: otherFeeFromBillingRow(row),
      weightKg: weightFromBillingRow(row),
      sourceRaw: row,
    };
    item.id = billingRowId(item);
    return item;
  }).filter(row => row.banriOrderNo || row.logisticsNo || row.customerOrderNo || row.productCostJpy);
}

function aggregateBillingRows(rows) {
  const map = new Map();
  rows.forEach(row => {
    const key = [
      row.customerOrderNo,
      row.recipientName,
      row.banriOrderNo,
      row.logisticsNo,
      row.productNo,
      row.sku,
      row.itemNo,
      row.productName,
      row.orderDate,
    ].map(value => String(value || '').trim()).join('|');
    if (!map.has(key)) {
      map.set(key, {
        ...row,
        sourceRowNos: [row.sourceRowNo],
      });
      return;
    }
    const current = map.get(key);
    current.quantity += Number(row.quantity || 0);
    current.productCostJpy += Number(row.productCostJpy || 0);
    current.domesticShippingJpy += Number(row.domesticShippingJpy || 0);
    current.workFeeJpy += Number(row.workFeeJpy || 0);
    current.csvInternationalShippingJpy += Number(row.csvInternationalShippingJpy || 0);
    current.otherFeeJpy += Number(row.otherFeeJpy || 0);
    current.weightKg += Number(row.weightKg || 0);
    current.sourceRowNos.push(row.sourceRowNo);
    if (!current.shippedDate && row.shippedDate) current.shippedDate = row.shippedDate;
    if (!current.statusRaw && row.statusRaw) current.statusRaw = row.statusRaw;
  });
  return [...map.values()].map(row => ({
    ...row,
    quantity: Math.max(1, Number(row.quantity || 1)),
    id: billingRowId(row),
  }));
}

function extractInvoicePdf(input) {
  if (!input.pdfBase64) {
    return { invoiceNumber: '', period: '', charges: [], textLength: 0 };
  }
  if (!fs.existsSync(INVOICE_SCRIPT)) {
    const error = new Error('請求PDFの読取スクリプトが見つかりません。');
    error.status = 500;
    throw error;
  }
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const id = crypto.randomUUID();
  const pdfFile = path.join(EXPORT_DIR, `invoice_${id}.pdf`);
  const raw = String(input.pdfBase64 || '').replace(/^data:[^,]+,/, '');
  fs.writeFileSync(pdfFile, Buffer.from(raw, 'base64'));
  const result = spawnSync(PYTHON, [INVOICE_SCRIPT, pdfFile], {
    encoding: 'utf8',
    maxBuffer: 10_000_000,
  });
  fs.rmSync(pdfFile, { force: true });
  if (result.status !== 0) {
    const error = new Error((result.stderr || result.stdout || '請求PDFを読み取れませんでした').trim());
    error.status = 400;
    throw error;
  }
  return JSON.parse(result.stdout || '{}');
}

function sumChargesBy(charges, type, key) {
  const map = new Map();
  (charges || []).filter(charge => charge.type === type).forEach(charge => {
    const value = String(charge[key] || '').trim();
    if (!value) return;
    map.set(value, Number(map.get(value) || 0) + Number(charge.amountJpy || 0));
  });
  return map;
}

function allocateGroupShipping(rows, total) {
  const amount = Math.round(Number(total || 0));
  if (!amount || !rows.length) return new Map(rows.map(row => [row.id, 0]));
  const bases = rows.map(row => Number(row.weightKg || 0) > 0 ? Number(row.weightKg) : Number(row.quantity || 1));
  const baseTotal = bases.reduce((sum, value) => sum + value, 0) || rows.length;
  let allocated = 0;
  const map = new Map();
  rows.forEach((row, index) => {
    const value = index === rows.length - 1
      ? amount - allocated
      : Math.round(amount * ((bases[index] || 1) / baseTotal));
    allocated += value;
    map.set(row.id, value);
  });
  return map;
}

function normalizeNameKey(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function shopifyOrderNameKeys(order) {
  return [
    order.shippingName,
    order.billingName,
    order.customerName,
  ].map(normalizeNameKey).filter(Boolean);
}

function shopifyOrderMatchesRecipient(order, recipient) {
  if (!recipient) return false;
  return shopifyOrderNameKeys(order).some(name => name.includes(recipient) || recipient.includes(name));
}

function findShopifyOrderForBilling(store, item) {
  const orders = (store.shopifyOrders || []).filter(order => !isIgnoredShopifyOrder(order));
  const customerOrderKey = normalizeOrderKey(item.customerOrderNo);
  const sku = normalizeSku(item.sku);
  const recipient = normalizeNameKey(item.recipientName);
  const productNo = normalizeProductNo(item.productNo);
  if (!customerOrderKey) return null;

  const orderLines = orders.filter(order => normalizeOrderKey(order.orderName) === customerOrderKey);
  if (orderLines.length === 1) return orderLines[0];
  if (orderLines.length > 1) {
    const bySku = sku ? orderLines.find(order => normalizeSku(order.sku) === sku) : null;
    if (bySku) return bySku;
    const byProductNo = productNo
      ? orderLines.find(order => normalizeProductNo(order.productNo) === productNo)
      : null;
    if (byProductNo) return byProductNo;
    const byName = recipient ? orderLines.find(order => shopifyOrderMatchesRecipient(order, recipient)) : null;
    if (byName) return byName;
  }
  return null;
}

function issueStatus({ issues, unbilled }) {
  if (unbilled) return '未請求';
  if (issues.length) return '要確認';
  return '未処理';
}

function billingRevenueJpy(item = {}) {
  return Math.round(Number(item.totalRevenueJpy ?? (Number(item.salesJpy || 0) + Number(item.customerShippingRevenueJpy || 0))) || 0);
}

function hasLowMargin(item) {
  return billingRevenueJpy(item) > 0 && Number(item.grossMarginPct || 0) <= LOW_MARGIN_THRESHOLD;
}

function hasMissingTracking(item) {
  if (isBillingAdjustmentItem(item)) return false;
  return !String(item.logisticsNo || '').trim();
}

function hasMeaningfulItemNo(value) {
  const text = String(value || '').trim();
  return Boolean(text && !/^\d+$/.test(text));
}

function hasItemNoOnly(item) {
  return Boolean(hasMeaningfulItemNo(item.itemNo) && !String(item.sku || '').trim() && !String(item.productNo || '').trim());
}

function missingBillingCsvLabels(item) {
  const labels = [];
  if (!String(item.customerOrderNo || '').trim()) labels.push('カスタマー注文');
  if (!String(item.sku || '').trim() && !String(item.productNo || '').trim()) labels.push('SKU/管理番号');
  if (!String(item.productName || '').trim()) labels.push('商品名');
  if (!Number(item.weightKg || 0)) labels.push('重量');
  if (!String(item.shippedDate || '').trim()) labels.push('発送日');
  return labels;
}

function isFinalCandidate(item) {
  return item.status !== '確認済み'
    && !((item.issues || []).length)
    && !hasLowMargin(item)
    && Boolean(String(item.banriOrderNo || '').trim())
    && Boolean(String(item.logisticsNo || '').trim())
    && Number(item.productCostJpy || 0) > 0
    && (
      Number(item.allocatedInternationalShippingJpy || 0) > 0
      || Number(item.csvInternationalShippingJpy || 0) > 0
      || Number(item.invoiceInternationalGroupJpy || 0) > 0
    )
    && billingRevenueJpy(item) > 0;
}

function needsBillingAction(item) {
  return item.status !== '確認済み' && (
    item.status === '要確認'
    || item.status === '未請求'
    || (item.issues || []).length > 0
    || hasLowMargin(item)
    || hasMissingTracking(item)
  );
}

function buildBillingPreview(store, input = {}, existingItems = []) {
  const storeWithDeliveryGroups = {
    ...store,
    shopifyOrders: enrichShopifyOrdersWithDeliveryGroups(store.shopifyOrders || []),
  };
  const csvText = csvTextFromBillingInput(input);
  const invoice = extractInvoicePdf(input);
  const invoiceNumber = invoice.invoiceNumber || String(input.invoiceNumber || '').trim();
  const hasInvoice = Boolean(invoiceNumber || (invoice.charges || []).length);
  const productCharges = sumChargesBy(invoice.charges, 'product', 'banriOrderNo');
  const internationalCharges = sumChargesBy(invoice.charges, 'international_shipping', 'logisticsNo');
  const rows = aggregateBillingRows(parseBtocBillingRows(csvText));

  const groupedByLogistics = new Map();
  rows.forEach(row => {
    const key = row.logisticsNo || `row-${row.id}`;
    if (!groupedByLogistics.has(key)) groupedByLogistics.set(key, []);
    groupedByLogistics.get(key).push(row);
  });
  const shippingAllocations = new Map();
  groupedByLogistics.forEach((groupRows, logisticsNo) => {
    const invoiceShipping = internationalCharges.get(logisticsNo);
    const csvShipping = groupRows.reduce((sum, row) => sum + Number(row.csvInternationalShippingJpy || 0), 0);
    const totalShipping = invoiceShipping != null ? invoiceShipping : csvShipping;
    allocateGroupShipping(groupRows, totalShipping).forEach((value, key) => shippingAllocations.set(key, value));
  });

  const existingById = new Map((existingItems || []).map(item => [item.id, item]));
  const items = rows.map(row => {
    const issues = [];
    const notices = [];
    let unbilled = false;
    const shopifyOrder = findShopifyOrderForBilling(storeWithDeliveryGroups, row);
    const invoiceProductJpy = productCharges.get(row.banriOrderNo);
    const invoiceInternationalGroupJpy = internationalCharges.get(row.logisticsNo);
    const allocatedInternationalShippingJpy = Number(shippingAllocations.get(row.id) || 0);
    const isAdjustment = isBillingAdjustmentItem(row);

    if (!row.banriOrderNo) issues.push('BANRI注文番号なし');
    if (!row.logisticsNo && !isAdjustment) issues.push('物流番号なし');
    if (isAdjustment) notices.push('キャンセル/調整行として計上');
    if (hasItemNoOnly(row)) notices.push(`品番のみ取得: ${row.itemNo}`);
    if (hasInvoice && row.banriOrderNo && invoiceProductJpy == null) {
      unbilled = true;
      issues.push('商品代金が請求書に未記載');
    }
    if (hasInvoice && row.logisticsNo && invoiceInternationalGroupJpy == null && row.csvInternationalShippingJpy <= 0) {
      unbilled = true;
      issues.push('国際送料が請求書に未記載');
    }
    const productDiffJpy = invoiceProductJpy == null ? 0 : Number(invoiceProductJpy) - Number(row.productCostJpy || 0);
    if (invoiceProductJpy != null && Math.abs(productDiffJpy) >= 2) {
      issues.push(`商品代金差額 ${productDiffJpy}円`);
    }
    if (!shopifyOrder) {
      issues.push('Shopify売上未一致');
      if (!normalizeOrderKey(row.customerOrderNo)) {
        notices.push('注文IDなし: 顧客名だけではShopify注文へ紐づけません');
      }
    }

    const salesJpy = Number(shopifyOrder?.lineTotal || shopifyOrder?.total || 0);
    const customerShippingRevenueJpy = Math.round(Number(shopifyOrder?.customerShippingRevenueJpy || 0));
    const totalRevenueJpy = Math.round(salesJpy + customerShippingRevenueJpy);
    const resolvedProductNo = row.productNo || shopifyOrder?.productNo || '';
    const resolvedSku = row.sku || shopifyOrder?.sku || '';
    const resolvedProductName = row.productName || shopifyOrder?.lineName || '';
    if (shopifyOrder) {
      const filledFromShopify = [];
      if (!row.productNo && shopifyOrder.productNo) filledFromShopify.push('管理番号');
      if (!row.sku && shopifyOrder.sku) filledFromShopify.push('SKU');
      if (!row.productName && shopifyOrder.lineName) filledFromShopify.push('商品名');
      if (salesJpy > 0) filledFromShopify.push('商品売上');
      if (customerShippingRevenueJpy > 0) filledFromShopify.push('送料売上');
      if (filledFromShopify.length) notices.push(`Shopify補完: ${filledFromShopify.join(' / ')}`);
    }
    const missingCsvLabels = missingBillingCsvLabels({
      ...row,
      productNo: resolvedProductNo,
      sku: resolvedSku,
      productName: resolvedProductName,
    });
    if (missingCsvLabels.length) notices.push(`CSV空欄: ${missingCsvLabels.join(' / ')}`);
    const totalCostJpy = Math.round(
      Number(row.productCostJpy || 0)
      + Number(row.domesticShippingJpy || 0)
      + Number(row.workFeeJpy || 0)
      + allocatedInternationalShippingJpy
      + Number(row.otherFeeJpy || 0)
    );
    const grossProfitJpy = Math.round(totalRevenueJpy - totalCostJpy);
    const grossMarginPct = totalRevenueJpy ? grossProfitJpy / totalRevenueJpy : 0;
    const unitQuantity = Math.max(1, Number(row.quantity || 1));
    const unitCostJpy = Math.round(totalCostJpy / unitQuantity);
    const unitSalesJpy = Math.round(totalRevenueJpy / unitQuantity);
    const unitProductSalesJpy = Math.round(salesJpy / unitQuantity);
    const unitCustomerShippingRevenueJpy = Math.round(customerShippingRevenueJpy / unitQuantity);
    const unitGrossProfitJpy = Math.round(unitSalesJpy - unitCostJpy);
    const unitCostRatePct = unitSalesJpy ? unitCostJpy / unitSalesJpy : 0;
    const unitGrossMarginPct = unitSalesJpy ? unitGrossProfitJpy / unitSalesJpy : 0;
    if (totalRevenueJpy > 0 && grossMarginPct <= LOW_MARGIN_THRESHOLD) {
      issues.push('粗利率30%以下');
    }
    const groupRows = groupedByLogistics.get(row.logisticsNo || `row-${row.id}`) || [row];
    const existing = existingById.get(row.id);
    const computedStatus = issueStatus({ issues, unbilled });
    const status = existing?.status === '確認済み' ? '確認済み' : computedStatus;

    const item = {
      ...row,
      productNo: resolvedProductNo,
      sku: resolvedSku,
      productName: resolvedProductName,
      invoiceNumber,
      invoicePeriod: invoice.period || '',
      invoiceProductJpy: invoiceProductJpy == null ? 0 : Number(invoiceProductJpy),
      invoiceInternationalGroupJpy: invoiceInternationalGroupJpy == null ? 0 : Number(invoiceInternationalGroupJpy),
      allocatedInternationalShippingJpy,
      internationalShippingSource: invoiceInternationalGroupJpy != null ? 'pdf' : (row.csvInternationalShippingJpy > 0 ? 'csv' : ''),
      totalCostJpy,
      salesJpy,
      customerShippingRevenueJpy,
      totalRevenueJpy,
      grossProfitJpy,
      grossMarginPct,
      unitCostJpy,
      unitSalesJpy,
      unitProductSalesJpy,
      unitCustomerShippingRevenueJpy,
      unitGrossProfitJpy,
      unitCostRatePct,
      unitGrossMarginPct,
      productDiffJpy,
      shopifyOrderId: shopifyOrder?.id || '',
      shopifyOrderName: shopifyOrder?.orderName || '',
      shopifyOrderMatchSource: shopifyOrder ? 'order-id' : '',
      shopifyLineName: shopifyOrder?.lineName || '',
      deliveryGroupId: shopifyOrder?.deliveryGroupId || '',
      deliveryGroupSize: Number(shopifyOrder?.deliveryGroupSize || 0),
      deliveryGroupOrderNames: shopifyOrder?.deliveryGroupOrderNames || [],
      deliveryGroupLabel: shopifyOrder?.deliveryGroupLabel || '',
      deliveryGroupReason: shopifyOrder?.deliveryGroupReason || '',
      coShipmentCount: groupRows.length,
      coShipmentBanriOrders: uniqueParts(groupRows.map(item => item.banriOrderNo)),
      issues,
      notices,
      unbilled,
      status,
      note: existing?.note || '',
      confirmedAt: existing?.confirmedAt || '',
      importedAt: existing?.importedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return existing ? applyManualOverridesToBillingItem(item, existing) : item;
  });

  return {
    invoice: {
      invoiceNumber,
      period: invoice.period || '',
      chargeCount: (invoice.charges || []).length,
      productChargeCount: (invoice.charges || []).filter(charge => charge.type === 'product').length,
      internationalChargeCount: (invoice.charges || []).filter(charge => charge.type === 'international_shipping').length,
    },
    rowsRead: rows.length,
    items,
    summary: billingSummary(items),
  };
}

function enrichBillingItemsWithDeliveryGroups(store, items = []) {
  const orders = enrichShopifyOrdersWithDeliveryGroups(store.shopifyOrders || []);
  const byId = new Map(orders.map(order => [order.id, order]));
  const byOrderKey = new Map();
  orders.forEach(order => {
    const key = normalizeOrderKey(order.orderName);
    if (!key) return;
    if (!byOrderKey.has(key)) byOrderKey.set(key, []);
    byOrderKey.get(key).push(order);
  });

  const matchOrder = item => {
    if (!isTrustedBillingOrderMatch(item)) return null;
    const direct = byId.get(item.shopifyOrderId);
    if (direct) return direct;
    const orderKeys = trustedBillingOrderKeys(item);
    for (const key of orderKeys) {
      const lines = byOrderKey.get(key) || [];
      if (lines.length === 1) return lines[0];
      if (lines.length > 1) {
        const sku = normalizeSku(item.sku);
        const productNo = normalizeProductNo(item.productNo);
        const recipient = normalizeNameKey(item.recipientName);
        const bySku = sku ? lines.find(order => normalizeSku(order.sku) === sku) : null;
        if (bySku) return bySku;
        const byProductNo = productNo ? lines.find(order => normalizeProductNo(order.productNo) === productNo) : null;
        if (byProductNo) return byProductNo;
        const byName = recipient ? lines.find(order => shopifyOrderMatchesRecipient(order, recipient)) : null;
        if (byName) return byName;
        return lines[0];
      }
    }
    return null;
  };

  const enriched = items.map(item => {
    const order = matchOrder(item);
    if (!order) return item;
    const displayCustomerOrderNo = item.customerOrderNo || order.orderName || item.shopifyOrderName || '';
    const displayRecipientName = item.recipientName || order.shippingName || order.billingName || order.customerName || '';
    return {
      ...item,
      displayCustomerOrderNo,
      displayRecipientName,
      shopifyOrderLegacyId: order.shopifyOrderId || '',
      shopifySourceOrderName: order.orderName || '',
      deliveryGroupId: order.deliveryGroupId || '',
      deliveryGroupSize: Number(order.deliveryGroupSize || 0),
      deliveryGroupOrderNames: order.deliveryGroupOrderNames || [],
      deliveryGroupLabel: order.deliveryGroupLabel || '',
      deliveryGroupReason: order.deliveryGroupReason || '',
    };
  });

  const trustedGroupKey = item => trustedBillingOrderKeys(item)[0] || '';

  const orderGroups = new Map();
  enriched.forEach(item => {
    const key = trustedGroupKey(item);
    if (!key) return;
    if (!orderGroups.has(key)) orderGroups.set(key, []);
    orderGroups.get(key).push(item);
  });

  return enriched.map(item => {
    const key = trustedGroupKey(item);
    const group = key ? (orderGroups.get(key) || []) : [];
    if (group.length <= 1) return item;
    const index = group.findIndex(row => row.id === item.id);
    return {
      ...item,
      orderGroupId: `order-${key}`,
      orderGroupSize: group.length,
      orderGroupIndex: index >= 0 ? index + 1 : 1,
      orderGroupLabel: `同一注文 ${group.length}点`,
      orderGroupRecipientName: uniqueParts(group.map(row => row.displayRecipientName || row.recipientName))[0] || '',
      orderGroupProductNos: uniqueParts(group.map(row => row.productNo)),
      orderGroupSkus: uniqueParts(group.map(row => row.sku)),
    };
  });
}

function hasCoDeliveryCandidate(item) {
  return Number(item.deliveryGroupSize || 0) > 1;
}

function billingSummary(items = []) {
  const statusCount = status => items.filter(item => item.status === status).length;
  const deliveryGroups = new Set(items
    .filter(hasCoDeliveryCandidate)
    .map(item => item.deliveryGroupId || item.deliveryGroupLabel)
    .filter(Boolean));
  return {
    itemCount: items.length,
    pendingCount: statusCount('未処理'),
    needsReviewCount: statusCount('要確認'),
    unbilledCount: statusCount('未請求'),
    confirmedCount: statusCount('確認済み'),
    actionCount: items.filter(needsBillingAction).length,
    missingTrackingCount: items.filter(hasMissingTracking).length,
    lowMarginCount: items.filter(hasLowMargin).length,
    itemNoOnlyCount: items.filter(hasItemNoOnly).length,
    coDeliveryCount: items.filter(hasCoDeliveryCandidate).length,
    coDeliveryGroupCount: deliveryGroups.size,
    finalCandidateCount: items.filter(isFinalCandidate).length,
    totalProductSalesJpy: Math.round(items.reduce((sum, item) => sum + Number(item.salesJpy || 0), 0)),
    totalCustomerShippingRevenueJpy: Math.round(items.reduce((sum, item) => sum + Number(item.customerShippingRevenueJpy || 0), 0)),
    totalSalesJpy: Math.round(items.reduce((sum, item) => sum + billingRevenueJpy(item), 0)),
    totalRevenueJpy: Math.round(items.reduce((sum, item) => sum + billingRevenueJpy(item), 0)),
    totalCostJpy: Math.round(items.reduce((sum, item) => sum + Number(item.totalCostJpy || 0), 0)),
    totalGrossProfitJpy: Math.round(items.reduce((sum, item) => sum + Number(item.grossProfitJpy || 0), 0)),
  };
}

const BILLING_MANUAL_FIELDS = [
  'customerOrderNo',
  'recipientName',
  'banriOrderNo',
  'logisticsNo',
  'invoiceNumber',
  'productNo',
  'sku',
  'productName',
  'quantity',
  'productCostJpy',
  'domesticShippingJpy',
  'workFeeJpy',
  'allocatedInternationalShippingJpy',
  'otherFeeJpy',
  'salesJpy',
  'customerShippingRevenueJpy',
];

const BILLING_MONEY_FIELDS = [
  'productCostJpy',
  'domesticShippingJpy',
  'workFeeJpy',
  'allocatedInternationalShippingJpy',
  'otherFeeJpy',
  'salesJpy',
  'customerShippingRevenueJpy',
];

const BILLING_MANUAL_FIELD_LABELS = {
  customerOrderNo: 'カスタマー注文',
  recipientName: '受取人',
  banriOrderNo: 'BANRI注文番号',
  logisticsNo: '物流番号',
  invoiceNumber: '請求書番号',
  productNo: '管理番号',
  sku: 'SKU',
  productName: '商品名',
  quantity: '数量',
  productCostJpy: '商品代金',
  domesticShippingJpy: '国内送料',
  workFeeJpy: 'BANRI手数料',
  allocatedInternationalShippingJpy: '国際送料按分',
  otherFeeJpy: 'その他費用',
  salesJpy: '商品売上',
  customerShippingRevenueJpy: '送料売上',
};

function normalizeBillingManualValue(key, value) {
  if (key === 'quantity') return Math.max(1, Number(value || 1));
  if (BILLING_MONEY_FIELDS.includes(key)) return Math.round(normalizeMoney(value));
  if (['banriOrderNo', 'logisticsNo'].includes(key)) return digitsOnly(value);
  if (key === 'productNo') return normalizeProductNo(value);
  if (key === 'sku') return normalizeSku(value);
  return String(value || '').trim();
}

function autoBillingIssues(item) {
  const issues = [];
  if (!String(item.banriOrderNo || '').trim()) issues.push('BANRI注文番号なし');
  if (!String(item.logisticsNo || '').trim() && !isBillingAdjustmentItem(item)) issues.push('物流番号なし');
  if (Number(item.invoiceProductJpy || 0) > 0) {
    const productDiffJpy = Number(item.invoiceProductJpy || 0) - Number(item.productCostJpy || 0);
    item.productDiffJpy = productDiffJpy;
    if (Math.abs(productDiffJpy) >= 2) issues.push(`商品代金差額 ${productDiffJpy}円`);
  }
  if (Number(item.salesJpy || 0) <= 0) issues.push('Shopify商品売上未一致');
  if (hasLowMargin(item)) issues.push('粗利率30%以下');
  return issues;
}

function autoBillingNotices(item) {
  const notices = [];
  if (isBillingAdjustmentItem(item)) notices.push('キャンセル/調整行として計上');
  if (hasItemNoOnly(item)) notices.push(`品番のみ取得: ${item.itemNo}`);
  const missingCsvLabels = missingBillingCsvLabels(item);
  if (missingCsvLabels.length) notices.push(`CSV空欄: ${missingCsvLabels.join(' / ')}`);
  if (item.manualAdjustedAt) notices.push(`手動修正あり: ${item.manualAdjustedAt.slice(0, 16).replace('T', ' ')}`);
  return notices;
}

function manualFieldsForBillingItem(item) {
  if (Array.isArray(item.manualFields) && item.manualFields.length) {
    return item.manualFields.filter(key => BILLING_MANUAL_FIELDS.includes(key));
  }
  return item.manualAdjustedAt ? BILLING_MANUAL_FIELDS : [];
}

function manualFieldLabelsForBillingItem(item) {
  return manualFieldsForBillingItem(item)
    .map(key => BILLING_MANUAL_FIELD_LABELS[key] || key)
    .join(' / ');
}

function recomputeBillingItem(item) {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const totalCostJpy = Math.round(
    Number(item.productCostJpy || 0)
    + Number(item.domesticShippingJpy || 0)
    + Number(item.workFeeJpy || 0)
    + Number(item.allocatedInternationalShippingJpy || 0)
    + Number(item.otherFeeJpy || 0)
  );
  const salesJpy = Math.round(Number(item.salesJpy || 0));
  const customerShippingRevenueJpy = Math.round(Number(item.customerShippingRevenueJpy || 0));
  const totalRevenueJpy = Math.round(salesJpy + customerShippingRevenueJpy);
  const grossProfitJpy = Math.round(totalRevenueJpy - totalCostJpy);
  const grossMarginPct = totalRevenueJpy ? grossProfitJpy / totalRevenueJpy : 0;
  const unitCostJpy = Math.round(totalCostJpy / quantity);
  const unitSalesJpy = Math.round(totalRevenueJpy / quantity);
  const unitProductSalesJpy = Math.round(salesJpy / quantity);
  const unitCustomerShippingRevenueJpy = Math.round(customerShippingRevenueJpy / quantity);
  const unitGrossProfitJpy = Math.round(unitSalesJpy - unitCostJpy);
  const unitCostRatePct = unitSalesJpy ? unitCostJpy / unitSalesJpy : 0;
  const unitGrossMarginPct = unitSalesJpy ? unitGrossProfitJpy / unitSalesJpy : 0;

  Object.assign(item, {
    quantity,
    totalCostJpy,
    salesJpy,
    customerShippingRevenueJpy,
    totalRevenueJpy,
    grossProfitJpy,
    grossMarginPct,
    unitCostJpy,
    unitSalesJpy,
    unitProductSalesJpy,
    unitCustomerShippingRevenueJpy,
    unitGrossProfitJpy,
    unitCostRatePct,
    unitGrossMarginPct,
  });

  const previousUnbilledIssues = (item.issues || []).filter(issue => String(issue).includes('未記載'));
  item.issues = uniqueParts([...autoBillingIssues(item), ...previousUnbilledIssues]);
  item.notices = autoBillingNotices(item);
  if (item.status !== '確認済み') {
    item.status = issueStatus({ issues: item.issues, unbilled: Boolean(item.unbilled) });
    item.confirmedAt = '';
  }
  item.updatedAt = new Date().toISOString();
  return item;
}

function applyManualOverridesToBillingItem(item, current) {
  const manualFields = manualFieldsForBillingItem(current);
  if (!manualFields.length) return item;
  manualFields.forEach(key => {
    if (current[key] != null) item[key] = current[key];
  });
  item.manualAdjustedAt = current.manualAdjustedAt;
  item.manualFields = manualFields;
  return recomputeBillingItem(item);
}

const BILLING_ITEM_DIFF_FIELDS = [
  'customerOrderNo',
  'shopifyOrderName',
  'recipientName',
  'displayCustomerOrderNo',
  'displayRecipientName',
  'banriOrderNo',
  'logisticsNo',
  'itemNo',
  'productNo',
  'sku',
  'productName',
  'quantity',
  'productCostJpy',
  'domesticShippingJpy',
  'workFeeJpy',
  'csvInternationalShippingJpy',
  'allocatedInternationalShippingJpy',
  'otherFeeJpy',
  'totalCostJpy',
  'salesJpy',
  'customerShippingRevenueJpy',
  'totalRevenueJpy',
  'grossProfitJpy',
  'grossMarginPct',
  'unitCostJpy',
  'unitSalesJpy',
  'unitGrossProfitJpy',
  'status',
  'unbilled',
  'shopifyTrackingStatus',
  'shopifyTrackingNumber',
  'deliveryGroupId',
  'deliveryGroupLabel',
];

function comparableBillingItem(item = {}) {
  const comparable = {};
  BILLING_ITEM_DIFF_FIELDS.forEach(key => {
    if (item[key] != null) comparable[key] = item[key];
  });
  comparable.issues = uniqueParts(item.issues || []).sort();
  comparable.notices = uniqueParts(item.notices || []).sort();
  comparable.manualFields = uniqueParts(item.manualFields || []).sort();
  return comparable;
}

function billingItemChanged(before = {}, after = {}) {
  return JSON.stringify(comparableBillingItem(before)) !== JSON.stringify(comparableBillingItem(after));
}

function summarizeBillingPreviewChanges(store, preview, input = {}) {
  const existing = new Map((store.billingItems || []).map(item => [item.id, item]));
  const replaceExisting = Boolean(input.replaceExisting);
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const seenIds = new Set();
  (preview.items || []).forEach(item => {
    seenIds.add(item.id);
    const current = existing.get(item.id);
    if (!current) {
      added += 1;
      return;
    }
    const merged = {
      ...current,
      ...item,
      status: current.status === '確認済み' ? '確認済み' : item.status,
      note: current.note || item.note || '',
      confirmedAt: current.confirmedAt || '',
      importedAt: current.importedAt || item.importedAt,
      updatedAt: new Date().toISOString(),
    };
    applyManualOverridesToBillingItem(merged, current);
    if (billingItemChanged(current, merged)) updated += 1;
    else unchanged += 1;
  });
  const removed = replaceExisting
    ? [...existing.keys()].filter(id => !seenIds.has(id)).length
    : 0;
  return {
    added,
    updated,
    unchanged,
    removed,
    itemCount: (preview.items || []).length,
    existingCount: existing.size,
    replaceExisting,
  };
}

function mergeBillingPreview(store, preview, input = {}) {
  const existing = new Map((store.billingItems || []).map(item => [item.id, item]));
  const replaceExisting = Boolean(input.replaceExisting);
  const next = replaceExisting ? new Map() : existing;
  const changes = summarizeBillingPreviewChanges(store, preview, input);
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const seenIds = new Set();
  preview.items.forEach(item => {
    seenIds.add(item.id);
    const current = existing.get(item.id);
    if (!current) {
      next.set(item.id, item);
      added += 1;
      return;
    }
    const merged = {
      ...current,
      ...item,
      status: current.status === '確認済み' ? '確認済み' : item.status,
      note: current.note || item.note || '',
      confirmedAt: current.confirmedAt || '',
      importedAt: current.importedAt || item.importedAt,
      updatedAt: new Date().toISOString(),
    };
    applyManualOverridesToBillingItem(merged, current);
    if (billingItemChanged(current, merged)) {
      next.set(item.id, merged);
      updated += 1;
    } else {
      next.set(item.id, current);
      unchanged += 1;
    }
  });
  const removed = changes.removed;
  store.billingItems = [...next.values()].sort(compareBillingItems);
  const history = {
    id: crypto.randomUUID(),
    importedAt: new Date().toISOString(),
    csvFileName: input.csvFileName || '',
    pdfFileName: input.pdfFileName || '',
    invoiceNumber: preview.invoice.invoiceNumber || '',
    rowCount: preview.rowsRead,
    itemCount: preview.items.length,
    added,
    updated,
    unchanged,
    removed,
    replaceExisting,
  };
  store.billingImports = [history, ...(store.billingImports || [])].slice(0, 100);
  return { added, updated, unchanged, removed, items: store.billingItems, history };
}

function compareBillingItems(a, b) {
  const orderDiff = orderNumberValue(b.displayCustomerOrderNo || b.customerOrderNo || b.shopifyOrderName)
    - orderNumberValue(a.displayCustomerOrderNo || a.customerOrderNo || a.shopifyOrderName);
  if (orderDiff) return orderDiff;
  return String(b.orderDate || b.shippedDate || '').localeCompare(String(a.orderDate || a.shippedDate || ''))
    || String(b.banriOrderNo || '').localeCompare(String(a.banriOrderNo || ''), 'ja', { numeric: true })
    || String(a.sku || '').localeCompare(String(b.sku || ''));
}

function billingMonthKey(item) {
  const source = item.shippedDate || item.orderDate || item.importedAt || '';
  const match = String(source).match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function filterBillingItems(items, input = {}) {
  const query = String(input.query || '').trim().toLowerCase();
  const status = String(input.status || '').trim();
  const month = String(input.month || '').trim();
  const bucket = String(input.bucket || '').trim();
  return (items || []).filter(item => {
    const haystack = [
      item.customerOrderNo,
      item.displayCustomerOrderNo,
      item.recipientName,
      item.displayRecipientName,
      item.orderGroupRecipientName,
      item.banriOrderNo,
      item.logisticsNo,
      item.invoiceNumber,
      item.productNo,
      item.sku,
      item.itemNo,
      item.productName,
      item.shopifyOrderName,
      item.deliveryGroupLabel,
      item.deliveryGroupReason,
      item.status,
      item.note,
      ...(item.deliveryGroupOrderNames || []),
      ...(item.orderGroupProductNos || []),
      ...(item.orderGroupSkus || []),
      ...(item.issues || []),
      ...(item.notices || []),
    ].join(' ').toLowerCase();
    let bucketOk = true;
    if (bucket === 'needsAction') bucketOk = needsBillingAction(item);
    if (bucket === 'unbilled') bucketOk = item.status === '未請求';
    if (bucket === 'missingTracking') bucketOk = hasMissingTracking(item);
    if (bucket === 'lowMargin') bucketOk = hasLowMargin(item);
    if (bucket === 'itemNoOnly') bucketOk = hasItemNoOnly(item);
    if (bucket === 'coDelivery') bucketOk = hasCoDeliveryCandidate(item);
    if (bucket === 'finalCandidate') bucketOk = isFinalCandidate(item);
    if (bucket === 'confirmed') bucketOk = item.status === '確認済み';
    return (!query || haystack.includes(query))
      && (!status || item.status === status)
      && (!month || billingMonthKey(item) === month)
      && bucketOk;
  }).sort(compareBillingItems);
}

function createBillingWorkbook(items) {
  if (!items.length) {
    const error = new Error('Excelに出力する請求突合データがありません。');
    error.status = 400;
    throw error;
  }
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const id = crypto.randomUUID();
  const jsonFile = path.join(EXPORT_DIR, `billing_reconciliation_${stamp}_${id}.json`);
  const outFile = path.join(EXPORT_DIR, `billing_reconciliation_${stamp}.xlsx`);
  fs.writeFileSync(jsonFile, JSON.stringify({ items, summary: billingSummary(items) }, null, 2));
  const result = spawnSync(PYTHON, [BILLING_EXPORT_SCRIPT, jsonFile, outFile], {
    encoding: 'utf8',
    maxBuffer: 10_000_000,
  });
  fs.rmSync(jsonFile, { force: true });
  if (result.status !== 0) {
    const error = new Error((result.stderr || result.stdout || '請求突合Excelを作成できませんでした').trim());
    error.status = 500;
    throw error;
  }
  return outFile;
}

const BILLING_CSV_COLUMNS = [
  ['ステータス', item => item.status],
  ['カスタマー注文番号', item => item.customerOrderNo],
  ['受取人', item => item.recipientName],
  ['BANRI注文番号', item => item.banriOrderNo],
  ['物流番号', item => item.logisticsNo],
  ['請求書番号', item => item.invoiceNumber],
  ['管理番号', item => item.productNo],
  ['SKU', item => item.sku],
  ['商品名', item => item.productName || item.shopifyLineName],
  ['数量', item => item.quantity],
  ['商品代金(JPY)', item => Math.round(Number(item.productCostJpy || 0))],
  ['国内送料(JPY)', item => Math.round(Number(item.domesticShippingJpy || 0))],
  ['BANRI手数料(JPY)', item => Math.round(Number(item.workFeeJpy || 0))],
  ['国際送料按分(JPY)', item => Math.round(Number(item.allocatedInternationalShippingJpy || 0))],
  ['その他費用(JPY)', item => Math.round(Number(item.otherFeeJpy || 0))],
  ['原価合計(JPY)', item => Math.round(Number(item.totalCostJpy || 0))],
  ['商品売上(JPY)', item => Math.round(Number(item.salesJpy || 0))],
  ['送料売上(JPY)', item => Math.round(Number(item.customerShippingRevenueJpy || 0))],
  ['総売上(JPY)', item => billingRevenueJpy(item)],
  ['行粗利(JPY)', item => Math.round(Number(item.grossProfitJpy || 0))],
  ['行利益率', item => csvPercent(item.grossMarginPct)],
  ['1個原価(JPY)', item => Math.round(Number(item.unitCostJpy || 0))],
  ['1個原価率', item => csvPercent(item.unitCostRatePct)],
  ['1個粗利(JPY)', item => Math.round(Number(item.unitGrossProfitJpy || 0))],
  ['1個利益率', item => csvPercent(item.unitGrossMarginPct)],
  ['同梱件数', item => item.coShipmentCount],
  ['差額/要確認', item => (item.issues || []).join(' / ')],
  ['お知らせ', item => (item.notices || []).join(' / ')],
  ['手動修正項目', item => manualFieldLabelsForBillingItem(item)],
  ['手動修正日時', item => item.manualAdjustedAt || ''],
  ['メモ', item => item.note],
  ['発注日', item => item.orderDate],
  ['発送日', item => item.shippedDate],
  ['レート', item => item.rate],
  ['CSV行', item => (item.sourceRowNos || [item.sourceRowNo]).filter(Boolean).join('/')],
  ['Shopify注文', item => item.shopifyOrderName],
  ['同梱候補', item => item.deliveryGroupLabel || ''],
  ['同梱注文', item => (item.deliveryGroupOrderNames || []).join(' / ')],
  ['Shopify商品名', item => item.shopifyLineName],
  ['取込日時', item => item.importedAt],
  ['更新日時', item => item.updatedAt],
];

function csvPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function createBillingCsv(items) {
  if (!items.length) {
    const error = new Error('CSVに出力する請求突合データがありません。');
    error.status = 400;
    throw error;
  }
  const rows = [
    BILLING_CSV_COLUMNS.map(([header]) => csvCell(header)).join(','),
    ...sortBillingItems(items).map(item =>
      BILLING_CSV_COLUMNS.map(([, getter]) => csvCell(getter(item))).join(',')
    ),
  ];
  return Buffer.from(`\uFEFF${rows.join('\r\n')}\r\n`, 'utf8');
}

function normalizeShopifyDomain(value) {
  const original = String(value || '').trim().replace(/^https?:\/\//, '');
  const adminStoreMatch = original.match(/^admin\.shopify\.com\/store\/([^/?#]+)/i);
  if (adminStoreMatch) return `${adminStoreMatch[1]}.myshopify.com`;
  const raw = original.replace(/\/.*$/, '');
  if (!raw) return '';
  if (raw === 'admin.shopify.com') return '';
  if (/^(www\.)?socora-online\.com$/i.test(raw) || /^socora-online$/i.test(raw)) {
    return 'y9wpse-tn.myshopify.com';
  }
  if (raw.includes('.myshopify.com')) return raw;
  return `${raw}.myshopify.com`;
}

function shopifyConnectionStatus() {
  const domain = normalizeShopifyDomain(SHOPIFY_STORE_DOMAIN);
  const hasPermanentToken = Boolean(SHOPIFY_ADMIN_ACCESS_TOKEN);
  const hasClientCredentials = Boolean(SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET);
  return {
    configured: Boolean(domain && (hasPermanentToken || hasClientCredentials)),
    domain,
    apiVersion: SHOPIFY_API_VERSION,
    trackingCompany: SHOPIFY_TRACKING_COMPANY,
    trackingCompanyLabel: trackingCompanyLabel(SHOPIFY_TRACKING_COMPANY),
    authMode: hasPermanentToken ? 'admin_access_token' : (hasClientCredentials ? 'client_credentials' : ''),
    missing: [
      domain ? '' : 'SHOPIFY_STORE_DOMAIN',
      (hasPermanentToken || hasClientCredentials) ? '' : 'SHOPIFY_ADMIN_ACCESS_TOKEN または SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET',
    ].filter(Boolean),
  };
}

function productHandle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractShopifyProductLegacyId(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const gidMatch = text.match(/(?:Product|ProductVariant|MediaImage)\/(\d+)/i);
  if (gidMatch) return gidMatch[1];
  const adminMatch = text.match(/\/products\/(\d+)/i);
  if (adminMatch) return adminMatch[1];
  const digits = text.match(/^\d+$/);
  return digits ? digits[0] : '';
}

function shopifyProductGid(value) {
  const text = String(value || '').trim();
  if (text.startsWith('gid://shopify/Product/')) return text;
  const legacyId = extractShopifyProductLegacyId(text);
  return legacyId ? `gid://shopify/Product/${legacyId}` : '';
}

function shopifyCollectionGid(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('gid://shopify/Collection/')) return text;
  const match = text.match(/(?:Collection|collections?)\/(\d+)/i) || text.match(/^\d+$/);
  const legacyId = match ? (match[1] || match[0]) : '';
  return legacyId ? `gid://shopify/Collection/${legacyId}` : '';
}

function productHandleFromShopifyUrl(url) {
  const text = String(url || '').trim();
  const match = text.match(/\/products\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function expectedShopifyHandle(product) {
  return productHandle(
    productHandleFromShopifyUrl(product.shopifyUrl)
    || product.productNo
    || product.localTitle
  );
}

function shopifyAdminProductUrl(productId) {
  const legacyId = extractShopifyProductLegacyId(productId);
  if (!legacyId) return '';
  const connection = shopifyConnectionStatus();
  const storeSlug = SHOPIFY_ADMIN_STORE_SLUG || (connection.domain ? connection.domain.replace(/\.myshopify\.com$/i, '') : '');
  return storeSlug ? `https://admin.shopify.com/store/${storeSlug}/products/${legacyId}` : '';
}

function shopifyStorefrontUrl(handle) {
  return handle ? `https://socora-online.com/products/${encodeURIComponent(handle)}` : '';
}

async function getShopifyAccessToken(connection) {
  if (SHOPIFY_ADMIN_ACCESS_TOKEN) return SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    const error = new Error('Shopify APIの認証情報が未設定です。');
    error.status = 400;
    throw error;
  }
  const now = Date.now();
  if (
    shopifyTokenCache.domain === connection.domain
    && shopifyTokenCache.accessToken
    && shopifyTokenCache.expiresAt > now + 60_000
  ) {
    return shopifyTokenCache.accessToken;
  }
  const res = await fetch(`https://${connection.domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const message = data.error_description || data.error || `Shopify APIトークンの取得に失敗しました (${res.status})`;
    const error = new Error(message);
    error.status = res.status || 502;
    throw error;
  }
  const expiresIn = Number(data.expires_in || 0);
  shopifyTokenCache.domain = connection.domain;
  shopifyTokenCache.accessToken = data.access_token;
  shopifyTokenCache.expiresAt = now + (expiresIn > 0 ? expiresIn * 1000 : 55 * 60 * 1000);
  return data.access_token;
}

function sagawaTrackingUrl(trackingNumber) {
  const no = String(trackingNumber || '').replace(/[^\d]/g, '');
  return no ? `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${encodeURIComponent(no)}` : '';
}

function normalizeDeliveryStatus(value) {
  const text = String(value || '').trim();
  if (!text) return '未確認';
  if (/配達完了|配達済|お届け済|delivered/i.test(text)) return '配達済み';
  if (/配達中|持出|持ち出|out for delivery/i.test(text)) return '配達中';
  if (/輸送|輸送中|配送中|移動中|in transit/i.test(text)) return '輸送中';
  if (/集荷|引受|受付|pickup|accepted/i.test(text)) return '集荷済み';
  if (/持戻|持ち戻|不在|保管|返送|調査|failed|exception/i.test(text)) return '持戻り';
  if (/未確認|該当.*(なし|ありません)|確認できません|見つかりません/.test(text)) return '未確認';
  return text;
}

function trackingNumberFromOrder(row = {}) {
  if (row.trackingNumberDisabled) return '';
  return digitsOnly(row.shopifyTrackingNumber || row.trackingNumber || row.logisticsNo);
}

function setOrderTrackingNumberDisabled(row, disabled) {
  if (!row) return;
  if (!disabled) {
    delete row.trackingNumberDisabled;
    return;
  }
  row.trackingNumberDisabled = true;
  delete row.trackingNumber;
  delete row.logisticsNo;
  delete row.shopifyTrackingNumber;
  delete row.shopifyTrackingUrl;
  delete row.shopifyTrackingStatus;
  delete row.shopifyTrackingLastError;
  delete row.shopifyTrackingSyncedAt;
  delete row.trackingAddedAt;
  delete row.deliveryStatus;
  delete row.trackingDeliveryStatus;
  delete row.sagawaDeliveryStatus;
  delete row.sagawaDeliveryRawStatus;
  delete row.sagawaDeliveryCheckedAt;
  delete row.sagawaDeliveryLastError;
  delete row.sagawaDeliveredAt;
  delete row.trackingStatusCheckedAt;
}

function sagawaTrackingSource() {
  return SAGAWA_TRACKING_API_URL ? 'api' : 'public';
}

function sagawaApiConfigured() {
  return Boolean(SAGAWA_TRACKING_API_URL || SAGAWA_PUBLIC_TRACKING_URL);
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value) {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSagawaPublicStatus(html) {
  const decoded = decodeHtmlEntities(html);
  const stateMatch = decoded.match(/<span[^>]+class=["'][^"']*state[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (stateMatch) return stripHtml(stateMatch[1]);

  const statusMatches = [...decoded.matchAll(/<td[^>]*>\s*(?:↓)?\s*([^<]*(?:集荷|輸送中|配達中|配達完了|配達済み|持戻|持ち戻|不在|保管)[^<]*)\s*<\/td>/gi)];
  if (statusMatches.length) return stripHtml(statusMatches[statusMatches.length - 1][1]);

  const text = stripHtml(decoded);
  if (/該当.*(なし|ありません)|確認できません|見つかりません/.test(text)) return '未確認';
  return '';
}

async function fetchSagawaPublicDeliveryStatus(trackingNumber) {
  const no = digitsOnly(trackingNumber);
  if (!no) {
    const error = new Error('追跡番号が空です。');
    error.status = 400;
    throw error;
  }
  const url = `${SAGAWA_PUBLIC_TRACKING_URL}?okurijoNo=${encodeURIComponent(no)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; SOCORA-OrderAdmin/1.0)',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`佐川急便の配送状況取得に失敗しました (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const rawStatus = extractSagawaPublicStatus(text);
  return {
    raw: { source: 'sagawa-public', url },
    status: normalizeDeliveryStatus(rawStatus),
    rawStatus: String(rawStatus || ''),
  };
}

function readNestedValue(object, paths) {
  for (const pathText of paths) {
    const value = String(pathText).split('.').reduce((current, key) => {
      if (current == null) return undefined;
      return current[key];
    }, object);
    if (value != null && String(value).trim() !== '') return value;
  }
  return '';
}

async function fetchSagawaDeliveryStatus(trackingNumber) {
  if (!sagawaApiConfigured()) {
    const error = new Error('佐川急便APIが未設定です。Renderに SAGAWA_TRACKING_API_URL と必要なら SAGAWA_TRACKING_API_KEY を設定してください。');
    error.status = 400;
    throw error;
  }
  if (!SAGAWA_TRACKING_API_URL) {
    return fetchSagawaPublicDeliveryStatus(trackingNumber);
  }
  const no = digitsOnly(trackingNumber);
  const apiUrl = SAGAWA_TRACKING_API_URL.includes('{trackingNumber}')
    ? SAGAWA_TRACKING_API_URL.replaceAll('{trackingNumber}', encodeURIComponent(no))
    : `${SAGAWA_TRACKING_API_URL}${SAGAWA_TRACKING_API_URL.includes('?') ? '&' : '?'}trackingNumber=${encodeURIComponent(no)}`;
  const headers = { Accept: 'application/json' };
  if (SAGAWA_TRACKING_API_KEY) {
    headers.Authorization = `Bearer ${SAGAWA_TRACKING_API_KEY}`;
    headers['x-api-key'] = SAGAWA_TRACKING_API_KEY;
  }
  const response = await fetch(apiUrl, { headers });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`佐川急便APIの取得に失敗しました (${response.status})`);
    error.status = response.status;
    throw error;
  }
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { status: text };
  }
  const rawStatus = readNestedValue(data, [
    'status',
    'deliveryStatus',
    'trackingStatus',
    'latestStatus',
    'result.status',
    'result.deliveryStatus',
    'data.status',
    'data.deliveryStatus',
    'items.0.status',
    'items.0.deliveryStatus',
  ]);
  return {
    raw: data,
    status: normalizeDeliveryStatus(rawStatus),
    rawStatus: String(rawStatus || ''),
  };
}

async function refreshSagawaTrackingStatuses(store) {
  if (!sagawaApiConfigured()) {
    const error = new Error('佐川急便APIが未設定です。Renderに SAGAWA_TRACKING_API_URL と必要なら SAGAWA_TRACKING_API_KEY を設定してください。');
    error.status = 400;
    throw error;
  }
  const now = new Date().toISOString();
  const rows = (store.shopifyOrders || []).filter(row => trackingNumberFromOrder(row));
  let updated = 0;
  const results = [];
  for (const row of rows) {
    const trackingNumber = trackingNumberFromOrder(row);
    try {
      const result = await fetchSagawaDeliveryStatus(trackingNumber);
      const nextStatus = result.status || '未確認';
      if (row.sagawaDeliveryStatus !== nextStatus) {
        row.sagawaDeliveryStatus = nextStatus;
        row.deliveryStatus = nextStatus;
        updated += 1;
      }
      if (!row.trackingAddedAt) row.trackingAddedAt = row.shopifyTrackingSyncedAt || now;
      row.sagawaDeliveryRawStatus = result.rawStatus || '';
      row.sagawaDeliveryCheckedAt = now;
      row.trackingStatusCheckedAt = now;
      if (nextStatus === '配達済み' && !row.sagawaDeliveredAt) row.sagawaDeliveredAt = now;
      row.updatedAt = now;
      results.push({ id: row.id, orderName: row.orderName, trackingNumber, status: nextStatus, source: sagawaTrackingSource(), ok: true });
    } catch (error) {
      row.sagawaDeliveryLastError = error.message || String(error);
      row.sagawaDeliveryCheckedAt = now;
      row.updatedAt = now;
      results.push({ id: row.id, orderName: row.orderName, trackingNumber, source: sagawaTrackingSource(), ok: false, error: error.message || String(error) });
    }
  }
  store.shopifyOrders = sortShopifyOrders(store.shopifyOrders || []);
  return { updated, checked: rows.length, source: sagawaTrackingSource(), results };
}

function normalizeTrackingCompany(value) {
  const text = String(value || '').trim();
  if (!text) return SHOPIFY_TRACKING_COMPANY;
  if (text === 'Sagawa Express' || /佐川|sagawa/i.test(text)) return 'Sagawa Express';
  return SHOPIFY_TRACKING_COMPANY;
}

function trackingCompanyLabel(company) {
  return SHOPIFY_TRACKING_COMPANY_LABELS[normalizeTrackingCompany(company)] || normalizeTrackingCompany(company);
}

function trackingUrlForCompany(trackingNumber, company) {
  if (normalizeTrackingCompany(company) === 'Sagawa Express') return sagawaTrackingUrl(trackingNumber);
  return '';
}

function trackingOrderName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.startsWith('#') ? text : `#${text}`;
}

function trackingDisabledForBillingItem(store, item = {}) {
  const orders = store.shopifyOrders || [];
  if (item.shopifyOrderId) {
    const direct = orders.find(order => String(order.id || '') === String(item.shopifyOrderId)
      || String(order.shopifyOrderId || '') === String(item.shopifyOrderId));
    if (direct) return Boolean(direct.trackingNumberDisabled);
  }
  const matchedOrder = findShopifyOrderForBilling(store, item);
  if (matchedOrder) return Boolean(matchedOrder.trackingNumberDisabled);

  const keys = trustedBillingOrderKeys(item);
  if (!keys.length) return false;
  const lines = orders.filter(order => keys.includes(normalizeOrderKey(order.orderName)));
  if (lines.length === 1) return Boolean(lines[0].trackingNumberDisabled);

  const sku = normalizeSku(item.sku);
  const productNo = normalizeProductNo(item.productNo);
  const recipient = normalizeNameKey(item.recipientName || item.displayRecipientName);
  const line = (sku ? lines.find(order => normalizeSku(order.sku) === sku) : null)
    || (productNo ? lines.find(order => normalizeProductNo(order.productNo) === productNo) : null)
    || (recipient ? lines.find(order => shopifyOrderMatchesRecipient(order, recipient)) : null);
  return Boolean(line?.trackingNumberDisabled);
}

function buildShopifyTrackingCandidates(store) {
  const items = enrichBillingItemsWithDeliveryGroups(store, store.billingItems || []);
  const groups = new Map();
  const skipped = [];
  items.forEach(item => {
    const orderName = trustedBillingTrackingOrderName(item);
    const trackingNumber = digitsOnly(item.logisticsNo);
    if (trackingDisabledForBillingItem(store, item)) {
      skipped.push({ id: item.id, reason: '追跡番号なし固定のため除外', orderName, trackingNumber });
      return;
    }
    if (isIgnoredShopifyOrder(orderName)) {
      skipped.push({ id: item.id, reason: 'テスト注文のため除外', orderName });
      return;
    }
    if (!orderName) {
      skipped.push({
        id: item.id,
        reason: '注文ID未一致のため追跡反映対象外',
        recipientName: item.recipientName || '',
        trackingNumber,
      });
      return;
    }
    if (!trackingNumber) {
      skipped.push({ id: item.id, reason: '追跡番号なし', orderName });
      return;
    }
    const key = `${orderName}|${trackingNumber}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: crypto.createHash('sha1').update(key).digest('hex').slice(0, 16),
        orderName,
        orderNo: orderNumberValue(orderName),
        trackingNumber,
        trackingUrl: trackingUrlForCompany(trackingNumber, SHOPIFY_TRACKING_COMPANY),
        company: SHOPIFY_TRACKING_COMPANY,
        companyLabel: trackingCompanyLabel(SHOPIFY_TRACKING_COMPANY),
        recipientName: item.recipientName || '',
        itemIds: [],
        productNos: [],
        skus: [],
        skuQuantities: {},
        productNames: [],
        quantity: 0,
        alreadySynced: true,
        status: '未反映',
        lastError: '',
        syncedAt: '',
      });
    }
    const group = groups.get(key);
    group.itemIds.push(item.id);
    if (item.productNo) group.productNos.push(item.productNo);
    const sku = normalizeSku(item.sku);
    if (sku) {
      group.skus.push(sku);
      group.skuQuantities[sku] = Number(group.skuQuantities[sku] || 0) + Number(item.quantity || 1);
    }
    if (item.productName || item.shopifyLineName) group.productNames.push(item.productName || item.shopifyLineName);
    group.quantity += Number(item.quantity || 1);
    if (item.recipientName && !group.recipientName) group.recipientName = item.recipientName;
    const syncedSameTracking = item.shopifyTrackingStatus === '反映済み'
      && String(item.shopifyTrackingNumber || '') === trackingNumber;
    group.alreadySynced = group.alreadySynced && syncedSameTracking;
    if (item.shopifyTrackingLastError) group.lastError = item.shopifyTrackingLastError;
    if (item.shopifyTrackingSyncedAt) group.syncedAt = item.shopifyTrackingSyncedAt;
  });

  const candidates = [...groups.values()].map(group => {
    const uniqueSkus = uniqueParts(group.skus);
    const alreadySynced = Boolean(group.alreadySynced);
    return {
      ...group,
      productNos: uniqueParts(group.productNos),
      skus: uniqueSkus,
      skuQuantities: group.skuQuantities,
      productNames: uniqueParts(group.productNames).slice(0, 3),
      ready: !alreadySynced,
      status: alreadySynced ? '反映済み' : (group.lastError ? '失敗' : '未反映'),
      syncedAt: group.syncedAt || '',
      lastError: group.lastError || '',
    };
  }).sort((a, b) => Number(b.orderNo || 0) - Number(a.orderNo || 0));

  return {
    connection: shopifyConnectionStatus(),
    candidates,
    skipped,
    summary: {
      total: candidates.length,
      ready: candidates.filter(item => item.ready).length,
      synced: candidates.filter(item => item.status === '反映済み').length,
      failed: candidates.filter(item => item.status === '失敗').length,
      skipped: skipped.length,
    },
  };
}

function fulfillmentPayloadQuantity(lineItemsByFulfillmentOrder = []) {
  return (lineItemsByFulfillmentOrder || []).reduce((total, group) => (
    total + (group.fulfillmentOrderLineItems || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  ), 0);
}

function remoteFulfillableQuantity(order, candidate) {
  try {
    return fulfillmentPayloadQuantity(buildFulfillmentOrderPayload(order, candidate));
  } catch (_) {
    return 0;
  }
}

function refreshShopifyTrackingSummary(preview) {
  preview.summary = {
    ...preview.summary,
    total: preview.candidates.length,
    ready: preview.candidates.filter(item => item.ready).length,
    synced: preview.candidates.filter(item => item.status === '反映済み').length,
    failed: preview.candidates.filter(item => item.status === '失敗').length,
  };
  return preview;
}

async function buildShopifyTrackingCandidatesWithRemoteCheck(store) {
  const preview = buildShopifyTrackingCandidates(store);
  if (!preview.connection?.configured) return preview;

  for (const candidate of preview.candidates) {
    try {
      const order = await fetchShopifyOrderForTracking(candidate.orderName);
      if (!order) {
        candidate.remoteWarning = 'Shopifyで注文が見つかりません';
        continue;
      }
      const existingWithTracking = findExistingFulfillmentWithTracking(order, candidate.trackingNumber);
      const remainingQuantity = remoteFulfillableQuantity(order, candidate);
      candidate.shopifyRemoteCheckedAt = new Date().toISOString();
      candidate.shopifyExistingTracking = Boolean(existingWithTracking);
      candidate.shopifyExistingFulfillmentId = existingWithTracking?.id || '';
      candidate.shopifyRemainingQuantity = remainingQuantity;

      if (existingWithTracking && remainingQuantity > 0) {
        candidate.ready = true;
        candidate.status = '未反映';
        candidate.lastError = '';
        candidate.remoteWarning = `Shopify側に未発送の商品が${remainingQuantity}点残っています`;
      } else if (existingWithTracking && remainingQuantity <= 0 && candidate.status !== '失敗') {
        candidate.ready = false;
        candidate.status = '反映済み';
        candidate.lastError = '';
      }
    } catch (error) {
      candidate.remoteWarning = error.message || String(error);
    }
  }

  return refreshShopifyTrackingSummary(preview);
}

function redactedTrackingNumber(value) {
  const no = digitsOnly(value);
  if (!no) return '';
  return `${'•'.repeat(Math.max(0, no.length - 4))}${no.slice(-4)}`;
}

function localProductShopifyIdentity(product = {}) {
  return {
    hasProductId: Boolean(product.shopifyProductId),
    hasAdminUrl: Boolean(product.shopifyAdminUrl),
    hasStorefrontUrl: Boolean(product.shopifyUrl),
    productId: product.shopifyProductId ? extractShopifyProductLegacyId(product.shopifyProductId) : '',
    handle: expectedShopifyHandle(product),
    adminUrl: product.shopifyAdminUrl || '',
    storefrontUrl: product.shopifyUrl || '',
  };
}

function productTitleRisk(product = {}) {
  let safeTitle = '';
  let blockedReason = '';
  try {
    safeTitle = safeShopifyTitleForCreate(product);
  } catch (error) {
    blockedReason = error.message || String(error);
  }
  const fields = {
    localTitle: product.localTitle || '',
    shopifyTitle: product.shopifyTitle || '',
    managementTitle: product.managementTitle || '',
    sourceTitle: product.sourceTitle || '',
    originalTitle: product.originalTitle || '',
    title: product.title || '',
  };
  const suspiciousFields = Object.entries(fields)
    .filter(([, value]) => value && looksUnsafeShopifyTitle(value))
    .map(([field, value]) => ({ field, value: String(value).slice(0, 120) }));
  return {
    safe: Boolean(safeTitle),
    safeTitle,
    blockedReason,
    suspiciousFields,
  };
}

async function runShopifyApiHealth(store) {
  const connection = shopifyConnectionStatus();
  const health = {
    ok: false,
    connection,
    checks: {
      shop: { ok: false },
      productsRead: { ok: false },
      ordersRead: { ok: false },
      scopes: { ok: false },
    },
    requiredScopeStatus: {},
    warnings: [],
  };
  if (!connection.configured) {
    health.warnings.push(`Shopify API設定が未完了です: ${connection.missing.join(' / ')}`);
    return health;
  }

  try {
    const shopData = await shopifyGraphql(`query IntegrationHealthShop { shop { name myshopifyDomain } }`);
    health.checks.shop = {
      ok: Boolean(shopData.shop?.myshopifyDomain),
      name: shopData.shop?.name || '',
      myshopifyDomain: shopData.shop?.myshopifyDomain || '',
    };
  } catch (error) {
    health.checks.shop = { ok: false, error: error.message || String(error) };
  }

  try {
    const productData = await shopifyGraphql(`query IntegrationHealthProducts { products(first: 1) { edges { node { id legacyResourceId title handle status } } } }`);
    const sample = extractGraphqlEdges(productData.products)[0] || null;
    health.checks.productsRead = {
      ok: true,
      sample: sample ? {
        id: sample.legacyResourceId || extractShopifyProductLegacyId(sample.id) || '',
        title: sample.title || '',
        handle: sample.handle || '',
        status: sample.status || '',
      } : null,
    };
  } catch (error) {
    health.checks.productsRead = { ok: false, error: error.message || String(error) };
  }

  try {
    const orderData = await shopifyGraphql(`query IntegrationHealthOrders { orders(first: 1, reverse: true) { edges { node { id name createdAt displayFulfillmentStatus } } } }`);
    const sample = extractGraphqlEdges(orderData.orders)[0] || null;
    health.checks.ordersRead = {
      ok: true,
      sample: sample ? {
        name: sample.name || '',
        createdAt: sample.createdAt || '',
        fulfillmentStatus: sample.displayFulfillmentStatus || '',
      } : null,
    };
  } catch (error) {
    health.checks.ordersRead = { ok: false, error: error.message || String(error) };
  }

  try {
    const scopeData = await shopifyGraphql(`query IntegrationHealthScopes { currentAppInstallation { accessScopes { handle } } }`);
    const scopes = (scopeData.currentAppInstallation?.accessScopes || [])
      .map(scope => scope.handle)
      .filter(Boolean)
      .sort();
    const requiredScopes = [
      'read_products',
      'write_products',
      'read_locations',
      'read_inventory',
      'write_inventory',
      'read_orders',
      'write_orders',
      'read_fulfillments',
      'write_fulfillments',
      'read_publications',
      'write_publications',
    ];
    health.checks.scopes = { ok: true, scopes };
    health.requiredScopeStatus = Object.fromEntries(requiredScopes.map(scope => [scope, scopes.includes(scope)]));
    const missingScopes = requiredScopes.filter(scope => !scopes.includes(scope));
    if (missingScopes.length) health.warnings.push(`Shopify権限の不足候補: ${missingScopes.join(', ')}`);
  } catch (error) {
    health.checks.scopes = { ok: false, error: error.message || String(error) };
    health.warnings.push('Shopify権限一覧を取得できませんでした。商品/注文の読み取り結果を優先して確認してください。');
  }

  health.ok = Boolean(health.checks.shop.ok && health.checks.productsRead.ok && health.checks.ordersRead.ok);
  return health;
}

async function runLocalProductLinkHealth(store) {
  const products = store.products || [];
  const latest = products.slice(0, 12);
  const unsafeTitleProducts = products
    .map(product => ({
      productNo: product.productNo || '',
      localTitle: product.localTitle || product.managementTitle || product.title || '',
      titleRisk: productTitleRisk(product),
    }))
    .filter(item => !item.titleRisk.safe || item.titleRisk.suspiciousFields.length)
    .slice(0, 30);
  const missingIdentityProducts = products
    .filter(product => !product.shopifyProductId && !product.shopifyAdminUrl && !product.shopifyUrl)
    .map(product => ({ productNo: product.productNo || '', title: product.localTitle || product.managementTitle || product.title || '' }))
    .slice(0, 30);

  const remoteChecks = [];
  if (shopifyConnectionStatus().configured) {
    for (const product of latest) {
      const identity = localProductShopifyIdentity(product);
      const item = {
        productNo: product.productNo || '',
        localTitle: product.localTitle || product.managementTitle || product.title || '',
        identity,
        titleRisk: productTitleRisk(product),
        remote: { checked: false, found: false },
      };
      try {
        const { snapshot, duplicates, expectedHandle } = await fetchShopifyProductForLocalProduct(product);
        item.remote = {
          checked: true,
          found: Boolean(snapshot),
          expectedHandle,
          duplicateCount: duplicates?.length || 0,
          snapshot: snapshot ? {
            id: snapshot.legacyId || extractShopifyProductLegacyId(snapshot.id) || '',
            title: snapshot.title || '',
            handle: snapshot.handle || '',
            status: snapshot.status || '',
            variantCount: snapshot.variants?.length || 0,
            imageCount: snapshot.images?.length || 0,
            storefrontUrl: snapshot.onlineStoreUrl || '',
            adminUrl: snapshot.adminUrl || '',
          } : null,
        };
      } catch (error) {
        item.remote = { checked: true, found: false, error: error.message || String(error) };
      }
      remoteChecks.push(item);
    }
  }

  return {
    totalProducts: products.length,
    withShopifyProductId: products.filter(product => product.shopifyProductId).length,
    withShopifyAdminUrl: products.filter(product => product.shopifyAdminUrl).length,
    withoutAnyShopifyIdentity: missingIdentityProducts.length,
    unsafeTitleCount: unsafeTitleProducts.length,
    unsafeTitleProducts,
    missingIdentityProducts,
    remoteChecks,
  };
}

async function runTrackingAndSagawaHealth(store) {
  const trackingPreview = await buildShopifyTrackingCandidatesWithRemoteCheck(store);
  const orders = store.shopifyOrders || [];
  const trackingOrders = orders.filter(order => trackingNumberFromOrder(order));
  const remoteSamples = [];
  if (shopifyConnectionStatus().configured) {
    for (const candidate of (trackingPreview.candidates || []).slice(0, 5)) {
      const sample = {
        orderName: candidate.orderName,
        trackingNumber: redactedTrackingNumber(candidate.trackingNumber),
        skus: candidate.skus || [],
        localStatus: candidate.status || '',
        ready: Boolean(candidate.ready),
        remote: {
          checked: Boolean(candidate.shopifyRemoteCheckedAt),
          foundOrder: !String(candidate.remoteWarning || '').includes('注文が見つかりません'),
          existingTracking: Boolean(candidate.shopifyExistingTracking),
          remainingQuantity: Number(candidate.shopifyRemainingQuantity || 0),
          fulfillmentId: candidate.shopifyExistingFulfillmentId || '',
          warning: candidate.remoteWarning || '',
        },
      };
      remoteSamples.push(sample);
    }
  }

  const sagawa = {
    configured: sagawaApiConfigured(),
    source: sagawaTrackingSource(),
    trackingUrlBase: SAGAWA_PUBLIC_TRACKING_URL,
    trackingOrders: trackingOrders.length,
    sample: null,
  };
  const firstTracking = trackingOrders[0] ? trackingNumberFromOrder(trackingOrders[0]) : '';
  if (firstTracking && sagawa.configured) {
    try {
      const result = await fetchSagawaDeliveryStatus(firstTracking);
      const normalizedStatus = result.status || '';
      const foundTracking = Boolean(normalizedStatus && !/未確認|該当.*(なし|ありません)|確認できません|見つかりません/.test(normalizedStatus));
      sagawa.sample = {
        ok: foundTracking,
        orderName: trackingOrderName(trackingOrders[0].orderName || ''),
        trackingNumber: redactedTrackingNumber(firstTracking),
        status: normalizedStatus,
        rawStatus: result.rawStatus || '',
        warning: foundTracking ? '' : '佐川側で追跡番号が該当なし/未確認です。',
        source: sagawa.source,
      };
    } catch (error) {
      sagawa.sample = {
        ok: false,
        orderName: trackingOrderName(trackingOrders[0].orderName || ''),
        trackingNumber: redactedTrackingNumber(firstTracking),
        error: error.message || String(error),
        source: sagawa.source,
      };
    }
  }

  return {
    orderCounts: {
      shopifyOrders: orders.length,
      billingItems: (store.billingItems || []).length,
      ordersWithTrackingNumber: trackingOrders.length,
      ordersSyncedToShopifyTracking: orders.filter(order => order.shopifyTrackingStatus === '反映済み').length,
    },
    trackingPreview: {
      connection: trackingPreview.connection,
      summary: trackingPreview.summary,
      skipped: (trackingPreview.skipped || []).slice(0, 20),
      candidates: (trackingPreview.candidates || []).slice(0, 20).map(candidate => ({
        id: candidate.id,
        orderName: candidate.orderName,
        trackingNumber: redactedTrackingNumber(candidate.trackingNumber),
        company: candidate.company,
        companyLabel: candidate.companyLabel,
        skus: candidate.skus,
        productNos: candidate.productNos,
        status: candidate.status,
        ready: candidate.ready,
        lastError: candidate.lastError || '',
      })),
      remoteSamples,
    },
    sagawa,
  };
}

async function integrationHealth(store) {
  const generatedAt = new Date().toISOString();
  const [shopify, productLinks, logistics] = await Promise.all([
    runShopifyApiHealth(store),
    runLocalProductLinkHealth(store),
    runTrackingAndSagawaHealth(store),
  ]);
  const critical = [];
  if (!shopify.ok) critical.push('Shopify APIの読み取り確認が完了していません。');
  if (shopify.requiredScopeStatus?.write_products === false) {
    critical.push('Shopifyの商品作成/更新権限(write_products)が不足しています。商品登録がShopifyへ反映されない原因になります。');
  }
  if (shopify.requiredScopeStatus?.write_inventory === false) {
    critical.push('Shopifyの在庫更新権限(write_inventory)が不足しています。1688/Taobao在庫に合わせた販売可能数を反映できません。');
  }
  if (shopify.requiredScopeStatus?.read_locations === false && !SHOPIFY_INVENTORY_LOCATION_ID) {
    critical.push('Shopifyのロケーション取得権限(read_locations)が不足しています。在庫を入れる場所を特定できません。');
  }
  if (shopify.requiredScopeStatus?.write_fulfillments === false) {
    critical.push('Shopifyの発送追跡反映権限(write_fulfillments)が不足しています。追跡番号をShopifyへ反映できません。');
  }
  if (productLinks.unsafeTitleCount) critical.push('会社名/店舗名の可能性がある商品タイトルがあります。Shopifyへ登録・上書き前に修正が必要です。');
  if (productLinks.withoutAnyShopifyIdentity) critical.push('Shopify商品ID/URLがない商品があります。Shopify側との照合が必要です。');
  const trackingSummary = logistics.trackingPreview?.summary || {};
  if ((trackingSummary.failed || 0) > 0) critical.push('Shopify追跡反映に失敗状態の候補があります。');
  if (logistics.sagawa?.trackingOrders && logistics.sagawa?.sample && !logistics.sagawa.sample.ok) {
    critical.push('佐川追跡サンプルが該当なし/未確認です。追跡番号の形式、登録タイミング、配送会社の紐づけを確認してください。');
  }
  return {
    ok: critical.length === 0,
    generatedAt,
    critical,
    shopify,
    products: productLinks,
    logistics,
  };
}

async function shopifyGraphql(query, variables = {}) {
  const connection = shopifyConnectionStatus();
  if (!connection.configured) {
    const error = new Error(`Shopify APIの接続設定が未完了です。Renderの環境変数に ${connection.missing.join(' と ')} を設定してください。`);
    error.status = 400;
    throw error;
  }
  const accessToken = await getShopifyAccessToken(connection);
  const endpoint = `https://${connection.domain}/admin/api/${connection.apiVersion}/graphql.json`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) {
    const message = data.errors?.map(error => error.message).join(' / ') || `Shopify APIでエラーが発生しました (${res.status})`;
    const error = new Error(message);
    error.status = res.status || 502;
    throw error;
  }
  return data.data || {};
}

async function shopifyRest(pathname, options = {}) {
  const connection = shopifyConnectionStatus();
  if (!connection.configured) {
    const error = new Error(`Shopify APIの接続設定が未完了です。Renderの環境変数に ${connection.missing.join(' と ')} を設定してください。`);
    error.status = 400;
    throw error;
  }
  const accessToken = await getShopifyAccessToken(connection);
  const pathText = String(pathname || '').startsWith('/') ? pathname : `/${pathname}`;
  const endpoint = `https://${connection.domain}/admin/api/${connection.apiVersion}${pathText}`;
  const res = await fetch(endpoint, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      ...(options.headers || {}),
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const detail = data.errors
      ? (typeof data.errors === 'string' ? data.errors : JSON.stringify(data.errors))
      : (data.error || data.raw || `Shopify REST APIでエラーが発生しました (${res.status})`);
    const error = new Error(detail);
    error.status = res.status || 502;
    throw error;
  }
  return data;
}

function extensionFromImageContentType(contentType = '', fallbackUrl = '') {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  const pathExt = String(fallbackUrl || '').split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (pathExt && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(pathExt.toLowerCase())) {
    return pathExt.toLowerCase() === 'jpeg' ? 'jpg' : pathExt.toLowerCase();
  }
  return 'jpg';
}

async function downloadRemoteImageForShopify(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; socora-admin/1.0; +https://socora-online.com)',
      Referer: 'https://detail.1688.com/',
    },
  });
  if (!res.ok) {
    const error = new Error(`画像取得に失敗しました (${res.status})`);
    error.status = res.status || 502;
    throw error;
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType && !/^image\//i.test(contentType)) {
    const error = new Error(`画像ではないデータが返りました: ${contentType}`);
    error.status = 502;
    throw error;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) {
    const error = new Error('画像データが空です');
    error.status = 502;
    throw error;
  }
  if (buffer.length > 20 * 1024 * 1024) {
    const error = new Error('Shopifyへ送る画像が大きすぎます');
    error.status = 413;
    throw error;
  }
  return {
    attachment: buffer.toString('base64'),
    extension: extensionFromImageContentType(contentType, url),
  };
}

function shopifyImageFilename(product, index, extension) {
  return [
    String(product.productNo || 'product').toLowerCase(),
    String(index + 1).padStart(2, '0'),
  ].join('-') + `.${extension || 'jpg'}`;
}

function normalizedMediaUrlKey(url) {
  const text = String(url || '').trim();
  try {
    const parsed = new URL(text);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().toLowerCase();
  } catch(e) {
    return text.split('#')[0].split('?')[0].toLowerCase();
  }
}

function groupRowsByColorImage(rows = []) {
  const colorGroups = new Map();
  rows.forEach(row => {
    const colorName = String(row.colorJa || row.originalColor || '').trim();
    if (!colorName) return;
    const url = String(row.imageUrl || '').trim();
    if (!isRemoteMediaUrl(url)) return;
    const colorKey = normalizedCompareText(colorName);
    if (!colorGroups.has(colorKey)) {
      colorGroups.set(colorKey, {
        url,
        rows: [],
        colors: [colorName],
      });
    }
    colorGroups.get(colorKey).rows.push(row);
  });
  const imageGroups = new Map();
  for (const group of colorGroups.values()) {
    const imageKey = normalizedMediaUrlKey(group.url);
    if (!imageGroups.has(imageKey)) {
      imageGroups.set(imageKey, {
        url: group.url,
        rows: [],
        colors: [],
      });
    }
    const imageGroup = imageGroups.get(imageKey);
    imageGroup.rows.push(...group.rows);
    imageGroup.colors.push(...group.colors);
  }
  return [...imageGroups.values()];
}

function uniqueVariantIdsForImageRows(imageRows = [], snapshot = {}) {
  const bySku = new Map((snapshot.variants || [])
    .map(variant => [normalizeSku(variant.sku), String(variant.legacyId || extractShopifyProductLegacyId(variant.id) || '').trim()])
    .filter(([sku, id]) => sku && id));
  return uniqueSorted(imageRows
    .map(row => bySku.get(normalizeSku(row.sku || row.shopifySku)))
    .filter(Boolean));
}

function uniqueVariantGidsForImageRows(imageRows = [], snapshot = {}) {
  return uniqueSorted(imageRows
    .map(row => findShopifyVariantForRow(row, snapshot)?.id || '')
    .filter(id => /^gid:\/\/shopify\/ProductVariant\//i.test(id)));
}

function findShopifyVariantForRow(row, snapshot = {}) {
  const variants = snapshot.variants || [];
  const sku = normalizeSku(row.sku || row.shopifySku);
  if (sku) {
    const bySku = variants.find(variant => normalizeSku(variant.sku) === sku);
    if (bySku) return bySku;
  }
  const colorKey = normalizedCompareText(row.colorJa || row.originalColor);
  const sizeKey = normalizedCompareText(row.sizeJa || row.originalSize);
  return variants.find(variant => (
    normalizedCompareText(colorOptionValue(variant)) === colorKey
    && normalizedCompareText(sizeOptionValue(variant)) === sizeKey
  )) || null;
}

function shopifyMediaAltForImageGroup(product, group = {}) {
  const firstRow = group.rows?.[0] || {};
  const colors = uniqueSorted(group.colors || []);
  return [
    product.productNo,
    colors.join(' / ') || firstRow.colorJa || firstRow.originalColor,
  ].filter(Boolean).join(' ');
}

function findShopifyMediaForColorImageGroup(product, snapshot = {}, group = {}) {
  const productNoKey = normalizedCompareText(product.productNo || '');
  const colorKeys = uniqueSorted(group.colors || [])
    .map(normalizedCompareText)
    .filter(Boolean);
  const groupUrlKey = normalizedMediaUrlKey(group.url);
  const mediaImages = (snapshot.images || []).filter(image => /^gid:\/\/shopify\/MediaImage\//i.test(String(image.id || '')));
  return mediaImages.find(image => {
    const altKey = normalizedCompareText(image.altText || image.alt || '');
    if (!altKey) return false;
    const productMatches = !productNoKey || altKey.includes(productNoKey);
    const colorMatches = colorKeys.length ? colorKeys.some(colorKey => altKey.includes(colorKey)) : true;
    return productMatches && colorMatches;
  }) || mediaImages.find(image => normalizedMediaUrlKey(image.url) === groupUrlKey) || null;
}

function variantImageTargetIds(rows = [], snapshot = {}) {
  return uniqueSorted(groupRowsByColorImage(rows)
    .flatMap(group => uniqueVariantGidsForImageRows(group.rows, snapshot)));
}

function assignedVariantImageCount(rows = [], snapshot = {}) {
  const variantsById = new Map((snapshot.variants || []).map(variant => [variant.id, variant]));
  return variantImageTargetIds(rows, snapshot)
    .filter(id => variantsById.get(id)?.image?.url)
    .length;
}

async function setShopifyInventoryQuantities(product, snapshot, rows) {
  if (!snapshot?.id) return { updated: 0, skipped: true, reason: 'Shopify商品IDがありません' };
  const locationId = await shopifyPrimaryLocationId();
  const quantities = [];
  const missing = [];
  rows.forEach(row => {
    const variant = findShopifyVariantForRow(row, snapshot);
    if (!variant?.inventoryItemId) {
      missing.push(row.sku || `${row.colorJa || row.originalColor}/${row.sizeJa || row.originalSize}`);
      return;
    }
    quantities.push({
      inventoryItemId: variant.inventoryItemId,
      locationId,
      quantity: shopifyInventoryQuantityForRow(row, product),
      changeFromQuantity: null,
    });
  });
  if (!quantities.length) return { updated: 0, missing, reason: '在庫更新対象のバリアントが見つかりません' };
  const mutation = `#graphql
    mutation SetProductInventoryQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
      inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
        userErrors {
          code
          field
          message
        }
      }
    }`;
  const data = await shopifyGraphql(mutation, {
    input: {
      name: 'available',
      reason: 'correction',
      ignoreCompareQuantity: true,
      quantities,
    },
    idempotencyKey: crypto.randomUUID(),
  });
  throwIfShopifyUserErrors(data.inventorySetQuantities?.userErrors, 'Shopify在庫数反映');
  const refreshed = await fetchShopifyProductById(snapshot.id);
  return {
    updated: quantities.length,
    missing,
    snapshot: refreshed || snapshot,
  };
}

async function setShopifyInventoryTracking(product, snapshot, tracked = shopifyShouldTrackInventory(product)) {
  if (!snapshot?.id) return { updated: 0, skipped: true, reason: 'Shopify商品IDがありません', snapshot, tracked };
  const variants = (snapshot.variants || []).filter(variant => variant.inventoryItemId);
  const targets = variants.filter(variant => Boolean(variant.inventoryTracked) !== Boolean(tracked));
  if (!targets.length) return { updated: 0, skipped: true, snapshot, tracked };
  const mutation = `#graphql
    mutation InventoryItemTrackRule($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem {
          id
          tracked
        }
        userErrors {
          field
          message
        }
      }
    }`;
  const errors = [];
  let updated = 0;
  for (const variant of targets) {
    try {
      const data = await shopifyGraphql(mutation, {
        id: variant.inventoryItemId,
        input: { tracked: Boolean(tracked) },
      });
      throwIfShopifyUserErrors(data.inventoryItemUpdate?.userErrors, 'Shopify在庫追跡設定');
      updated += 1;
    } catch (error) {
      errors.push(`${variant.sku || variant.title || variant.inventoryItemId}: ${error.message || String(error)}`);
    }
  }
  const refreshed = updated ? await fetchShopifyProductById(snapshot.id) : snapshot;
  return {
    updated,
    errors,
    snapshot: refreshed || snapshot,
    tracked: Boolean(tracked),
  };
}

async function syncShopifyInventoryRuleForRegistration(product, snapshot, rows) {
  const trackInventory = shopifyShouldTrackInventory(product);
  const trackingSync = await setShopifyInventoryTracking(product, snapshot, trackInventory);
  const trackingSnapshot = trackingSync.snapshot || snapshot;
  if (!trackInventory) {
    return {
      updated: 0,
      missing: [],
      skipped: true,
      reason: 'Shopifyの在庫追跡はOFFです。システム側で在庫を把握します。',
      tracking: trackingSync,
      snapshot: trackingSnapshot,
    };
  }
  const quantitySync = await setShopifyInventoryQuantities(product, trackingSnapshot, rows);
  return {
    ...quantitySync,
    tracking: trackingSync,
    snapshot: quantitySync.snapshot || trackingSnapshot,
  };
}

async function appendShopifyMediaToVariants(productId, variantMedia) {
  const cleanVariantMedia = (variantMedia || [])
    .map(item => ({
      variantId: item.variantId,
      mediaIds: uniqueSorted(item.mediaIds || []),
    }))
    .filter(item => item.variantId && item.mediaIds.length);
  if (!cleanVariantMedia.length) return { assigned: 0, errors: [] };
  const mutation = `#graphql
    mutation AppendProductVariantMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
      productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
        product {
          id
        }
        productVariants {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`;
  const data = await shopifyGraphql(mutation, {
    productId: shopifyProductGid(productId),
    variantMedia: cleanVariantMedia,
  });
  throwIfShopifyUserErrors(data.productVariantAppendMedia?.userErrors, 'Shopifyカラー画像紐付け');
  return {
    assigned: cleanVariantMedia.length,
    errors: [],
  };
}

async function assignShopifyVariantImages(product, snapshot, rows) {
  const errors = [];
  const variantsById = new Map((snapshot.variants || []).map(variant => [variant.id, variant]));
  const variantMedia = [];
  for (const group of groupRowsByColorImage(rows).slice(0, 50)) {
    const media = findShopifyMediaForColorImageGroup(product, snapshot, group);
    if (!media?.id) {
      errors.push(`${shopifyMediaAltForImageGroup(product, group) || group.url}: Shopify画像IDが見つかりません`);
      continue;
    }
    uniqueVariantGidsForImageRows(group.rows, snapshot).forEach(variantId => {
      const variant = variantsById.get(variantId);
      if (variant?.image?.url) return;
      variantMedia.push({
        variantId,
        mediaIds: [media.id],
      });
    });
  }
  if (!variantMedia.length) return { assigned: 0, errors };
  try {
    const result = await appendShopifyMediaToVariants(snapshot.id, variantMedia);
    return { assigned: result.assigned, errors };
  } catch (error) {
    errors.push(error.message || String(error));
    return { assigned: 0, errors };
  }
}

async function uploadShopifyProductImages(product, snapshot, rows, imageGroupsOverride = null) {
  const productLegacyId = snapshot.legacyId || extractShopifyProductLegacyId(snapshot.id || product.shopifyProductId);
  if (!productLegacyId) return { uploaded: 0, errors: ['Shopify商品IDがないため画像を同期できません'] };
  const imageGroups = (imageGroupsOverride || groupRowsByColorImage(rows)).slice(0, 50);
  if (!imageGroups.length) return { uploaded: 0, errors: [] };
  const errors = [];
  let uploaded = 0;
  for (const [index, group] of imageGroups.entries()) {
    try {
      const imageData = await downloadRemoteImageForShopify(group.url);
      const variantIds = uniqueVariantIdsForImageRows(group.rows, snapshot);
      const alt = shopifyMediaAltForImageGroup(product, group);
      await shopifyRest(`/products/${encodeURIComponent(productLegacyId)}/images.json`, {
        method: 'POST',
        body: {
          image: {
            attachment: imageData.attachment,
            filename: shopifyImageFilename(product, index, imageData.extension),
            alt,
            ...(variantIds.length ? { variant_ids: variantIds } : {}),
          },
        },
      });
      uploaded += 1;
    } catch (error) {
      errors.push(`${group.url}: ${error.message || String(error)}`);
    }
  }
  return { uploaded, errors };
}

async function waitForShopifyImages(productId, expectedMin = 1, timeoutMs = 30_000) {
  const started = Date.now();
  let snapshot = await fetchShopifyProductById(productId);
  while (Date.now() - started < timeoutMs) {
    if ((snapshot?.images || []).length >= expectedMin) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 2500));
    snapshot = await fetchShopifyProductById(productId);
  }
  return snapshot;
}

async function ensureShopifyProductImages(product, snapshot, rows) {
  if (!SHOPIFY_AUTO_MEDIA_ENABLED) {
    return {
      snapshot,
      mediaResult: {
        uploaded: 0,
        assigned: 0,
        errors: [],
        skipped: true,
        reason: 'カラー画像の自動同期は無効です',
      },
    };
  }
  const imageGroups = groupRowsByColorImage(rows).slice(0, 50);
  const plannedImageCount = imageGroups.length;
  if (!plannedImageCount || !snapshot?.id) {
    return { snapshot, mediaResult: { uploaded: 0, assigned: 0, errors: [] } };
  }
  let workingSnapshot = snapshot;
  const mediaResult = {
    uploaded: 0,
    assigned: 0,
    errors: [],
  };
  const missingGroups = imageGroups.filter(group => !findShopifyMediaForColorImageGroup(product, workingSnapshot, group));
  if (missingGroups.length) {
    const uploadResult = await uploadShopifyProductImages(product, workingSnapshot, rows, missingGroups);
    mediaResult.uploaded += uploadResult.uploaded || 0;
    mediaResult.errors.push(...(uploadResult.errors || []));
    workingSnapshot = uploadResult.uploaded
      ? await waitForShopifyImages(
        workingSnapshot.id,
        Math.max((workingSnapshot.images || []).length + uploadResult.uploaded, plannedImageCount),
        45_000
      ) || workingSnapshot
      : await fetchShopifyProductById(workingSnapshot.id) || workingSnapshot;
  }
  const expectedVariantImageCount = variantImageTargetIds(rows, workingSnapshot).length;
  const currentVariantImageCount = assignedVariantImageCount(rows, workingSnapshot);
  if (expectedVariantImageCount && currentVariantImageCount < expectedVariantImageCount) {
    const assignResult = await assignShopifyVariantImages(product, workingSnapshot, rows);
    mediaResult.assigned += assignResult.assigned || 0;
    mediaResult.errors.push(...(assignResult.errors || []));
    if (assignResult.assigned) {
      workingSnapshot = await fetchShopifyProductById(workingSnapshot.id) || workingSnapshot;
    }
  }
  if (!mediaResult.uploaded && !mediaResult.assigned && !mediaResult.errors.length) {
    mediaResult.skipped = true;
    mediaResult.reason = expectedVariantImageCount
      ? 'カラー画像はShopifyバリエーションへ紐付け済みです'
      : 'カラー画像を紐付けるSKUが見つかりません';
  }
  return { snapshot: workingSnapshot || snapshot, mediaResult };
}

async function shopifyAllPublications() {
  const query = `#graphql
    query ShopifyPublications {
      publications(first: 50) {
        edges {
          node {
            id
            name
          }
        }
      }
    }`;
  const data = await shopifyGraphql(query);
  const publications = extractGraphqlEdges(data.publications).map(publication => ({
    id: publication.id || '',
    name: publication.name || '',
  })).filter(item => item.id);
  return publications;
}

function shopifyOnlineStorePublication(publications = []) {
  return publications.find(item => /online store|オンラインストア/i.test(item.name))
    || publications.find(item => /store|ストア/i.test(item.name))
    || publications[0]
    || null;
}

async function publishShopifyProductToPublication(productGid, publication) {
  const mutation = `#graphql
    mutation PublishProductToSalesChannels($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable {
          ... on Product {
            id
            onlineStoreUrl
          }
        }
        userErrors {
          field
          message
        }
      }
    }`;
  const data = await shopifyGraphql(mutation, {
    id: productGid,
    input: [{ publicationId: publication.id }],
  });
  throwIfShopifyUserErrors(data.publishablePublish?.userErrors, `Shopify販売チャンネル公開: ${publication.name || publication.id}`);
  return data.publishablePublish?.publishable || null;
}

async function publishShopifyProductToSalesChannels(productId) {
  const productGid = shopifyProductGid(productId);
  if (!productGid) return { published: false, error: 'Shopify商品IDがないため公開できません' };
  const publications = await shopifyAllPublications();
  if (!publications.length) return { published: false, error: '販売チャンネルの公開先が見つかりません' };
  const publishedPublications = [];
  const errors = [];
  let publishable = null;
  for (const publication of publications) {
    try {
      publishable = await publishShopifyProductToPublication(productGid, publication) || publishable;
      publishedPublications.push(publication);
    } catch (error) {
      errors.push(`${publication.name || publication.id}: ${error.message || String(error)}`);
    }
  }
  if (!publishedPublications.length && errors.length) {
    return {
      published: false,
      publication: shopifyOnlineStorePublication(publications),
      publications,
      publishedPublications,
      publishedCount: 0,
      errors,
      error: errors.join(' / '),
    };
  }
  return {
    published: Boolean(publishable?.onlineStoreUrl || publishedPublications.length),
    publication: shopifyOnlineStorePublication(publications),
    publications,
    publishedPublications,
    publishedCount: publishedPublications.length,
    errors,
  };
}

async function waitForShopifyOnlineStoreUrl(productId, timeoutMs = 30_000) {
  const started = Date.now();
  let snapshot = await fetchShopifyProductById(productId);
  while (Date.now() - started < timeoutMs) {
    if (snapshot?.onlineStoreUrl) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 2500));
    snapshot = await fetchShopifyProductById(productId);
  }
  return snapshot;
}

async function ensureShopifyProductPublished(product, snapshot) {
  if (!snapshot?.id) return { snapshot, publishResult: { published: false, error: 'Shopify商品IDがありません' } };
  if (normalizeShopifyPublishStatus(product.shopifyPublishStatus) !== 'active') {
    return { snapshot, publishResult: { published: false, skipped: true, reason: '下書き作成指定のため公開しません' } };
  }
  try {
    const publishResult = await publishShopifyProductToSalesChannels(snapshot.id);
    const nextSnapshot = await waitForShopifyOnlineStoreUrl(snapshot.id, 45_000);
    return {
      snapshot: nextSnapshot || await fetchShopifyProductById(snapshot.id) || snapshot,
      publishResult: {
        ...publishResult,
        alreadyPublished: Boolean(snapshot.onlineStoreUrl),
      },
    };
  } catch (error) {
    return {
      snapshot: await fetchShopifyProductById(snapshot.id) || snapshot,
      publishResult: { published: false, error: error.message || String(error) },
    };
  }
}

function extractGraphqlEdges(connection) {
  return (connection?.edges || []).map(edge => edge.node).filter(Boolean);
}

const SHOPIFY_PRODUCT_SYNC_FIELDS = `#graphql
  fragment ShopifyProductSyncFields on Product {
    id
    legacyResourceId
    title
    handle
    descriptionHtml
    vendor
    productType
    tags
    status
    onlineStoreUrl
    options {
      name
      values
    }
    collections(first: 100) {
      edges {
        node {
          id
          title
          handle
        }
      }
    }
    variants(first: 250) {
      edges {
        node {
          id
          legacyResourceId
          title
          sku
          price
          compareAtPrice
          inventoryQuantity
          inventoryItem {
            id
            tracked
          }
          selectedOptions {
            name
            value
          }
          image {
            id
            url
            altText
            width
            height
          }
        }
      }
    }
    media(first: 100) {
      edges {
        node {
          id
          alt
          mediaContentType
          preview {
            image {
              url
              altText
              width
              height
            }
          }
          ... on MediaImage {
            image {
              url
              altText
              width
              height
            }
          }
        }
      }
    }
  }
`;

function imageSnapshot(image = {}) {
  if (!image) return null;
  const url = image.url || image.src || '';
  if (!url) return null;
  return {
    id: image.id || '',
    url,
    altText: image.altText || image.alt || '',
    width: Number(image.width || 0),
    height: Number(image.height || 0),
  };
}

function normalizeShopifyProductSnapshot(node) {
  const variants = extractGraphqlEdges(node.variants).map(variant => {
    const variantImage = imageSnapshot(variant.image);
    return {
      id: variant.id || '',
      legacyId: String(variant.legacyResourceId || extractShopifyProductLegacyId(variant.id) || ''),
      title: variant.title || '',
      sku: variant.sku || '',
      price: Number(variant.price || 0),
      compareAtPrice: Number(variant.compareAtPrice || 0),
      inventoryQuantity: Number(variant.inventoryQuantity || 0),
      inventoryItemId: variant.inventoryItem?.id || '',
      inventoryTracked: Boolean(variant.inventoryItem?.tracked),
      selectedOptions: (variant.selectedOptions || []).map(option => ({
        name: option.name || '',
        value: option.value || '',
      })),
      image: variantImage,
    };
  });
  const mediaImages = extractGraphqlEdges(node.media).map(media => {
    const image = imageSnapshot(media.image) || imageSnapshot(media.preview?.image);
    return image ? {
      ...image,
      id: media.id || image.id || '',
      mediaContentType: media.mediaContentType || '',
      altText: media.alt || image.altText || '',
    } : null;
  }).filter(Boolean);
  const variantImages = variants.map(variant => variant.image).filter(Boolean);
  const imageByUrl = new Map();
  [...mediaImages, ...variantImages].forEach(image => {
    if (image.url && !imageByUrl.has(image.url)) imageByUrl.set(image.url, image);
  });
  const handle = node.handle || '';
  return {
    id: node.id || '',
    legacyId: String(node.legacyResourceId || extractShopifyProductLegacyId(node.id) || ''),
    title: node.title || '',
    handle,
    descriptionHtml: node.descriptionHtml || '',
    vendor: node.vendor || '',
    productType: node.productType || '',
    tags: normalizeTagList(node.tags || []),
    status: node.status || '',
    onlineStoreUrl: node.onlineStoreUrl || '',
    adminUrl: shopifyAdminProductUrl(node.legacyResourceId || node.id),
    options: (node.options || []).map(option => ({
      name: option.name || '',
      values: uniqueSorted(option.values || []),
    })),
    collections: normalizeCollectionList(extractGraphqlEdges(node.collections)),
    variants,
    images: [...imageByUrl.values()],
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchShopifyProductById(productId) {
  const gid = shopifyProductGid(productId);
  if (!gid) return null;
  const query = `${SHOPIFY_PRODUCT_SYNC_FIELDS}
    query ProductForSyncById($id: ID!) {
      product(id: $id) {
        ...ShopifyProductSyncFields
      }
    }`;
  const data = await shopifyGraphql(query, { id: gid });
  return data.product ? normalizeShopifyProductSnapshot(data.product) : null;
}

async function fetchShopifyProductsByHandle(handle) {
  if (!handle) return [];
  const query = `${SHOPIFY_PRODUCT_SYNC_FIELDS}
    query ProductForSyncByHandle($query: String!) {
      products(first: 10, query: $query) {
        edges {
          node {
            ...ShopifyProductSyncFields
          }
        }
      }
    }`;
  const data = await shopifyGraphql(query, { query: `handle:${handle}` });
  return extractGraphqlEdges(data.products).map(normalizeShopifyProductSnapshot);
}

async function fetchShopifyProductForLocalProduct(product) {
  const expectedHandle = expectedShopifyHandle(product);
  const idCandidates = [
    product.shopifyProductId,
    product.shopifyAdminUrl,
  ].filter(Boolean);
  for (const candidate of idCandidates) {
    const snapshot = await fetchShopifyProductById(candidate);
    if (snapshot) {
      const duplicates = expectedHandle
        ? (await fetchShopifyProductsByHandle(expectedHandle)).filter(item => item.id !== snapshot.id)
        : [];
      return { snapshot, duplicates, expectedHandle };
    }
  }
  const matches = await fetchShopifyProductsByHandle(expectedHandle);
  const exact = matches.find(item => item.handle === expectedHandle) || matches[0] || null;
  return { snapshot: exact, duplicates: matches.filter(item => exact && item.id !== exact.id), expectedHandle };
}

function normalizedCompareText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[‐‑‒–—―ーｰ－-]/g, '-');
}

function sameText(a, b) {
  return normalizedCompareText(a) === normalizedCompareText(b);
}

function normalizeSet(values) {
  return new Set((values || []).map(normalizedCompareText).filter(Boolean));
}

function setDifference(left, right) {
  return [...left].filter(value => !right.has(value));
}

function setsMatch(a, b) {
  const left = normalizeSet(a);
  const right = normalizeSet(b);
  return left.size === right.size && setDifference(left, right).length === 0;
}

function displayList(values) {
  const list = uniqueSorted(values || []);
  if (!list.length) return '-';
  return list.slice(0, 8).join(' / ') + (list.length > 8 ? ` 他${list.length - 8}件` : '');
}

function flattenProductRowsForSync(product) {
  return (product.colors || []).flatMap(color => {
    const sizes = color.sizes?.length ? color.sizes : [{ id: '', originalSize: '', sizeJa: '', sku: '', stockStatus: 'available' }];
    return sizes.map(size => ({
      colorId: color.id || '',
      sizeId: size.id || '',
      originalColor: color.originalColor || '',
      colorJa: color.colorJa || color.originalColor || '',
      originalSize: size.originalSize || '',
      sizeJa: size.sizeJa || size.originalSize || '',
      sku: size.sku || size.shopifySku || '',
      shopifyVariantId: size.shopifyVariantId || '',
      imageUrl: color.imageUrl || '',
      stockStatus: size.stockStatus || 'available',
      stockQuantity: normalizedSourceStockQuantity(size.stockQuantity ?? size.inventoryQuantity ?? size.quantity, size.stockStatus || 'available'),
    }));
  });
}

function optionValueFromVariant(variant, matcher) {
  const option = (variant.selectedOptions || []).find(item => matcher(item.name || ''));
  return option?.value || '';
}

function colorOptionValue(variant) {
  return optionValueFromVariant(variant, name => /color|カラー|色/i.test(name)) || variant.selectedOptions?.[0]?.value || '';
}

function sizeOptionValue(variant) {
  return optionValueFromVariant(variant, name => /size|サイズ|尺|寸/i.test(name)) || variant.selectedOptions?.[1]?.value || '';
}

function plannedProductSnapshot(product) {
  const rows = flattenProductRowsForSync(product);
  return {
    productNo: product.productNo || '',
    handle: expectedShopifyHandle(product),
    title: appendProductNoToShopifyTitle(product.localTitle || product.shopifyTitle || '', product.productNo),
    productType: product.shopifyProductType || product.productType || '',
    vendor: product.shopifyVendor || product.vendor || 'socora',
    tags: normalizeTagList(product.shopifyTags ?? product.tags),
    collections: normalizeCollectionList(product.shopifyCollections || []),
    status: normalizeStatus(product.status),
    salePriceJpy: Number(product.salePriceJpy || 0),
    rows,
    skus: rows.map(row => row.sku).filter(Boolean),
    colors: uniqueSorted(rows.map(row => row.colorJa).filter(Boolean)),
    sizes: uniqueSorted(rows.map(row => row.sizeJa).filter(Boolean)),
    imageCount: SHOPIFY_AUTO_MEDIA_ENABLED ? groupRowsByColorImage(rows).length : 0,
    trackInventory: shopifyShouldTrackInventory(product),
  };
}

function shopifyProductCompareData(snapshot) {
  const variants = snapshot.variants || [];
  return {
    handle: snapshot.handle || '',
    title: snapshot.title || '',
    productType: snapshot.productType || '',
    vendor: snapshot.vendor || '',
    tags: normalizeTagList(snapshot.tags),
    collections: normalizeCollectionList(snapshot.collections || []),
    status: snapshot.status || '',
    prices: variants.map(variant => Number(variant.price || 0)).filter(value => value > 0),
    variants,
    skus: variants.map(variant => variant.sku).filter(Boolean),
    colors: uniqueSorted(variants.map(colorOptionValue).filter(Boolean)),
    sizes: uniqueSorted(variants.map(sizeOptionValue).filter(Boolean)),
    imageCount: (snapshot.images || []).length,
    variantImageCount: variants.filter(variant => variant.image?.url).length,
    trackedVariants: variants.filter(variant => variant.inventoryTracked).length,
  };
}

function imageRatioIssueCount(images = []) {
  return images.filter(image => {
    const width = Number(image.width || 0);
    const height = Number(image.height || 0);
    if (!width || !height) return true;
    const ratio = width / height;
    return Math.abs(ratio - 0.8) > 0.04;
  }).length;
}

function addReconcileCheck(checks, field, label, planned, actual, status, detail = '') {
  checks.push({
    field,
    label,
    planned: Array.isArray(planned) ? displayList(planned) : String(planned ?? '-'),
    actual: Array.isArray(actual) ? displayList(actual) : String(actual ?? '-'),
    status,
    detail,
  });
}

function compareShopifyProduct(product, snapshot, duplicates = []) {
  const planned = plannedProductSnapshot(product);
  const actual = shopifyProductCompareData(snapshot);
  const checks = [];
  addReconcileCheck(checks, 'productId', 'Shopify商品ID', product.shopifyProductId || '-', snapshot.legacyId || snapshot.id, snapshot.id ? 'ok' : 'missing');
  addReconcileCheck(checks, 'handle', '管理番号/handle', planned.handle, actual.handle, sameText(planned.handle, actual.handle) ? 'ok' : 'diff');
  addReconcileCheck(checks, 'title', '商品タイトル', planned.title, actual.title, sameText(planned.title, actual.title) ? 'ok' : 'diff');
  addReconcileCheck(checks, 'productType', '商品タイプ', planned.productType || '-', actual.productType || '-', !planned.productType || sameText(planned.productType, actual.productType) ? 'ok' : 'diff');
  addReconcileCheck(checks, 'vendor', '販売元', planned.vendor || '-', actual.vendor || '-', !planned.vendor || sameText(planned.vendor, actual.vendor) ? 'ok' : 'diff');
  addReconcileCheck(checks, 'tags', 'タグ', planned.tags, actual.tags, setsMatch(planned.tags, actual.tags) ? 'ok' : 'diff');
  addReconcileCheck(checks, 'collections', 'コレクション', planned.collections.map(item => item.title), actual.collections.map(item => item.title), setsMatch(planned.collections.map(item => item.title), actual.collections.map(item => item.title)) ? 'ok' : 'review');
  addReconcileCheck(checks, 'onlineStore', 'オンラインストア公開', shopifyStorefrontUrl(planned.handle), snapshot.onlineStoreUrl || '未公開', snapshot.onlineStoreUrl ? 'ok' : 'missing');
  addReconcileCheck(checks, 'variantCount', 'バリエーション数', planned.rows.length, actual.variants.length, planned.rows.length === actual.variants.length ? 'ok' : 'diff');
  addReconcileCheck(checks, 'skus', 'SKU', planned.skus, actual.skus, setsMatch(planned.skus, actual.skus) ? 'ok' : 'missing');
  addReconcileCheck(checks, 'colors', 'カラー', planned.colors, actual.colors, setsMatch(planned.colors, actual.colors) ? 'ok' : 'diff');
  addReconcileCheck(checks, 'sizes', 'サイズ', planned.sizes, actual.sizes, setsMatch(planned.sizes, actual.sizes) ? 'ok' : 'diff');
  const allPricesMatch = planned.salePriceJpy > 0 && actual.prices.length && actual.prices.every(price => Number(price) === planned.salePriceJpy);
  addReconcileCheck(checks, 'price', '価格', planned.salePriceJpy ? `¥${planned.salePriceJpy}` : '-', actual.prices, allPricesMatch ? 'ok' : 'diff');
  const trackingDiffs = actual.variants.filter(variant => Boolean(variant.inventoryTracked) !== Boolean(planned.trackInventory));
  addReconcileCheck(checks, 'inventoryTracking', 'Shopify在庫追跡', planned.trackInventory ? '追跡する' : '追跡しない', trackingDiffs.length ? `${trackingDiffs.length}SKU差分` : 'OK', trackingDiffs.length ? 'diff' : 'ok');
  if (planned.trackInventory) {
    const inventoryDiffs = planned.rows.filter(row => {
      const variant = findShopifyVariantForRow(row, snapshot);
      if (!variant) return true;
      return Number(variant.inventoryQuantity || 0) !== shopifyInventoryQuantityForRow(row, product);
    });
    addReconcileCheck(checks, 'inventory', '販売可能数', '在庫あり=100 / 在庫なし=0', inventoryDiffs.length ? `${inventoryDiffs.length}SKU差分` : 'OK', inventoryDiffs.length ? 'diff' : 'ok');
  } else {
    addReconcileCheck(checks, 'inventory', '販売可能数', 'システム側で在庫把握', 'Shopify追跡なし', trackingDiffs.length ? 'diff' : 'ok');
  }
  addReconcileCheck(checks, 'images', 'カラー画像', SHOPIFY_AUTO_MEDIA_ENABLED ? `${planned.imageCount}件` : '手動差し込み', `${actual.imageCount}件`, SHOPIFY_AUTO_MEDIA_ENABLED ? (actual.imageCount > 0 ? 'ok' : 'missing') : 'ok');
  addReconcileCheck(checks, 'variantImages', 'カラー画像紐づき', SHOPIFY_AUTO_MEDIA_ENABLED ? `${planned.rows.length}SKU` : '手動差し込み', `${actual.variantImageCount}SKU`, SHOPIFY_AUTO_MEDIA_ENABLED ? (actual.variantImageCount >= planned.rows.length ? 'ok' : 'review') : 'ok');
  const ratioIssues = imageRatioIssueCount(snapshot.images || []);
  addReconcileCheck(checks, 'imageRatio', 'カラー画像比率4:5', SHOPIFY_AUTO_MEDIA_ENABLED ? '4:5想定' : '手動差し込み', SHOPIFY_AUTO_MEDIA_ENABLED ? (ratioIssues ? `${ratioIssues}件要確認` : 'OK') : '手動確認', SHOPIFY_AUTO_MEDIA_ENABLED && ratioIssues ? 'review' : 'ok');
  addReconcileCheck(checks, 'duplicates', '重複商品', '重複なし', duplicates.length ? `${duplicates.length}件候補` : '重複なし', duplicates.length ? 'review' : 'ok');

  const summary = {
    okCount: checks.filter(check => check.status === 'ok').length,
    diffCount: checks.filter(check => check.status === 'diff').length,
    missingCount: checks.filter(check => check.status === 'missing').length,
    reviewCount: checks.filter(check => check.status === 'review').length,
  };
  const status = summary.diffCount || summary.missingCount || summary.reviewCount ? '要確認' : '照合済み';
  return {
    checkedAt: new Date().toISOString(),
    status,
    summary,
    planned,
    shopify: actual,
    checks,
    duplicates: duplicates.map(item => ({
      id: item.id,
      legacyId: item.legacyId,
      title: item.title,
      handle: item.handle,
      adminUrl: item.adminUrl,
      onlineStoreUrl: item.onlineStoreUrl,
    })),
  };
}

function updateShopifySyncState(product, result, snapshot, overrides = {}) {
  const next = defaultShopifySyncState({
    status: result.status,
    lastCheckedAt: result.checkedAt,
    okCount: result.summary.okCount,
    diffCount: result.summary.diffCount,
    missingCount: result.summary.missingCount,
    reviewCount: result.summary.reviewCount,
    lastSummary: `OK ${result.summary.okCount} / 差分 ${result.summary.diffCount} / 不足 ${result.summary.missingCount} / 要確認 ${result.summary.reviewCount}`,
    lastError: '',
    lastResult: result,
    ...overrides,
  });
  product.shopifySync = next;
  product.shopifySnapshot = snapshot;
  return next;
}

function addShopifySyncHistory(product, type, result, note = '') {
  const entry = {
    id: crypto.randomUUID(),
    type,
    at: new Date().toISOString(),
    status: product.shopifySync?.status || result?.status || '',
    summary: product.shopifySync?.lastSummary || '',
    note,
  };
  product.shopifySyncHistory = [entry, ...(product.shopifySyncHistory || [])].slice(0, 50);
}

function collectShopifyUserErrors(...groups) {
  return groups.flatMap(group => Array.isArray(group) ? group : []).filter(Boolean);
}

function throwIfShopifyUserErrors(errors, actionLabel) {
  const list = collectShopifyUserErrors(errors);
  if (!list.length) return;
  const message = list.map(error => {
    const field = Array.isArray(error.field) ? error.field.join('.') : String(error.field || '');
    return `${field ? `${field}: ` : ''}${error.message || 'Shopifyでエラーが発生しました'}`;
  }).join(' / ');
  const error = new Error(`${actionLabel}に失敗しました: ${message}`);
  error.status = 400;
  error.shopifyUserErrors = list;
  throw error;
}

function escapeHtmlForShopify(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToShopifyHtml(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtmlForShopify(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function shopifyProductStatusForCreate(product) {
  return normalizeShopifyPublishStatus(product.shopifyPublishStatus) === 'active' ? 'ACTIVE' : 'DRAFT';
}

function cleanShopifyOptionValue(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function cleanShopifyColorOptionValue(value, fallback) {
  const text = cleanShopifyOptionValue(value, fallback);
  const stripped = text
    .replace(/^\s*\d{1,3}\s+(?=\S)/, '')
    .replace(/^\s*\d{1,3}(?=[^\d\s])/u, '')
    .trim();
  return stripped || fallback;
}

function isRemoteMediaUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function uniqueByNormalized(values) {
  const seen = new Set();
  return (values || []).map(value => String(value || '').trim()).filter(Boolean).filter(value => {
    const key = normalizedCompareText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function productRowsForShopifyCreate(product) {
  const sourceRows = flattenProductRowsForSync(product);
  if (!sourceRows.length) {
    const error = new Error('カラー・サイズ情報が取得できていないため、Shopify登録を停止しました。Chrome拡張で1688商品ページから取得し直してください。');
    error.status = 400;
    throw error;
  }
  const rows = sourceRows.map((row, index) => ({
    ...row,
    colorJa: cleanShopifyColorOptionValue(row.colorJa || row.originalColor, `カラー${index + 1}`),
    sizeJa: cleanShopifyOptionValue(row.sizeJa || row.originalSize, 'ONE'),
    sku: row.sku || row.shopifySku || [product.productNo, String(index + 1).padStart(2, '0')].filter(Boolean).join('-'),
    stockStatus: row.stockStatus || 'available',
    stockQuantity: normalizedSourceStockQuantity(row.stockQuantity ?? row.inventoryQuantity ?? row.quantity, row.stockStatus || 'available'),
  }));
  const badColor = rows.find(row => /^(?:カラー\s*\d+|カラー未設定|色未設定|未設定)$/i.test(String(row.colorJa || '').replace(/\s+/g, '')));
  if (badColor) {
    const error = new Error('カラーが仮データのため、Shopify登録を停止しました。1688の商品ページからカラーを取得し直してください。');
    error.status = 400;
    throw error;
  }
  return rows;
}

let shopifyLocationIdCache = '';

async function shopifyPrimaryLocationId() {
  if (SHOPIFY_INVENTORY_LOCATION_ID) return SHOPIFY_INVENTORY_LOCATION_ID;
  if (shopifyLocationIdCache) return shopifyLocationIdCache;
  const data = await shopifyGraphql(`query PrimaryInventoryLocation {
    locations(first: 10) {
      edges {
        node {
          id
          name
          isActive
        }
      }
    }
  }`);
  const locations = extractGraphqlEdges(data.locations);
  const location = locations.find(item => item.isActive !== false) || locations[0];
  if (!location?.id) {
    const error = new Error('Shopifyの在庫ロケーションが見つかりません。在庫数を登録できないため処理を停止しました。');
    error.status = 400;
    throw error;
  }
  shopifyLocationIdCache = location.id;
  return shopifyLocationIdCache;
}

function productMediaForShopifyCreate(product, rows) {
  return [];
}

function looksLikeCompanyOrStoreTitle(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /有限公司|有限责任公司|股份有限公司|服饰公司|贸易公司|供应链|供應鏈|工厂|工廠|厂家|廠家|店铺|店舖|旗舰店|官方店|专营店|专卖店|批发店|档口|商行|企业店|1688采购助手|找工厂|找厂|找店/i.test(text);
}

function normalizeShopifyTitleCandidate(value) {
  let text = String(value || '')
    .replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, '/')
    .replace(/\u00a0/g, ' ')
    .replace(/^【?1688[^】]*】?\s*/i, '')
    .replace(/\s*[-|–—_]\s*(?:1688|阿里巴巴|Alibaba|淘宝|Taobao).*$/i, '')
    .replace(/\s*-\s*批发.*$/i, '')
    .replace(/^(商品名称|商品名|タイトル|标题|標題|名称|名稱)\s*[:：]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > 180) text = text.slice(0, 180).trim();
  return text;
}

function looksUnsafeShopifyTitle(value) {
  const text = normalizeShopifyTitleCandidate(value);
  if (!text || text.length < 2) return true;
  if (looksLikeCompanyOrStoreTitle(text)) return true;
  if (/window\.contextPath|contextPath|AppFrame|Shopify|admin\.shopify|このページの準備/i.test(text)) return true;
  if (/https?:\/\//i.test(text) || /[¥￥]\s*\d/.test(text)) return true;
  if (/^(颜色|顏色|尺码|尺碼|尺寸|规格|規格|价格|库存|运费|销量|商品)$/i.test(text.replace(/\s+/g, ''))) return true;
  return false;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appendProductNoToShopifyTitle(title, productNo) {
  const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim();
  const cleanProductNo = String(productNo || '').replace(/\s+/g, '').trim();
  if (!cleanProductNo) return cleanTitle;
  const productNoPattern = new RegExp(`(?:^|\\s)${escapeRegExp(cleanProductNo)}(?:\\s|$)`, 'i');
  return productNoPattern.test(cleanTitle) ? cleanTitle : `${cleanTitle} ${cleanProductNo}`.trim();
}

function safeShopifyTitleForCreate(product) {
  const candidates = [
    product.localTitle,
    product.shopifyTitle,
    product.managementTitle,
    product.title,
    product.sourceTitle,
    product.originalTitle,
  ].map(value => normalizeShopifyTitleCandidate(value)).filter(Boolean);
  const safe = candidates.find(value => !looksUnsafeShopifyTitle(value));
  if (safe) return appendProductNoToShopifyTitle(safe, product.productNo);
  const error = new Error('商品タイトルが会社名・店舗名になっている可能性があるため、Shopify登録を停止しました。1688の商品名を取得し直すか、管理画面で正しい商品名に修正してください。');
  error.status = 400;
  throw error;
}

function productCreateInputForShopify(product, rows) {
  const colorValues = uniqueByNormalized(rows.map(row => cleanShopifyColorOptionValue(row.colorJa, 'カラー未設定')));
  const sizeValues = uniqueByNormalized(rows.map(row => row.sizeJa));
  const collectionsToJoin = normalizeCollectionList(product.shopifyCollections || [])
    .map(collection => shopifyCollectionGid(collection.id))
    .filter(Boolean);
  const descriptionHtml = String(product.shopifyDescriptionHtml || '').trim();
  const input = {
    title: safeShopifyTitleForCreate(product),
    handle: expectedShopifyHandle(product),
    descriptionHtml,
    productType: product.shopifyProductType || product.productType || '',
    vendor: product.shopifyVendor || product.vendor || 'socora',
    tags: normalizeTagList(product.shopifyTags ?? product.tags),
    status: shopifyProductStatusForCreate(product),
    productOptions: [
      { name: 'Color', position: 1, values: colorValues.map(name => ({ name })) },
      { name: 'Size', position: 2, values: sizeValues.map(name => ({ name })) },
    ],
  };
  if (collectionsToJoin.length) input.collectionsToJoin = collectionsToJoin;
  return input;
}

function shopifyInventoryQuantityForRow(row, product) {
  const explicit = row.stockQuantity ?? row.inventoryQuantity ?? row.quantity;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    const number = Number(explicit);
    if (Number.isFinite(number)) return Math.max(0, Math.round(number));
  }
  if ((row.stockStatus || '') === 'out') return SHOPIFY_SOURCE_OUT_OF_STOCK_QTY;
  return normalizedSourceStockQuantity(product.inventoryPerVariant, 'available');
}

function shopifyShouldTrackInventory(product = {}) {
  if (product.shopifyTrackInventory !== undefined && product.shopifyTrackInventory !== null) {
    return Boolean(product.shopifyTrackInventory);
  }
  if (product.trackInventory !== undefined && product.trackInventory !== null) {
    return Boolean(product.trackInventory);
  }
  return SHOPIFY_TRACK_INVENTORY;
}

function variantInputsForShopifyCreate(product, rows, locationId = '') {
  const price = Number(product.salePriceJpy || 0);
  const compareAtPrice = Number(product.compareAtPriceJpy || 0);
  const trackInventory = shopifyShouldTrackInventory(product);
  return rows.map(row => {
    const availableQuantity = shopifyInventoryQuantityForRow(row, product);
    const input = {
      optionValues: [
        { optionName: 'Color', name: cleanShopifyColorOptionValue(row.colorJa, 'カラー未設定') },
        { optionName: 'Size', name: cleanShopifyOptionValue(row.sizeJa, 'ONE') },
      ],
      price: String(price > 0 ? price : 0),
      inventoryItem: {
        sku: row.sku || '',
        tracked: trackInventory,
        requiresShipping: true,
      },
      inventoryPolicy: trackInventory ? 'DENY' : 'CONTINUE',
    };
    if (trackInventory && locationId) input.inventoryQuantities = [{ locationId, availableQuantity }];
    if (compareAtPrice > price && price > 0) input.compareAtPrice = String(compareAtPrice);
    return input;
  });
}

async function createShopifyProductBase(product, rows) {
  const query = `${SHOPIFY_PRODUCT_SYNC_FIELDS}
    mutation ProductCreateFromAdmin($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) {
        product {
          ...ShopifyProductSyncFields
        }
        userErrors {
          field
          message
        }
      }
    }`;
  const input = productCreateInputForShopify(product, rows);
  const media = productMediaForShopifyCreate(product, rows);
  const runCreate = async mediaInput => {
    const data = await shopifyGraphql(query, {
      product: input,
      media: mediaInput,
    });
    throwIfShopifyUserErrors(data.productCreate?.userErrors, 'Shopify商品作成');
    return data;
  };
  let data;
  try {
    data = await runCreate(media);
  } catch (error) {
    if (!media.length) throw error;
    data = await runCreate([]);
  }
  if (!data.productCreate?.product?.id) {
    const error = new Error('Shopify商品作成に失敗しました: 商品IDが返ってきませんでした');
    error.status = 502;
    throw error;
  }
  return normalizeShopifyProductSnapshot(data.productCreate.product);
}

async function createShopifyProductVariants(productId, product, rows) {
  const locationId = await shopifyPrimaryLocationId();
  const variants = variantInputsForShopifyCreate(product, rows, locationId);
  if (!variants.length) return null;
  const query = `${SHOPIFY_PRODUCT_SYNC_FIELDS}
    mutation ProductVariantsCreateFromAdmin(
      $productId: ID!,
      $variants: [ProductVariantsBulkInput!]!,
      $strategy: ProductVariantsBulkCreateStrategy
    ) {
      productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
        product {
          ...ShopifyProductSyncFields
        }
        productVariants {
          id
          legacyResourceId
          title
          sku
          selectedOptions {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`;
  const runCreate = async variantInput => {
    const data = await shopifyGraphql(query, {
      productId,
      variants: variantInput,
      strategy: 'REMOVE_STANDALONE_VARIANT',
    });
    throwIfShopifyUserErrors(data.productVariantsBulkCreate?.userErrors, 'Shopifyバリアント作成');
    return data;
  };
  let data;
  try {
    data = await runCreate(variants);
  } catch (error) {
    const variantsWithoutMedia = variants.map(variant => {
      const next = { ...variant };
      delete next.mediaSrc;
      return next;
    });
    const hadMedia = variants.some(variant => Array.isArray(variant.mediaSrc) && variant.mediaSrc.length);
    if (!hadMedia) throw error;
    data = await runCreate(variantsWithoutMedia);
  }
  return data.productVariantsBulkCreate?.product
    ? normalizeShopifyProductSnapshot(data.productVariantsBulkCreate.product)
    : null;
}

function attachShopifySnapshotToProduct(product, snapshot, result, historyType, note = '') {
  product.shopifyProductId = snapshot.legacyId || extractShopifyProductLegacyId(snapshot.id) || product.shopifyProductId;
  product.shopifyAdminUrl = snapshot.adminUrl || product.shopifyAdminUrl;
  product.shopifyUrl = snapshot.onlineStoreUrl || '';
  const onlineStorePublished = Boolean(snapshot.onlineStoreUrl);
  const shopifyActive = snapshot.status === 'ACTIVE';
  product.registrationStage = onlineStorePublished ? 'published' : 'shopify_draft_created';
  product.shopifyPublishStatus = shopifyActive ? 'active' : 'draft';
  product.updatedAt = new Date().toISOString();
  const afterResult = result || compareShopifyProduct(product, snapshot, []);
  updateShopifySyncState(product, afterResult, snapshot, {
    status: onlineStorePublished ? 'Shopify公開済み' : (shopifyActive ? 'Shopify未公開（オンラインストア未反映）' : 'Shopify下書き作成済み'),
    appliedAt: new Date().toISOString(),
  });
  addShopifySyncHistory(product, historyType, afterResult, note);
  return product;
}

async function createShopifyProductForLocalProduct(store, id, options = {}) {
  const product = store.products.find(p => p.id === id || p.productNo === id);
  if (!product) {
    const error = new Error('商品が見つかりません');
    error.status = 404;
    throw error;
  }
  ensureNoSourceUrlDuplicate(store, product, product.id || product.productNo || id);

  const existing = await fetchShopifyProductForLocalProduct(product);
  if (existing.snapshot && !options.force) {
    const rows = productRowsForShopifyCreate(product);
    const inventorySync = await syncShopifyInventoryRuleForRegistration(product, existing.snapshot, rows);
    const inventorySnapshot = inventorySync.snapshot || existing.snapshot;
    const mediaSync = await ensureShopifyProductImages(product, inventorySnapshot, rows);
    const publishSync = await ensureShopifyProductPublished(product, mediaSync.snapshot);
    const result = compareShopifyProduct(product, publishSync.snapshot, existing.duplicates);
    const trackingNote = inventorySync.tracking?.updated
      ? `Shopify在庫追跡を${inventorySync.tracking.tracked ? 'ON' : 'OFF'}へ${inventorySync.tracking.updated}SKU分更新しました。`
      : (inventorySync.reason || '');
    const trackingErrorNote = inventorySync.tracking?.errors?.length
      ? `在庫追跡設定で要確認: ${inventorySync.tracking.errors.slice(0, 3).join(' / ')}`
      : '';
    const inventoryNote = inventorySync.updated
      ? `販売可能数を${inventorySync.updated}SKU分更新しました。`
      : '';
    const inventoryMissingNote = inventorySync.missing?.length
      ? `在庫更新で未照合: ${inventorySync.missing.slice(0, 3).join(' / ')}`
      : '';
    const mediaUploaded = Number(mediaSync.mediaResult?.uploaded || 0);
    const mediaAssigned = Number(mediaSync.mediaResult?.assigned || 0);
    const mediaNote = mediaUploaded || mediaAssigned
      ? `既存商品にカラー画像を${mediaUploaded}件補完し、${mediaAssigned}SKUへ紐付けました。`
      : '';
    const mediaErrorNote = mediaSync.mediaResult?.errors?.length
      ? `カラー画像補完で要確認: ${mediaSync.mediaResult.errors.slice(0, 3).join(' / ')}`
      : '';
    const publishNote = publishSync.publishResult?.published
      ? `販売チャンネル${publishSync.publishResult.publishedCount || 1}件の公開を確認しました。`
      : '';
    const publishErrorNote = publishSync.publishResult?.error
      ? `販売チャンネル公開で要確認: ${publishSync.publishResult.error}`
      : (publishSync.publishResult?.errors?.length
        ? `販売チャンネル一部要確認: ${publishSync.publishResult.errors.slice(0, 3).join(' / ')}`
        : '');
    attachShopifySnapshotToProduct(
      product,
      publishSync.snapshot,
      result,
      'Shopify既存商品を紐付け',
      ['同じ管理番号/handleの商品が既にShopifyにあるため、新規作成せず紐付けました。', trackingNote, trackingErrorNote, inventoryNote, inventoryMissingNote, mediaNote, mediaErrorNote, publishNote, publishErrorNote].filter(Boolean).join(' ')
    );
    return {
      product,
      result: product.shopifySync?.lastResult || result,
      snapshot: publishSync.snapshot,
      alreadyExists: true,
      duplicates: existing.duplicates,
      media: mediaSync.mediaResult,
      publication: publishSync.publishResult,
    };
  }

  const rows = productRowsForShopifyCreate(product);
  const baseSnapshot = await createShopifyProductBase(product, rows);
  const variantSnapshot = await createShopifyProductVariants(baseSnapshot.id, product, rows);
  let snapshot = await fetchShopifyProductById(baseSnapshot.id) || variantSnapshot || baseSnapshot;
  const inventorySync = await syncShopifyInventoryRuleForRegistration(product, snapshot, rows);
  snapshot = inventorySync.snapshot || snapshot;
  const mediaSync = await ensureShopifyProductImages(product, snapshot, rows);
  snapshot = mediaSync.snapshot || snapshot;
  const publishSync = await ensureShopifyProductPublished(product, snapshot);
  snapshot = publishSync.snapshot || snapshot;
  const result = compareShopifyProduct(product, snapshot, []);
  const trackingNote = inventorySync.tracking?.updated
    ? `Shopify在庫追跡を${inventorySync.tracking.tracked ? 'ON' : 'OFF'}へ${inventorySync.tracking.updated}SKU分更新しました。`
    : (inventorySync.reason || '');
  const trackingErrorNote = inventorySync.tracking?.errors?.length
    ? `在庫追跡設定で要確認: ${inventorySync.tracking.errors.slice(0, 3).join(' / ')}`
    : '';
  const inventoryNote = inventorySync.updated
    ? `販売可能数を${inventorySync.updated}SKU分更新しました。`
    : '';
  const inventoryMissingNote = inventorySync.missing?.length
    ? `在庫更新で未照合: ${inventorySync.missing.slice(0, 3).join(' / ')}`
    : '';
  const mediaUploaded = Number(mediaSync.mediaResult?.uploaded || 0);
  const mediaAssigned = Number(mediaSync.mediaResult?.assigned || 0);
  const mediaNote = mediaUploaded || mediaAssigned
    ? `カラー画像を${mediaUploaded}件同期し、${mediaAssigned}SKUへ紐付けました。`
    : '';
  const mediaErrorNote = mediaSync.mediaResult?.errors?.length
    ? `カラー画像同期で要確認: ${mediaSync.mediaResult.errors.slice(0, 3).join(' / ')}`
    : '';
  const publishNote = publishSync.publishResult?.published
    ? `販売チャンネル${publishSync.publishResult.publishedCount || 1}件の公開を確認しました。`
    : '';
  const publishErrorNote = publishSync.publishResult?.error
    ? `販売チャンネル公開で要確認: ${publishSync.publishResult.error}`
    : (publishSync.publishResult?.errors?.length
      ? `販売チャンネル一部要確認: ${publishSync.publishResult.errors.slice(0, 3).join(' / ')}`
      : '');
  attachShopifySnapshotToProduct(
    product,
    snapshot,
    result,
    snapshot.status === 'ACTIVE' ? 'Shopify公開作成' : 'Shopify下書き作成',
    [trackingNote, trackingErrorNote, inventoryNote, inventoryMissingNote, mediaNote, mediaErrorNote, publishNote, publishErrorNote].filter(Boolean).join(' ')
  );
  return {
    product,
    result: product.shopifySync?.lastResult || result,
    snapshot,
    alreadyExists: false,
    created: true,
    media: mediaSync.mediaResult,
    publication: publishSync.publishResult,
  };
}

async function syncShopifyProductColorImages(store, id) {
  const product = store.products.find(p => p.id === id || p.productNo === id);
  if (!product) {
    const error = new Error('商品が見つかりません');
    error.status = 404;
    throw error;
  }
  const existing = await fetchShopifyProductForLocalProduct(product);
  if (!existing.snapshot) {
    const error = new Error(`Shopifyで商品が見つかりません: ${existing.expectedHandle || product.productNo}`);
    error.status = 404;
    throw error;
  }
  const rows = productRowsForShopifyCreate(product);
  const mediaSync = await ensureShopifyProductImages(product, existing.snapshot, rows);
  const snapshot = mediaSync.snapshot || await fetchShopifyProductById(existing.snapshot.id) || existing.snapshot;
  const result = compareShopifyProduct(product, snapshot, existing.duplicates);
  if (snapshot.legacyId) product.shopifyProductId = snapshot.legacyId;
  if (snapshot.adminUrl) product.shopifyAdminUrl = snapshot.adminUrl;
  if (snapshot.onlineStoreUrl) product.shopifyUrl = snapshot.onlineStoreUrl;
  updateShopifySyncState(product, result, snapshot, {
    status: result.status,
    appliedAt: new Date().toISOString(),
  });
  const mediaUploaded = Number(mediaSync.mediaResult?.uploaded || 0);
  const mediaAssigned = Number(mediaSync.mediaResult?.assigned || 0);
  const note = [
    mediaUploaded || mediaAssigned ? `カラー画像を${mediaUploaded}件追加し、${mediaAssigned}SKUへ紐付けました。` : '',
    mediaSync.mediaResult?.errors?.length ? `要確認: ${mediaSync.mediaResult.errors.slice(0, 3).join(' / ')}` : '',
  ].filter(Boolean).join(' ');
  addShopifySyncHistory(product, 'Shopifyカラー画像同期', result, note);
  product.updatedAt = new Date().toISOString();
  return {
    product,
    result,
    snapshot,
    media: mediaSync.mediaResult,
    duplicates: existing.duplicates,
  };
}

async function reconcileShopifyProduct(store, id) {
  const product = store.products.find(p => p.id === id);
  if (!product) {
    const error = new Error('商品が見つかりません');
    error.status = 404;
    throw error;
  }
  const { snapshot, duplicates, expectedHandle } = await fetchShopifyProductForLocalProduct(product);
  if (!snapshot) {
    const error = new Error(`Shopifyで商品が見つかりません: ${expectedHandle || product.productNo}`);
    error.status = 404;
    throw error;
  }
  const result = compareShopifyProduct(product, snapshot, duplicates);
  updateShopifySyncState(product, result, snapshot);
  if (snapshot.legacyId && !product.shopifyProductId) product.shopifyProductId = snapshot.legacyId;
  if (snapshot.adminUrl && !product.shopifyAdminUrl) product.shopifyAdminUrl = snapshot.adminUrl;
  if (snapshot.onlineStoreUrl && !product.shopifyUrl) product.shopifyUrl = snapshot.onlineStoreUrl;
  if (snapshot.status === 'ACTIVE') {
    product.status = 'active';
    product.shopifyPublishStatus = 'active';
    product.registrationStage = snapshot.onlineStoreUrl ? 'published' : 'shopify_draft_created';
  } else if (snapshot.status === 'ARCHIVED') {
    product.status = 'stopped';
    product.shopifyPublishStatus = 'draft';
    product.registrationStage = 'archived';
  } else if (snapshot.status === 'DRAFT') {
    product.status = 'stopped';
    product.shopifyPublishStatus = 'draft';
    product.registrationStage = 'shopify_draft_created';
  }
  product.updatedAt = new Date().toISOString();
  addShopifySyncHistory(product, '照合', result);
  return { product, result, snapshot };
}

function shopifyCreateResultHasIdentity(result) {
  const product = result?.product || {};
  const snapshot = result?.snapshot || {};
  return Boolean(
    product.shopifyProductId
    || product.shopifyAdminUrl
    || snapshot.id
    || snapshot.legacyId
    || snapshot.adminUrl
  );
}

async function ensureShopifyCreateResultIdentity(store, id, result) {
  if (shopifyCreateResultHasIdentity(result)) return result;
  try {
    const reconciled = await reconcileShopifyProduct(store, id);
    if (shopifyCreateResultHasIdentity(reconciled)) {
      return {
        ...result,
        product: reconciled.product || result.product,
        result: reconciled.result || result.result,
        snapshot: reconciled.snapshot || result.snapshot,
        reconciledAfterCreate: true,
      };
    }
  } catch(e) {
    // 下で分かりやすいエラーにまとめる
  }
  const error = new Error('Shopify作成後の商品IDを確認できませんでした。商品がShopifyに作成されたか照合できないため、登録完了にはできません。');
  error.status = 502;
  throw error;
}

function ensureColorForShopifyVariant(product, colorValue) {
  const normalized = normalizedCompareText(colorValue);
  let color = (product.colors || []).find(item =>
    normalizedCompareText(item.colorJa || item.originalColor) === normalized
  );
  if (!color) {
    color = normalizeColor({
      originalColor: '',
      colorJa: colorValue || 'カラー未設定',
      sizes: [],
    });
    product.colors = product.colors || [];
    product.colors.push(color);
  }
  return color;
}

function ensureSizeForShopifyVariant(color, sizeValue, sku) {
  const normalizedSku = normalizeSku(sku);
  const normalizedSize = normalizedCompareText(sizeValue);
  let size = (color.sizes || []).find(item =>
    (normalizedSku && normalizeSku(item.sku || item.shopifySku) === normalizedSku)
    || normalizedCompareText(item.sizeJa || item.originalSize) === normalizedSize
  );
  if (!size) {
    size = {
      id: slug(`${color.colorJa || color.originalColor}-${sizeValue || sku || Date.now()}`),
      originalSize: '',
      sizeJa: sizeValue || '',
      sku: sku || '',
      shopifySku: sku || '',
      shopifyVariantId: '',
      stockStatus: 'available',
      stockQuantity: SHOPIFY_SOURCE_AVAILABLE_STOCK_QTY,
      memo: '',
    };
    color.sizes = color.sizes || [];
    color.sizes.push(size);
  }
  return size;
}

function applyShopifySnapshotToProduct(product, snapshot, result) {
  const now = new Date().toISOString();
  product.localTitle = snapshot.title || product.localTitle;
  product.shopifyTitle = snapshot.title || product.shopifyTitle;
  product.shopifyUrl = snapshot.onlineStoreUrl || shopifyStorefrontUrl(snapshot.handle) || product.shopifyUrl;
  product.shopifyAdminUrl = snapshot.adminUrl || product.shopifyAdminUrl;
  product.shopifyProductId = snapshot.legacyId || extractShopifyProductLegacyId(snapshot.id) || product.shopifyProductId;
  product.shopifyProductType = snapshot.productType || product.shopifyProductType || '';
  product.shopifyVendor = snapshot.vendor || product.shopifyVendor || 'socora';
  product.shopifyTags = normalizeTagList(snapshot.tags || []);
  product.shopifyCollections = normalizeCollectionList(snapshot.collections || []);
  if (snapshot.status === 'ACTIVE') product.status = 'active';
  if (['ARCHIVED', 'DRAFT'].includes(snapshot.status)) product.status = 'stopped';
  const prices = uniqueSorted((snapshot.variants || []).map(variant => String(Number(variant.price || 0))).filter(value => Number(value) > 0));
  if (prices.length === 1) product.salePriceJpy = Number(prices[0]);

  const bySku = new Map();
  const byColorSize = new Map();
  (product.colors || []).forEach(color => {
    (color.sizes || []).forEach(size => {
      const sku = normalizeSku(size.sku || size.shopifySku);
      if (sku) bySku.set(sku, { color, size });
      const colorSizeKey = [
        normalizedCompareText(color.colorJa || color.originalColor),
        normalizedCompareText(size.sizeJa || size.originalSize),
      ].join('|');
      if (colorSizeKey !== '|') byColorSize.set(colorSizeKey, { color, size });
    });
  });

  const rebuiltColors = [];
  const rebuiltColorMap = new Map();
  (snapshot.variants || []).forEach(variant => {
    const sku = variant.sku || '';
    const colorValue = colorOptionValue(variant) || 'カラー未設定';
    const sizeValue = sizeOptionValue(variant) || '';
    const colorSizeKey = [normalizedCompareText(colorValue), normalizedCompareText(sizeValue)].join('|');
    const existing = bySku.get(normalizeSku(sku)) || byColorSize.get(colorSizeKey) || {};
    const colorKey = normalizedCompareText(colorValue) || `color-${rebuiltColors.length}`;
    if (!rebuiltColorMap.has(colorKey)) {
      const color = normalizeColor({
        id: existing.color?.id || slug(colorValue),
        originalColor: existing.color?.originalColor || colorValue,
        colorJa: colorValue,
        imageUrl: variant.image?.url || existing.color?.imageUrl || '',
        memo: existing.color?.memo || '',
        sizes: [],
      });
      rebuiltColorMap.set(colorKey, color);
      rebuiltColors.push(color);
    }
    const color = rebuiltColorMap.get(colorKey);
    if (!color.imageUrl && variant.image?.url) color.imageUrl = variant.image.url;
    color.sizes.push({
      id: existing.size?.id || slug(`${colorValue}-${sizeValue || sku || variant.id}`),
      originalSize: existing.size?.originalSize || sizeValue,
      sizeJa: sizeValue,
      sku: sku || existing.size?.sku || '',
      shopifySku: sku || existing.size?.shopifySku || '',
      shopifyVariantId: variant.legacyId || extractShopifyProductLegacyId(variant.id) || variant.id || existing.size?.shopifyVariantId || '',
      stockStatus: Number(variant.inventoryQuantity || 0) <= 0 ? 'out' : 'available',
      stockQuantity: Math.max(0, Math.round(Number(variant.inventoryQuantity || 0))),
      memo: existing.size?.memo || '',
    });
  });
  if (rebuiltColors.length) product.colors = rebuiltColors;

  const afterResult = compareShopifyProduct(product, snapshot, result?.duplicates || []);
  updateShopifySyncState(product, afterResult, snapshot, {
    status: '確定済み',
    appliedAt: now,
    confirmedAt: now,
  });
  addShopifySyncHistory(product, 'Shopifyデータで上書き', afterResult);
  product.updatedAt = now;
  return product;
}

function confirmShopifyProductSync(store, id) {
  const product = store.products.find(p => p.id === id);
  if (!product) return null;
  const now = new Date().toISOString();
  product.shopifySync = defaultShopifySyncState({
    ...(product.shopifySync || {}),
    status: '確認済み',
    confirmedAt: now,
  });
  addShopifySyncHistory(product, '確認済み', product.shopifySync?.lastResult || null);
  product.updatedAt = now;
  return product;
}

function localShopifyProductOptions(store) {
  const products = store.products || [];
  const collections = normalizeCollectionList(products.flatMap(product => product.shopifyCollections || []));
  return {
    productTypes: uniqueSorted(products.map(product => product.shopifyProductType || product.productType)),
    tags: uniqueSorted(products.flatMap(product => normalizeTagList(product.shopifyTags ?? product.tags))),
    categories: uniqueSorted([
      ...products.map(product => product.shopifyCategory || product.category || product.collectionTitle),
      ...collections.map(collection => collection.title),
    ]),
    collections,
    updatedAt: new Date().toISOString(),
  };
}

function mergeShopifyProductOptions(primary, fallback) {
  return {
    productTypes: uniqueSorted([...(primary.productTypes || []), ...(fallback.productTypes || [])]),
    tags: uniqueSorted([...(primary.tags || []), ...(fallback.tags || [])]),
    categories: uniqueSorted([...(primary.categories || []), ...(fallback.categories || [])]),
    collections: normalizeCollectionList([...(primary.collections || []), ...(fallback.collections || [])]),
    updatedAt: primary.updatedAt || fallback.updatedAt || new Date().toISOString(),
  };
}

async function shopifyProductOptions(store) {
  const localOptions = localShopifyProductOptions(store);
  const connection = shopifyConnectionStatus();
  if (!connection.configured) {
    return {
      ...localOptions,
      source: 'local',
      connection,
      warning: `Shopify API未設定のため、保存済み商品から候補を表示しています。${connection.missing.join(' と ')} を設定すると最新候補を取得できます。`,
    };
  }

  try {
    const query = `#graphql
      query ProductOptionCandidates($first: Int!) {
        productTags(first: $first) {
          edges { node }
        }
        productTypes(first: $first) {
          edges { node }
        }
        collections(first: 250) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `;
    const data = await shopifyGraphql(query, { first: 250 });
    const shopifyOptions = {
      productTypes: uniqueSorted(extractGraphqlEdges(data.productTypes)),
      tags: uniqueSorted(extractGraphqlEdges(data.productTags)),
      collections: normalizeCollectionList(extractGraphqlEdges(data.collections)),
      categories: uniqueSorted(extractGraphqlEdges(data.collections).map(collection => collection.title)),
      updatedAt: new Date().toISOString(),
    };
    return {
      ...mergeShopifyProductOptions(shopifyOptions, localOptions),
      source: 'shopify',
      connection,
    };
  } catch (error) {
    return {
      ...localOptions,
      source: 'local',
      connection,
      warning: `Shopify候補の取得に失敗しました。保存済み商品から候補を表示しています: ${error.message}`,
    };
  }
}

async function fetchShopifyOrderForTracking(orderName) {
  const query = `#graphql
    query OrderForTracking($query: String!) {
      orders(first: 1, query: $query) {
        edges {
          node {
            id
            name
            fulfillments(first: 20) {
              id
              status
              trackingInfo {
                company
                number
                url
              }
            }
            fulfillmentOrders(first: 20) {
              edges {
                node {
                  id
                  status
                  lineItems(first: 100) {
                    edges {
                      node {
                        id
                        sku
                        remainingQuantity
                        totalQuantity
                        lineItem {
                          id
                          sku
                          name
                          quantity
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`;
  const searches = [orderName, digitsOnly(orderName)].filter(Boolean).map(value => `name:${value}`);
  for (const search of searches) {
    const data = await shopifyGraphql(query, { query: search });
    const order = extractGraphqlEdges(data.orders)[0];
    if (order) return order;
  }
  return null;
}

function findExistingFulfillmentWithTracking(order, trackingNumber) {
  return (order.fulfillments || []).find(fulfillment =>
    (fulfillment.trackingInfo || []).some(info => String(info.number || '') === String(trackingNumber))
  );
}

function firstExistingFulfillment(order) {
  return (order.fulfillments || []).find(fulfillment => fulfillment?.id) || null;
}

function buildFulfillmentOrderPayload(order, candidate) {
  const targetSkus = new Set((candidate.skus || []).map(normalizeSku).filter(Boolean));
  const wantedBySku = new Map();
  const remainingLines = [];
  Object.entries(candidate.skuQuantities || {}).forEach(([sku, quantity]) => {
    const normalized = normalizeSku(sku);
    if (normalized) wantedBySku.set(normalized, Number(quantity || 0));
  });
  const payload = [];
  extractGraphqlEdges(order.fulfillmentOrders).forEach(fulfillmentOrder => {
    if (['CLOSED', 'CANCELLED'].includes(String(fulfillmentOrder.status || '').toUpperCase())) return;
    const lineItems = [];
    extractGraphqlEdges(fulfillmentOrder.lineItems).forEach(lineItem => {
      const remaining = Number(lineItem.remainingQuantity || 0);
      if (remaining <= 0) return;
      remainingLines.push({ fulfillmentOrder, lineItem, remaining });
      const sku = normalizeSku(lineItem.sku || lineItem.lineItem?.sku);
      if (targetSkus.size && !targetSkus.has(sku)) return;
      const wanted = wantedBySku.get(sku) || remaining;
      const quantity = Math.max(1, Math.min(remaining, wanted));
      lineItems.push({ id: lineItem.id, quantity });
      if (wantedBySku.has(sku)) wantedBySku.set(sku, Math.max(0, wanted - quantity));
    });
    if (lineItems.length) {
      payload.push({
        fulfillmentOrderId: fulfillmentOrder.id,
        fulfillmentOrderLineItems: lineItems,
      });
    }
  });
  if (!payload.length && remainingLines.length === 1) {
    const remainingLine = remainingLines[0];
    const fallbackWanted = [...wantedBySku.values()].reduce((total, quantity) => total + Number(quantity || 0), 0);
    const fallbackQuantity = fallbackWanted > 0
      ? Math.min(remainingLine.remaining, fallbackWanted)
      : remainingLine.remaining;
    return [{
      fulfillmentOrderId: remainingLine.fulfillmentOrder.id,
      fulfillmentOrderLineItems: [{
        id: remainingLine.lineItem.id,
        quantity: Math.max(1, fallbackQuantity),
      }],
    }];
  }
  if (!targetSkus.size && remainingLines.length > 1) {
    throw new Error(`SKUがないためShopifyのどの商品へ追跡番号を付けるか判断できません: ${candidate.orderName}`);
  }
  return payload;
}

async function createShopifyFulfillment(candidate, order, notifyCustomer) {
  const lineItemsByFulfillmentOrder = buildFulfillmentOrderPayload(order, candidate);
  if (!lineItemsByFulfillmentOrder.length) {
    const existingFulfillment = firstExistingFulfillment(order);
    if (existingFulfillment) {
      return updateShopifyFulfillmentTracking(candidate, existingFulfillment.id, notifyCustomer);
    }
    throw new Error(`Shopify側で未発送の明細が見つかりません: ${candidate.orderName} / ${candidate.skus.join(', ') || 'SKUなし'}`);
  }

  const mutation = `#graphql
    mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
      fulfillmentCreate(fulfillment: $fulfillment) {
        fulfillment {
          id
          status
          trackingInfo {
            company
            number
            url
          }
        }
        userErrors {
          field
          message
        }
      }
    }`;
  const data = await shopifyGraphql(mutation, {
    fulfillment: {
      notifyCustomer: Boolean(notifyCustomer),
      trackingInfo: {
        company: candidate.company,
        number: candidate.trackingNumber,
        url: candidate.trackingUrl,
      },
      lineItemsByFulfillmentOrder,
    },
  });
  const payload = data.fulfillmentCreate || {};
  if (payload.userErrors?.length) {
    throw new Error(payload.userErrors.map(error => error.message).join(' / '));
  }
  return {
    fulfillmentId: payload.fulfillment?.id || '',
    mode: 'created',
  };
}

async function updateShopifyFulfillmentTracking(candidate, fulfillmentId, notifyCustomer) {
  const mutation = `#graphql
    mutation FulfillmentTrackingInfoUpdate($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!, $notifyCustomer: Boolean) {
      fulfillmentTrackingInfoUpdate(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput, notifyCustomer: $notifyCustomer) {
        fulfillment {
          id
          status
          trackingInfo {
            company
            number
            url
          }
        }
        userErrors {
          field
          message
        }
      }
    }`;
  const data = await shopifyGraphql(mutation, {
    fulfillmentId,
    notifyCustomer: Boolean(notifyCustomer),
    trackingInfoInput: {
      company: candidate.company,
      number: candidate.trackingNumber,
      url: candidate.trackingUrl,
    },
  });
  const payload = data.fulfillmentTrackingInfoUpdate || {};
  if (payload.userErrors?.length) {
    throw new Error(payload.userErrors.map(error => error.message).join(' / '));
  }
  return {
    fulfillmentId: payload.fulfillment?.id || fulfillmentId,
    mode: 'updated',
  };
}

async function syncShopifyTrackingCandidate(candidate, notifyCustomer) {
  const order = await fetchShopifyOrderForTracking(candidate.orderName);
  if (!order) throw new Error(`Shopifyで注文が見つかりません: ${candidate.orderName}`);
  const existingWithTracking = findExistingFulfillmentWithTracking(order, candidate.trackingNumber);
  const remainingQuantity = remoteFulfillableQuantity(order, candidate);
  if (existingWithTracking && remainingQuantity <= 0) {
    return {
      fulfillmentId: existingWithTracking.id,
      mode: 'already',
    };
  }
  return createShopifyFulfillment(candidate, order, notifyCustomer);
}

function applyShopifyTrackingResult(store, candidate, result) {
  const now = new Date().toISOString();
  const itemIdSet = new Set(candidate.itemIds || []);
  (store.billingItems || []).forEach(item => {
    if (!itemIdSet.has(item.id)) return;
    Object.assign(item, {
      shopifyTrackingStatus: '反映済み',
      shopifyTrackingNumber: candidate.trackingNumber,
      shopifyTrackingCompany: candidate.company,
      shopifyTrackingUrl: candidate.trackingUrl,
      shopifyFulfillmentId: result.fulfillmentId || '',
      shopifyTrackingSyncedAt: now,
      trackingAddedAt: item.trackingAddedAt || now,
      shopifyTrackingLastError: '',
      updatedAt: now,
    });
  });
  (store.shopifyOrders || []).forEach(order => {
    if (trackingOrderName(order.orderName) !== candidate.orderName) return;
    if (candidate.skus.length && !candidate.skus.includes(normalizeSku(order.sku))) return;
    Object.assign(order, {
      shopifyTrackingStatus: '反映済み',
      shopifyTrackingNumber: candidate.trackingNumber,
      shopifyTrackingCompany: candidate.company,
      shopifyTrackingUrl: candidate.trackingUrl,
      shopifyFulfillmentId: result.fulfillmentId || '',
      shopifyTrackingSyncedAt: now,
      trackingAddedAt: order.trackingAddedAt || now,
      purchaseStatus: '発送済',
      updatedAt: now,
    });
  });
}

function applyShopifyTrackingError(store, candidate, error) {
  const now = new Date().toISOString();
  const itemIdSet = new Set(candidate.itemIds || []);
  (store.billingItems || []).forEach(item => {
    if (!itemIdSet.has(item.id)) return;
    Object.assign(item, {
      shopifyTrackingStatus: '失敗',
      shopifyTrackingNumber: candidate.trackingNumber,
      shopifyTrackingCompany: candidate.company,
      shopifyTrackingUrl: candidate.trackingUrl,
      shopifyTrackingLastError: error.message || String(error),
      updatedAt: now,
    });
  });
}

function sortBillingItems(items) {
  return [...(items || [])].sort(compareBillingItems);
}

function normalizeSku(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeVariantKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[・_\-‐‑‒–—―/／\\|()（）[\]【】{}]/g, '');
}

function variantTextContainsKey(text, key, { size = false } = {}) {
  const normalizedKey = normalizeVariantKey(key);
  if (!normalizedKey) return false;
  if (size && /^[a-z0-9]+$/.test(normalizedKey)) {
    const tokens = String(text || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return tokens.includes(normalizedKey);
  }
  return normalizeVariantKey(text).includes(normalizedKey);
}

function addIndexEntry(map, key, entry) {
  const normalizedKey = normalizeVariantKey(key);
  if (!normalizedKey) return;
  if (!map.has(normalizedKey)) map.set(normalizedKey, []);
  map.get(normalizedKey).push(entry);
}

function buildVariantIndex(store) {
  const index = {
    bySku: new Map(),
    byProductNo: new Map(),
  };
  (store.products || []).forEach(product => {
    (product.colors || []).forEach(color => {
      (color.sizes || []).forEach(size => {
        const entry = {
          product,
          productId: product.id,
          color,
          size,
          sku: size.sku,
          sourceSite: product.sourceSite || inferSourceSite(product.sourceUrl),
          sourceUrl: product.sourceUrl || '',
          imageUrl: color.imageUrl || '',
          originalColor: color.originalColor || '',
          originalSize: size.originalSize || '',
          unitCny: Number(size.costCny || color.costCny || product.costCny || 0),
        };
        addIndexEntry(index.bySku, size.sku, entry);
        addIndexEntry(index.bySku, size.shopifySku, entry);
        addIndexEntry(index.byProductNo, product.productNo, entry);
      });
    });
  });
  return index;
}

function productNoFromRow(row, rawSku, lineName) {
  return productNoFromSku(rawSku, uniqueParts([
    lineName,
    pickValue(row, ['Lineitem variant title', 'Variant title', 'Variant', 'Options']),
  ]).join(' '));
}

function rowVariantText(row, rawSku, lineName) {
  return uniqueParts([
    rawSku,
    lineName,
    pickValue(row, ['Lineitem variant title', 'Variant title', 'Variant', 'Options']),
    pickValue(row, ['Option1 Value', 'Option 1 Value', 'Option1']),
    pickValue(row, ['Option2 Value', 'Option 2 Value', 'Option2']),
    pickValue(row, ['Option3 Value', 'Option 3 Value', 'Option3']),
  ]).join(' ');
}

function entryMatchesVariantText(entry, text) {
  if (!normalizeVariantKey(text)) return false;
  const colorKeys = [
    entry.color?.colorJa,
    entry.color?.originalColor,
  ].map(normalizeVariantKey).filter(Boolean);
  const sizeKeys = [
    entry.size?.sizeJa,
    entry.size?.originalSize,
  ].map(normalizeVariantKey).filter(Boolean);
  const colorOk = !colorKeys.length || colorKeys.some(key => variantTextContainsKey(text, key));
  const sizeOk = !sizeKeys.length || sizeKeys.some(key => variantTextContainsKey(text, key, { size: true }));
  return colorOk && sizeOk;
}

function pickBestVariantMatch(entries, row, rawSku, lineName) {
  if (!entries.length) return null;
  if (entries.length === 1) return entries[0];

  const productNo = productNoFromRow(row, rawSku, lineName);
  let candidates = productNo
    ? entries.filter(entry => normalizeProductNo(entry.product?.productNo) === normalizeProductNo(productNo))
    : entries;
  if (!candidates.length) candidates = entries;

  const variantText = rowVariantText(row, rawSku, lineName);
  const optionMatched = candidates.filter(entry => entryMatchesVariantText(entry, variantText));
  if (optionMatched.length) return optionMatched[0];
  return candidates[0] || null;
}

function findVariantMatch(index, row, rawSku, lineName) {
  const sku = normalizeSku(rawSku);
  if (sku) {
    const skuMatches = index.bySku.get(normalizeVariantKey(sku)) || [];
    const match = pickBestVariantMatch(skuMatches, row, rawSku, lineName);
    if (match) return match;
  }

  const productNo = productNoFromRow(row, rawSku, lineName);
  if (!productNo) return null;
  const productMatches = index.byProductNo.get(normalizeVariantKey(productNo)) || [];
  return pickBestVariantMatch(productMatches, row, rawSku, lineName);
}

function findProductUnitCny(store, item) {
  const product = (store.products || []).find(product =>
    product.id === item.productId || product.productNo === item.productNo
  );
  if (!product) return Number(item.unitCny || item.costCny || 0);
  for (const color of product.colors || []) {
    for (const size of color.sizes || []) {
      if (item.sku && (
        normalizeSku(size.sku) === normalizeSku(item.sku)
        || normalizeSku(size.shopifySku) === normalizeSku(item.sku)
      )) {
        return Number(size.costCny || color.costCny || product.costCny || item.unitCny || 0);
      }
    }
  }
  return Number(product.costCny || item.unitCny || item.costCny || 0);
}

function manualItemsForWorkbook(store, input = {}) {
  const sourceItems = Array.isArray(input.orderItems) ? input.orderItems : store.orderItems || [];
  return sourceItems.map(item => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const unitCny = findProductUnitCny(store, item);
    return {
      productId: item.productId || '',
      productNo: item.productNo || '',
      title: item.title || '',
      orderName: '',
      sku: item.sku || '',
      sourceSite: normalizeSourceSite(item.sourceSite, item.sourceUrl),
      sourceUrl: item.sourceUrl || '',
      imageUrl: item.imageUrl || '',
      originalSize: item.originalSize || '',
      originalColor: item.originalColor || '',
      shippingName: '',
      shippingPhone: '',
      shippingAddress: '',
      shippingZip: '',
      email: '',
      quantity,
      unitCny,
      totalCny: Number((quantity * unitCny).toFixed(2)),
    };
  });
}

function buildSmallorderPreview(store, csvText) {
  assertShopifyOrderCsv(csvText, 'BANRI発注Excel');
  const rows = inheritShopifyOrderFields(parseCsv(csvText));
  const index = buildVariantIndex(store);
  const grouped = new Map();
  const unmatched = [];

  rows.forEach(row => {
    const rawSku = row['Lineitem sku'] || row['SKU'] || row['Variant SKU'];
    const sku = normalizeSku(rawSku);
    const lineName = row['Lineitem name'] || row['Product'] || row['Title'] || '';
    if (!sku && !lineName) return;
    const quantity = Math.max(1, Number(row['Lineitem quantity'] || row['Quantity'] || 1));
    const orderName = pickValue(row, ['Name', 'Order']);
    const shippingName = shopifyCsvAddressNameParts(row, 'Shipping').fullName;
    const shippingPhone = pickValue(row, ['Shipping Phone']);
    const shippingZip = pickValue(row, ['Shipping Zip']);
    const shippingAddress = addressFrom(row, 'Shipping');
    const email = pickValue(row, ['Email']);
    const match = findVariantMatch(index, row, rawSku, lineName);
    if (!match) {
      unmatched.push({
        orderName,
        sku: rawSku,
        quantity,
        title: lineName,
        shippingName,
      });
      return;
    }

    const matchedSku = sku || normalizeSku(match.sku) || [
      match.product?.productNo,
      match.color?.colorJa || match.originalColor,
      match.size?.sizeJa || match.originalSize,
    ].filter(Boolean).join('-');
    const groupKey = [orderName, matchedSku, shippingName, shippingPhone, shippingZip, shippingAddress].join('|');
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        productId: match.productId,
        productNo: match.product.productNo,
        title: match.product.localTitle || match.product.sourceTitle || '',
        orderName: normalizeExportOrderName(orderName, ''),
        sku: match.sku,
        sourceSite: match.sourceSite,
        sourceUrl: match.sourceUrl,
        imageUrl: match.imageUrl,
        originalSize: match.originalSize,
        originalColor: match.originalColor,
        shippingName,
        shippingPhone,
        shippingZip,
        shippingAddress,
        email,
        quantity: 0,
        unitCny: match.unitCny,
        totalCny: 0,
      });
    }
    const item = grouped.get(groupKey);
    item.quantity += quantity;
    item.totalCny = Number((item.quantity * item.unitCny).toFixed(2));
  });

  const items = [...grouped.values()];
  const missingPriceItems = itemsWithMissingUnitPrice(items);
  const missingSourceColorItems = itemsWithUnconfirmedSourceColor(items);
  return {
    items,
    unmatched,
    missingPriceItems,
    missingSourceColorItems,
    matchedCount: items.length,
    unmatchedCount: unmatched.length,
    missingPriceCount: missingPriceItems.length,
    missingSourceColorCount: missingSourceColorItems.length,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    totalCny: Number(items.reduce((sum, item) => sum + Number(item.totalCny || 0), 0).toFixed(2)),
  };
}

function normalizeSmallorderLedgerTarget(value) {
  const target = String(value || '').trim();
  if (target === 'selected' || target === 'ordered' || target === 'active') return target;
  return 'unordered';
}

function selectedSmallorderRowIds(value) {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.map(item => String(item || '').trim()).filter(Boolean));
}

function shouldIncludeOrderForSmallorder(row, target) {
  const status = purchaseStatusForOrder(row);
  if (target === 'ordered') return status === '発注済';
  if (target === 'active') return status === '未発注' || status === '発注済';
  return status === '未発注';
}

function buildSmallorderPreviewFromLedger(store, target = 'unordered', selectedOrderIds = []) {
  const ledgerTarget = normalizeSmallorderLedgerTarget(target);
  const selectedIds = selectedSmallorderRowIds(selectedOrderIds);
  const selectedMode = selectedIds.size > 0;
  const rows = (store.shopifyOrders || []).filter(row => {
    if (isIgnoredShopifyOrder(row)) return false;
    if (ledgerTarget === 'selected' && !selectedMode) return false;
    if (selectedMode && !selectedIds.has(String(row.id || ''))) return false;
    if (!isPaidShopifyOrder(row)) return false;
    if (selectedMode) return true;
    return shouldIncludeOrderForSmallorder(row, ledgerTarget);
  });
  const index = buildVariantIndex(store);
  const grouped = new Map();
  const unmatched = [];

  rows.forEach(row => {
    const rawSku = row.sourceSku || row.sku || '';
    const sku = normalizeSku(rawSku);
    const lineName = row.lineName || row.title || '';
    if (!sku && !lineName) return;
    const quantity = Math.max(1, Number(row.quantity || 1));
    const orderName = row.orderName || '';
    const shippingName = orderShippingName(row);
    const shippingPhone = row.shippingPhone || row.billingPhone || '';
    const shippingZip = row.shippingZip || row.billingZip || '';
    const shippingAddress = row.shippingAddress || row.billingAddress || '';
    const email = row.email || '';
    const match = findVariantMatch(index, row, rawSku, lineName);
    if (!match) {
      unmatched.push({
        orderName,
        sku: rawSku,
        quantity,
        title: lineName,
        shippingName,
      });
      return;
    }

    const matchedSku = sku || normalizeSku(match.sku) || [
      match.product?.productNo,
      match.color?.colorJa || match.originalColor,
      match.size?.sizeJa || match.originalSize,
    ].filter(Boolean).join('-');
    const groupKey = [orderName, matchedSku, shippingName, shippingPhone, shippingZip, shippingAddress].join('|');
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        productId: match.productId,
        productNo: match.product.productNo,
        title: match.product.localTitle || match.product.sourceTitle || lineName || '',
        orderName: normalizeExportOrderName(orderName, ''),
        sku: match.sku || matchedSku,
        sourceSite: match.sourceSite,
        sourceUrl: match.sourceUrl,
        imageUrl: match.imageUrl,
        originalSize: match.originalSize,
        originalColor: match.originalColor,
        shippingName,
        shippingPhone,
        shippingZip,
        shippingAddress,
        email,
        quantity: 0,
        unitCny: match.unitCny,
        totalCny: 0,
        orderRowIds: [],
      });
    }
    const item = grouped.get(groupKey);
    item.quantity += quantity;
    item.totalCny = Number((item.quantity * item.unitCny).toFixed(2));
    if (row.id) item.orderRowIds.push(row.id);
  });

  const items = [...grouped.values()];
  const missingPriceItems = itemsWithMissingUnitPrice(items);
  const missingSourceColorItems = itemsWithUnconfirmedSourceColor(items);
  return {
    target: selectedMode ? 'selected' : ledgerTarget,
    selectedCount: selectedIds.size,
    items,
    unmatched,
    missingPriceItems,
    missingSourceColorItems,
    matchedCount: items.length,
    unmatchedCount: unmatched.length,
    missingPriceCount: missingPriceItems.length,
    missingSourceColorCount: missingSourceColorItems.length,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    totalCny: Number(items.reduce((sum, item) => sum + Number(item.totalCny || 0), 0).toFixed(2)),
  };
}

function itemsWithMissingUnitPrice(items) {
  const seen = new Set();
  return (items || []).filter(item => Number(item.unitCny || 0) <= 0).filter(item => {
    const key = [item.orderName, item.productNo, item.sku, item.originalColor, item.originalSize].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(item => ({
    orderName: item.orderName || '',
    productNo: item.productNo || '',
    sku: item.sku || '',
    title: item.title || '',
    color: item.originalColor || '',
    size: item.originalSize || '',
  }));
}

function hasJapaneseKana(value) {
  return /[ぁ-んァ-ヶー]/.test(String(value || ''));
}

function itemsWithUnconfirmedSourceColor(items) {
  const seen = new Set();
  return (items || []).filter(item => {
    const color = String(item.originalColor || '').trim();
    return !color || hasJapaneseKana(color);
  }).filter(item => {
    const key = [item.orderName, item.productNo, item.sku, item.originalColor, item.originalSize].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(item => ({
    orderName: item.orderName || '',
    productNo: item.productNo || '',
    sku: item.sku || '',
    title: item.title || '',
    color: item.originalColor || '',
    size: item.originalSize || '',
  }));
}

function assertItemsHaveUnitPrice(items) {
  const missing = itemsWithMissingUnitPrice(items);
  if (!missing.length) return;
  const detail = missing.slice(0, 8).map(item =>
    [item.orderName, item.productNo, item.color, item.size].filter(Boolean).join(' / ')
  ).join('、');
  const suffix = missing.length > 8 ? ` ほか${missing.length - 8}件` : '';
  const error = new Error(`仕入価格が未設定の商品があるため、BANRI発注Excelを作成できません。管理システムの商品詳細で仕入価格（元）を入力してから再度出力してください: ${detail}${suffix}`);
  error.status = 400;
  throw error;
}

function assertItemsHaveSupplierColor(items) {
  const missing = itemsWithUnconfirmedSourceColor(items);
  if (!missing.length) return;
  const detail = missing.slice(0, 8).map(item =>
    [item.orderName, item.productNo, item.color || '元カラー未設定', item.size].filter(Boolean).join(' / ')
  ).join('、');
  const suffix = missing.length > 8 ? ` ほか${missing.length - 8}件` : '';
  const error = new Error(`中国側に発注する元カラーが未確認の商品があるため、BANRI発注Excelを作成できません。管理システムの商品詳細で元カラーを中国語表記に直してから再度出力してください: ${detail}${suffix}`);
  error.status = 400;
  throw error;
}

function createOrderWorkbook(items, prefix, emptyMessage) {
  if (!items.length) {
    const message = emptyMessage || 'Excelに出力するデータがありません。';
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  assertItemsHaveUnitPrice(items);
  assertItemsHaveSupplierColor(items);
  if (!fs.existsSync(SMALLORDER_TEMPLATE)) {
    const error = new Error(`smallorderテンプレートが見つかりません: ${SMALLORDER_TEMPLATE}`);
    error.status = 500;
    throw error;
  }
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const id = crypto.randomUUID();
  const jsonFile = path.join(EXPORT_DIR, `${prefix}_${stamp}_${id}.json`);
  const outFile = path.join(EXPORT_DIR, `${prefix}_${stamp}.xlsx`);
  fs.writeFileSync(jsonFile, JSON.stringify({ items }, null, 2));

  const result = spawnSync(PYTHON, [SMALLORDER_SCRIPT, jsonFile, SMALLORDER_TEMPLATE, outFile], {
    encoding: 'utf8',
    maxBuffer: 10_000_000,
  });
  fs.rmSync(jsonFile, { force: true });
  if (result.status !== 0) {
    const error = new Error((result.stderr || result.stdout || 'smallorder.xlsxを作成できませんでした').trim());
    error.status = 500;
    throw error;
  }
  return outFile;
}

function createSmallorderWorkbook(preview) {
  return createOrderWorkbook(
    preview.items,
    'banri_order',
    preview.unmatched.length
      ? '一致するSKUがありません。ShopifyのSKUと管理アプリのSKUを確認してください。'
      : 'CSV内にSKUが見つかりません。'
  );
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  if (['/product-register', '/product-register.html', '/products/register'].includes(requestUrl.pathname)) {
    const productNo = requestUrl.searchParams.get('productNo') || requestUrl.searchParams.get('id') || '';
    const target = productNo ? `/?productNo=${encodeURIComponent(productNo)}` : '/';
    res.writeHead(302, {
      Location: target,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end();
    return;
  }
  if (['/mail', '/mail.html'].includes(requestUrl.pathname)) {
    res.writeHead(302, {
      Location: '/',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end();
    return;
  }
  const aliases = {
    '/orders': '/orders.html',
  };
  const requestedPath = aliases[requestUrl.pathname] || requestUrl.pathname;
  const pathname = decodeURIComponent(requestedPath === '/' ? '/index.html' : requestedPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return send(res, 404, 'Not found');
  const ext = path.extname(filePath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method === 'GET' && url.pathname === '/api/image-proxy') {
    return proxyExternalImage(req, res, url);
  }
  const store = await readStore();
  req.socoraStore = store;
  const storeHealth = storeSafetySummary(store);

  if (storeHealth.stale && isWriteIntent(req, url)) {
    return send(res, 409, {
      ok: false,
      error: storeStaleMessage(storeHealth),
      storeHealth,
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, {
      ok: true,
      products: store.products.length,
      storeBackend: useSupabaseStore() ? 'supabase' : 'local',
      authEnabled: authEnabled(),
      storeHealth,
    });
  }
  if (req.method === 'GET' && url.pathname === '/' && url.searchParams.get('x')) {
    const runProductId = url.searchParams.get('x') || '';
    const result = await ensureShopifyCreateResultIdentity(store, runProductId, await createShopifyProductForLocalProduct(store, runProductId, { force: url.searchParams.get('force') === '1' }));
    await writeStore(store);
    const json = htmlEscape(JSON.stringify({ ok: true, action: 'productSync', ...result }, null, 2));
    return sendHtml(res, 200, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Product Sync Result</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;background:#f8fafc;color:#111827}pre{white-space:pre-wrap;background:#fff;border:1px solid #d1d5db;border-radius:12px;padding:16px}</style></head><body><h1>Product Sync Result</h1><pre>${json}</pre></body></html>`);
  }
  if (req.method === 'GET' && url.pathname === '/system-status-run.html') {
    const runProductId = url.searchParams.get('product') || '';
    const payload = runProductId
      ? { ok: true, action: 'productSync', ...(await ensureShopifyCreateResultIdentity(store, runProductId, await createShopifyProductForLocalProduct(store, runProductId, { force: url.searchParams.get('force') === '1' }))) }
      : await integrationHealth(store);
    if (runProductId) await writeStore(store);
    const json = htmlEscape(JSON.stringify(payload, null, 2));
    return sendHtml(res, 200, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>System Status Run</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;background:#f8fafc;color:#111827}pre{white-space:pre-wrap;background:#fff;border:1px solid #d1d5db;border-radius:12px;padding:16px}</style></head><body><h1>System Status Run</h1><pre>${json}</pre></body></html>`);
  }
  if (req.method === 'GET' && url.pathname === '/api/products') {
    return send(res, 200, { products: productsForResponse(store) });
  }
  if (req.method === 'GET' && url.pathname === '/api/products/duplicate-check') {
    const result = productDuplicateCheck(store, {
      sourceUrl: url.searchParams.get('sourceUrl') || '',
      productNo: url.searchParams.get('productNo') || url.searchParams.get('managementNo') || '',
      excludeId: url.searchParams.get('excludeId') || '',
      excludeProductNo: url.searchParams.get('excludeProductNo') || '',
    });
    return send(res, 200, result);
  }
  if (req.method === 'GET' && (url.pathname === '/api/integration-health' || url.pathname === '/api/system-status')) {
    const runProductId = url.searchParams.get('runProduct') || '';
    if (runProductId) {
      let result = await createShopifyProductForLocalProduct(store, runProductId, {
        force: url.searchParams.get('force') === '1',
      });
      result = await ensureShopifyCreateResultIdentity(store, runProductId, result);
      await writeStore(store);
      return send(res, 200, { ok: true, action: 'productSync', ...result });
    }
    return send(res, 200, await integrationHealth(store));
  }
  if (req.method === 'GET' && url.pathname === '/api/shopify-product-options') {
    return send(res, 200, await shopifyProductOptions(store));
  }
  if (req.method === 'GET' && url.pathname === '/api/inventory-check-targets') {
    return send(res, 200, {
      targets: activeInventoryProducts(store).map(inventoryCheckTarget),
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/inventory-checks') {
    return send(res, 200, inventoryChecksForResponse(store));
  }
  if (req.method === 'POST' && url.pathname === '/api/inventory-checks') {
    const input = await readBody(req);
    const result = recordInventoryCheck(store, input);
    await writeStore(store);
    return send(res, 200, {
      check: result.check,
      product: result.product || null,
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/inventory-checks/shopify-apply') {
    const input = await readBody(req);
    const result = await applyInventoryCheckToShopify(store, input);
    await writeStore(store);
    return send(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/inventory-checks/shopify-apply-bulk') {
    const input = await readBody(req);
    const result = await applyInventoryChecksToShopifyBulk(store, input);
    await writeStore(store);
    return send(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/inventory-checks/shopify-status-refresh') {
    const input = await readBody(req);
    const result = await refreshInventoryShopifyStatuses(store, input);
    await writeStore(store);
    return send(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/inventory-checks/export') {
    const outFile = createInventoryWorkbook(store);
    const buffer = fs.readFileSync(outFile);
    return sendBinary(res, 200, buffer, {
      'Content-Type': MIME['.xlsx'],
      'Content-Disposition': `attachment; filename="${path.basename(outFile)}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/next-product-no') {
    return send(res, 200, { productNo: nextProductNo(store) });
  }
  if (req.method === 'POST' && url.pathname === '/api/reserve-product-no') {
    const input = await readBody(req);
    const productNo = normalizeProductNo(input.productNo);
    reserveProductNo(store, productNo);
    await writeStore(store);
    return send(res, 200, { productNo, nextProductNo: nextProductNo(store) });
  }
  if (req.method === 'GET' && url.pathname.match(/^\/api\/products\/[^/]+\/sync-now$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    let result = await createShopifyProductForLocalProduct(store, id, {
      force: url.searchParams.get('force') === '1',
    });
    result = await ensureShopifyCreateResultIdentity(store, id, result);
    await writeStore(store);
    return send(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname.match(/^\/api\/products\/[^/]+\/shopify-repair-run$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    let result = await createShopifyProductForLocalProduct(store, id, {
      force: url.searchParams.get('force') === '1',
    });
    result = await ensureShopifyCreateResultIdentity(store, id, result);
    await writeStore(store);
    return send(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname.match(/^\/api\/products\/[^/]+\/shopify-create$/) && url.searchParams.get('run') === '1') {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    let result = await createShopifyProductForLocalProduct(store, id, {
      force: url.searchParams.get('force') === '1',
    });
    result = await ensureShopifyCreateResultIdentity(store, id, result);
    await writeStore(store);
    return send(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname.match(/^\/api\/products\/[^/]+\/shopify-create$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    const input = await readBody(req);
    let result = await createShopifyProductForLocalProduct(store, id, {
      force: Boolean(input.force),
    });
    result = await ensureShopifyCreateResultIdentity(store, id, result);
    await writeStore(store);
    return send(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname.match(/^\/api\/products\/[^/]+\/shopify-media-sync$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    const result = await syncShopifyProductColorImages(store, id);
    await writeStore(store);
    return send(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname.match(/^\/api\/products\/[^/]+\/shopify-reconcile$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    const result = await reconcileShopifyProduct(store, id);
    await writeStore(store);
    return send(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname.match(/^\/api\/products\/[^/]+\/shopify-apply$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    const result = await reconcileShopifyProduct(store, id);
    applyShopifySnapshotToProduct(result.product, result.snapshot, result.result);
    await writeStore(store);
    return send(res, 200, {
      product: result.product,
      result: result.product.shopifySync?.lastResult || result.result,
      snapshot: result.snapshot,
    });
  }
  if (req.method === 'POST' && url.pathname.match(/^\/api\/products\/[^/]+\/shopify-confirm$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    const product = confirmShopifyProductSync(store, id);
    if (!product) return send(res, 404, { error: '商品が見つかりません' });
    await writeStore(store);
    return send(res, 200, { product });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/products/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    if (url.searchParams.get('syncNow') === '1') {
      let result = await createShopifyProductForLocalProduct(store, id, {
        force: url.searchParams.get('force') === '1',
      });
      result = await ensureShopifyCreateResultIdentity(store, id, result);
      await writeStore(store);
      return send(res, 200, result);
    }
    const product = store.products.find(p => p.id === id);
    return product ? send(res, 200, { product }) : send(res, 404, { error: '商品が見つかりません' });
  }
  if (req.method === 'POST' && url.pathname === '/api/products') {
    const input = await readBody(req);
    const rawProduct = input.product || input;
    const product = normalizeProduct(rawProduct);
    const existing = store.products.findIndex(p => p.id === product.id || p.productNo === product.productNo);
    const existingIdentity = existing >= 0 ? (store.products[existing].id || store.products[existing].productNo || '') : '';
    ensureNoSourceUrlDuplicate(store, product, existingIdentity);
    if (existing >= 0) {
      const previous = store.products[existing];
      product.createdAt = previous.createdAt;
      if (!rawProduct.shopifyProductId && previous.shopifyProductId) product.shopifyProductId = previous.shopifyProductId;
      if (!rawProduct.shopifyAdminUrl && previous.shopifyAdminUrl) product.shopifyAdminUrl = previous.shopifyAdminUrl;
      if (!rawProduct.shopifySnapshot && previous.shopifySnapshot) product.shopifySnapshot = previous.shopifySnapshot;
      if (!rawProduct.shopifySync && previous.shopifySync) product.shopifySync = previous.shopifySync;
      if (!rawProduct.shopifySyncHistory && previous.shopifySyncHistory) product.shopifySyncHistory = previous.shopifySyncHistory;
      if (!rawProduct.inventoryCheck && previous.inventoryCheck) product.inventoryCheck = previous.inventoryCheck;
      store.products[existing] = product;
    } else {
      store.products.unshift(product);
    }
    reserveProductNo(store, product.productNo);
    await writeStore(store);
    return send(res, 200, { product });
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/api/products/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const updates = await readBody(req);
    const normalizedUpdates = updates.product || updates;
    const previous = store.products.find(p => p.id === id);
    if (!previous) return send(res, 404, { error: '商品が見つかりません' });
    ensureNoSourceUrlDuplicate(store, {
      ...previous,
      ...normalizedUpdates,
      sourceUrl: normalizedUpdates.sourceUrl ?? normalizedUpdates.url ?? previous.sourceUrl,
    }, previous.id || previous.productNo || id);
    const product = updateProduct(store, id, normalizedUpdates);
    if (!product) return send(res, 404, { error: '商品が見つかりません' });
    await writeStore(store);
    return send(res, 200, { product });
  }
  if (req.method === 'GET' && url.pathname === '/api/order-items') {
    return send(res, 200, { orderItems: store.orderItems || [] });
  }
  if (req.method === 'PUT' && url.pathname === '/api/order-items') {
    const input = await readBody(req);
    store.orderItems = Array.isArray(input.orderItems) ? input.orderItems : [];
    await writeStore(store);
    return send(res, 200, { orderItems: store.orderItems });
  }
  if (req.method === 'GET' && url.pathname === '/api/order-history') {
    return send(res, 200, { orderHistory: store.orderHistory || [] });
  }
  if (req.method === 'POST' && url.pathname === '/api/order-history') {
    const input = await readBody(req);
    const history = completeOrder(store, input);
    if (!history) return send(res, 400, { error: '発注リストが空です' });
    await writeStore(store);
    return send(res, 200, { history, orderItems: store.orderItems, orderHistory: store.orderHistory });
  }
  if (req.method === 'GET' && url.pathname === '/api/auto-order-history') {
    return send(res, 200, { autoOrderHistory: store.autoOrderHistory || [] });
  }
  if (req.method === 'GET' && url.pathname === '/api/shopify-orders') {
    const orders = shopifyOrdersForResponse(store);
    return send(res, 200, { orders, summary: shopifyOrderSummary(orders) });
  }
  if (req.method === 'POST' && url.pathname === '/api/shopify-orders/preview') {
    const input = await readBody(req);
    const analysis = analyzeShopifyOrderImport(store, input.csv || '');
    return send(res, 200, {
      added: analysis.added,
      updated: analysis.updated,
      duplicateRows: analysis.duplicateRows,
      duplicateOrders: analysis.duplicateOrders,
      duplicateFileRows: analysis.duplicateFileRows,
      skipped: analysis.skipped,
      noSku: analysis.noSku,
      noProductNo: analysis.noProductNo,
      summary: analysis.summary,
      previewRows: analysis.previewRows,
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/shopify-orders/fetch-preview') {
    const input = await readBody(req);
    const analysis = await analyzeShopifyOrderApiImport(store, input || {});
    return send(res, 200, {
      source: 'shopify',
      fetchedOrders: analysis.fetchedOrders,
      fetchLimit: analysis.fetchLimit,
      fetchQuery: analysis.fetchQuery,
      hasNextPage: analysis.hasNextPage,
      added: analysis.added,
      updated: analysis.updated,
      duplicateRows: analysis.duplicateRows,
      duplicateOrders: analysis.duplicateOrders,
      duplicateFileRows: analysis.duplicateFileRows,
      skipped: analysis.skipped,
      noSku: analysis.noSku,
      noProductNo: analysis.noProductNo,
      summary: analysis.summary,
      previewRows: analysis.previewRows,
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/shopify-orders/import') {
    const input = await readBody(req);
    const result = mergeShopifyOrders(store, input.csv || '');
    await writeStore(store);
    const orders = shopifyOrdersForResponse(store, result.rows);
    return send(res, 200, {
      added: result.added,
      updated: result.updated,
      duplicateRows: result.duplicateRows,
      duplicateOrders: result.duplicateOrders,
      duplicateFileRows: result.duplicateFileRows,
      skipped: result.skipped,
      noSku: result.noSku,
      noProductNo: result.noProductNo,
      orders,
      summary: shopifyOrderSummary(orders),
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/shopify-orders/fetch-import') {
    const input = await readBody(req);
    const result = await mergeShopifyOrderApiImport(store, input || {});
    await writeStore(store);
    const orders = shopifyOrdersForResponse(store, result.rows);
    return send(res, 200, {
      source: 'shopify',
      fetchedOrders: result.fetchedOrders,
      fetchLimit: result.fetchLimit,
      fetchQuery: result.fetchQuery,
      hasNextPage: result.hasNextPage,
      added: result.added,
      updated: result.updated,
      duplicateRows: result.duplicateRows,
      duplicateOrders: result.duplicateOrders,
      duplicateFileRows: result.duplicateFileRows,
      skipped: result.skipped,
      noSku: result.noSku,
      noProductNo: result.noProductNo,
      orders,
      summary: shopifyOrderSummary(orders),
    });
  }
  if ((req.method === 'GET' || req.method === 'POST') && url.pathname.match(/^\/api\/shopify-orders\/[^/]+\/tracking-number-disabled$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    const row = (store.shopifyOrders || []).find(item => item.id === id);
    if (!row) return send(res, 404, { error: '注文データが見つかりません' });
    const disabled = url.searchParams.get('disabled') !== '0';
    setOrderTrackingNumberDisabled(row, disabled);
    row.updatedAt = new Date().toISOString();
    await writeStore(store);
    const accept = req.headers.accept || '';
    if (accept.includes('application/json')) return send(res, 200, { order: withPurchaseStatus(row) });
    return redirect(res, sanitizeNextPath(url.searchParams.get('next') || '/orders.html'));
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/api/shopify-orders/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const input = await readBody(req);
    const row = (store.shopifyOrders || []).find(item => item.id === id);
    if (!row) return send(res, 404, { error: '注文データが見つかりません' });
    if (input.purchaseStatus != null) row.purchaseStatus = normalizePurchaseStatus(input.purchaseStatus);
    if (input.sagawaDeliveryStatus != null) row.sagawaDeliveryStatus = normalizeDeliveryStatus(input.sagawaDeliveryStatus);
    if (input.trackingNumberDisabled != null) {
      setOrderTrackingNumberDisabled(row, Boolean(input.trackingNumberDisabled));
    }
    let manualBillingChanged = false;
    for (const [field] of MANUAL_BILLING_FIELDS) {
      if (input[field] == null) continue;
      manualBillingChanged = true;
      const rawValue = String(input[field] || '').trim();
      if (!rawValue) {
        delete row[field];
        continue;
      }
      const value = Number(rawValue.replace(/,/g, ''));
      if (!Number.isFinite(value)) return send(res, 400, { error: '内訳は数字で入力してください' });
      row[field] = Math.round(value);
    }
    if (manualBillingChanged) {
      row.manualBillingUpdatedAt = new Date().toISOString();
      if (row.manualOtherFeeJpy == null) delete row.manualOtherFeeUpdatedAt;
      else row.manualOtherFeeUpdatedAt = row.manualBillingUpdatedAt;
    }
    if (input.note != null) row.note = String(input.note || '');
    row.updatedAt = new Date().toISOString();
    await writeStore(store);
    return send(res, 200, { order: withPurchaseStatus(row) });
  }
  if (req.method === 'POST' && url.pathname === '/api/sagawa-tracking/refresh') {
    const result = await refreshSagawaTrackingStatuses(store);
    await writeStore(store);
    const orders = shopifyOrdersForResponse(store);
    return send(res, 200, {
      ...result,
      orders,
      summary: shopifyOrderSummary(orders),
      configured: sagawaApiConfigured(),
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/billing-reconciliation') {
    const baseFilter = {
      query: url.searchParams.get('query') || '',
      status: url.searchParams.get('status') || '',
      month: url.searchParams.get('month') || '',
    };
    const billingItems = enrichBillingItemsWithDeliveryGroups(store, store.billingItems || []);
    const filtered = filterBillingItems(billingItems, {
      ...baseFilter,
      bucket: url.searchParams.get('bucket') || '',
    });
    const baseItems = filterBillingItems(billingItems, baseFilter);
    const sortedFiltered = [...filtered].sort(compareBillingItems);
    return send(res, 200, {
      items: sortedFiltered,
      summary: billingSummary(filtered),
      allSummary: billingSummary(baseItems),
      imports: store.billingImports || [],
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/shopify-tracking') {
    return send(res, 200, await buildShopifyTrackingCandidatesWithRemoteCheck(store));
  }
  if (req.method === 'POST' && url.pathname === '/api/shopify-tracking/sync') {
    const input = await readBody(req);
    const requestedIds = new Set(Array.isArray(input.ids) ? input.ids.map(String) : []);
    const trackingCompany = normalizeTrackingCompany(input.trackingCompany || SHOPIFY_TRACKING_COMPANY);
    const preview = await buildShopifyTrackingCandidatesWithRemoteCheck(store);
    const targets = preview.candidates.filter(candidate =>
      candidate.ready && (!requestedIds.size || requestedIds.has(candidate.id))
    ).map(candidate => ({
      ...candidate,
      company: trackingCompany,
      companyLabel: trackingCompanyLabel(trackingCompany),
      trackingUrl: trackingUrlForCompany(candidate.trackingNumber, trackingCompany),
    }));
    if (!targets.length) {
      return send(res, 400, { error: 'Shopifyへ反映できる追跡番号候補がありません。' });
    }
    const results = [];
    for (const candidate of targets) {
      try {
        const result = await syncShopifyTrackingCandidate(candidate, Boolean(input.notifyCustomer));
        applyShopifyTrackingResult(store, candidate, result);
        results.push({
          id: candidate.id,
          orderName: candidate.orderName,
          trackingNumber: candidate.trackingNumber,
          ok: true,
          mode: result.mode,
        });
      } catch (error) {
        applyShopifyTrackingError(store, candidate, error);
        results.push({
          id: candidate.id,
          orderName: candidate.orderName,
          trackingNumber: candidate.trackingNumber,
          ok: false,
          error: error.message || String(error),
        });
      }
    }
    await writeStore(store);
    const nextPreview = await buildShopifyTrackingCandidatesWithRemoteCheck(store);
    return send(res, 200, {
      results,
      summary: {
        total: results.length,
        success: results.filter(result => result.ok).length,
        failed: results.filter(result => !result.ok).length,
      },
      tracking: nextPreview,
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/billing-reconciliation/preview') {
    const input = await readBody(req);
    const preview = buildBillingPreview(store, input, store.billingItems || []);
    return send(res, 200, {
      invoice: preview.invoice,
      rowsRead: preview.rowsRead,
      summary: preview.summary,
      changes: summarizeBillingPreviewChanges(store, preview, { replaceExisting: true }),
      previewRows: preview.items.slice(0, 20),
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/billing-reconciliation/import') {
    const input = await readBody(req);
    const preview = buildBillingPreview(store, input, store.billingItems || []);
    const result = mergeBillingPreview(store, preview, input);
    await writeStore(store);
    return send(res, 200, {
      added: result.added,
      updated: result.updated,
      unchanged: result.unchanged,
      removed: result.removed,
      history: result.history,
      items: result.items,
      summary: billingSummary(result.items),
      imports: store.billingImports || [],
    });
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/api/billing-reconciliation/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const input = await readBody(req);
    const row = (store.billingItems || []).find(item => item.id === id);
    if (!row) return send(res, 404, { error: '請求突合データが見つかりません' });
    if (input.status != null) {
      row.status = normalizeBillingStatus(input.status);
      if (row.status === '確認済み' && !row.confirmedAt) row.confirmedAt = new Date().toISOString();
      if (row.status !== '確認済み') row.confirmedAt = '';
    }
    if (input.note != null) row.note = String(input.note || '');
    const manualKeys = BILLING_MANUAL_FIELDS.filter(key => input[key] != null);
    if (manualKeys.length) {
      manualKeys.forEach(key => {
        row[key] = normalizeBillingManualValue(key, input[key]);
      });
      row.manualFields = [...new Set([...(row.manualFields || []), ...manualKeys])];
      row.manualAdjustedAt = new Date().toISOString();
      recomputeBillingItem(row);
    } else {
      row.updatedAt = new Date().toISOString();
    }
    await writeStore(store);
    return send(res, 200, { item: row });
  }
  if (req.method === 'POST' && url.pathname === '/api/billing-reconciliation-xlsx') {
    const input = await readBody(req);
    const items = filterBillingItems(enrichBillingItemsWithDeliveryGroups(store, store.billingItems || []), input);
    const outFile = createBillingWorkbook(items);
    const file = fs.readFileSync(outFile);
    return sendBinary(res, 200, file, {
      'Content-Type': MIME['.xlsx'],
      'Content-Disposition': `attachment; filename="${path.basename(outFile)}"`,
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/billing-reconciliation-csv') {
    const input = await readBody(req);
    const billingItems = enrichBillingItemsWithDeliveryGroups(store, store.billingItems || []);
    const items = input.all ? sortBillingItems(billingItems) : filterBillingItems(billingItems, input);
    const file = createBillingCsv(items);
    const stamp = new Date().toISOString().slice(0, 10);
    return sendBinary(res, 200, file, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="billing_reconciliation_all_${stamp}.csv"`,
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/smallorder-preview') {
    const input = await readBody(req);
    const target = normalizeSmallorderLedgerTarget(input.target);
    const preview = input.fromLedger
      ? buildSmallorderPreviewFromLedger(store, target, input.selectedOrderIds)
      : buildSmallorderPreview(store, input.csv || '');
    return send(res, 200, preview);
  }
  if (req.method === 'POST' && url.pathname === '/api/smallorder-xlsx') {
    const input = await readBody(req);
    const fromLedger = Boolean(input.fromLedger);
    const target = normalizeSmallorderLedgerTarget(input.target);
    const preview = fromLedger
      ? buildSmallorderPreviewFromLedger(store, target, input.selectedOrderIds)
      : buildSmallorderPreview(store, input.csv || '');
    const outFile = createSmallorderWorkbook(preview);
    const exportedAt = new Date().toISOString();
    const isLedgerReexport = fromLedger && target === 'ordered';
    if (!isLedgerReexport) {
      recordAutoOrderHistory(store, preview, {
        csv: input.csv || '',
        source: fromLedger ? 'shopify-orders' : 'banri',
        orderedAt: exportedAt,
      });
      if (fromLedger) {
        markShopifyOrdersExported(store, preview, exportedAt);
      } else {
        mergeShopifyOrders(store, input.csv || '', {
          updateExisting: true,
          purchaseStatus: '発注済',
          banriExportedAt: exportedAt,
        });
      }
      await writeStore(store);
    }
    const file = fs.readFileSync(outFile);
    return sendBinary(res, 200, file, {
      'Content-Type': MIME['.xlsx'],
      'Content-Disposition': `attachment; filename="${path.basename(outFile)}"`,
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/manual-order-xlsx') {
    const input = await readBody(req);
    const items = manualItemsForWorkbook(store, input);
    const outFile = createOrderWorkbook(items, 'manual_order', '手動発注が空です');
    const file = fs.readFileSync(outFile);
    return sendBinary(res, 200, file, {
      'Content-Type': MIME['.xlsx'],
      'Content-Disposition': `attachment; filename="${path.basename(outFile)}"`,
    });
  }

  return send(res, 404, { error: 'APIが見つかりません' });
}

async function handleAuthRoute(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/login') {
    if (hasValidSession(req)) return redirect(res, sanitizeNextPath(url.searchParams.get('next')));
    return serveLogin(req, res);
  }
  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (!authEnabled()) return redirect(res, sanitizeNextPath('/'));
    const input = await readLoginBody(req);
    const next = sanitizeNextPath(input.next);
    if (!constantTimeEqual(input.password, ADMIN_PASSWORD)) {
      return redirect(res, `/login?error=1&next=${encodeURIComponent(next)}`);
    }
    return redirect(res, next, { 'Set-Cookie': createAuthCookie(req) });
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    return redirect(res, '/login', { 'Set-Cookie': clearAuthCookie(req) });
  }
  return null;
}

ensureStore();

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === '/login' || pathname === '/api/login' || pathname === '/api/logout') {
    handleAuthRoute(req, res).catch(err => send(res, err.status || 500, { error: err.message }));
    return;
  }
  if (req.method === 'OPTIONS' && req.url.startsWith('/api/')) {
    handleApi(req, res).catch(err => send(res, err.status || 500, { error: err.message }));
    return;
  }
  if (!hasValidSession(req)) {
    unauthorized(req, res);
    return;
  }
  if (req.url.startsWith('/api/')) {
    handleApi(req, res).catch(err => send(res, err.status || 500, { error: err.message }));
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Local product manager: http://localhost:${PORT}`);
});
