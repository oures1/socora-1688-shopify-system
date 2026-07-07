// アイコンクリック → 商品ページを隠さないよう、必ずサイドパネルで開く
async function configureSidePanelBehavior() {
  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch (e) {}
}

async function openToolSidePanel(tab) {
  try {
    if (chrome.sidePanel?.setOptions && tab?.id) {
      await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true });
    }
    if (chrome.sidePanel?.open && tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      return;
    }
    if (chrome.sidePanel?.open && tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch (panelErr) {
    console.warn('サイドパネルを開けませんでした:', panelErr?.message || panelErr);
  }
}

chrome.runtime.onInstalled?.addListener(configureSidePanelBehavior);
chrome.runtime.onStartup?.addListener(configureSidePanelBehavior);
configureSidePanelBehavior();

chrome.action.onClicked.addListener(openToolSidePanel);

// background.js - Service Worker（全機能統合版）

let lastSourcePageInfo = null;

function rememberSourcePageInfo(request, sender) {
  const data = request?.data || {};
  const tab = sender?.tab || {};
  const url = data.url || tab.url || '';
  if (!/(1688\.com|taobao\.com|tmall\.com)/i.test(url)) return null;
  if (tab.active === false && lastSourcePageInfo?.tabId && lastSourcePageInfo.tabId !== tab.id) {
    return lastSourcePageInfo;
  }
  lastSourcePageInfo = {
    ...data,
    url,
    title: data.title || tab.title || '',
    tabId: tab.id,
    windowId: tab.windowId,
    ts: data.ts || Date.now(),
  };
  return lastSourcePageInfo;
}

chrome.tabs?.onRemoved?.addListener(tabId => {
  if (lastSourcePageInfo?.tabId === tabId) lastSourcePageInfo = null;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sourcePageSeen') {
    const data = rememberSourcePageInfo(request, sender);
    sendResponse({ success: Boolean(data), data });
    return true;
  }
  if (request.action === 'getLastSourcePageInfo') {
    sendResponse({ success: Boolean(lastSourcePageInfo), data: lastSourcePageInfo });
    return true;
  }
  if (request.action === 'shopifyRequest') {
    handleShopifyRequest(request).then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (request.action === 'checkShopifyLogin') {
    checkShopifyLogin(request.storeSlug).then(sendResponse).catch(err => sendResponse({ loggedIn: false, error: err.message }));
    return true;
  }
  if (request.action === 'debugClaudeKey') {
    debugClaudeKey().then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (request.action === 'batchShopifyRequest') {
    // 複数リクエストを並列実行
    Promise.all(request.requests.map(req => 
      handleShopifyRequest(req).catch(e => ({ success: false, error: e.message }))
    )).then(sendResponse).catch(err => sendResponse([{ success: false, error: err.message }]));
    return true;
  }
  if (request.action === 'clearCsrfCache') {
    clearCsrfCache(request.storeSlug);
    sendResponse({ success: true });
    return true;
  }
});

// デバッグ：APIキー確認 + 疎通テスト
async function debugClaudeKey() {
  const data = await chrome.storage.local.get(['claudeKey']);
  const key = data.claudeKey || '';
  
  // キーのサニタイズ
  const cleanKey = key.replace(/[\s\u200B-\u200D\uFEFF\u00A0]/g, '');
  const keyInfo = {
    rawLength: key.length,
    cleanLength: cleanKey.length,
    prefix: cleanKey.substring(0, 20),
    startsCorrectly: cleanKey.startsWith('sk-ant-'),
    hadInvisibleChars: key.length !== cleanKey.length,
    hasSpaces: key.includes(' '),
    hasNewlines: key.includes('\n') || key.includes('\r'),
  };
  const apiKey = cleanKey;
  
  if (!key) return { keyInfo, apiTest: 'skipped - no key' };
  
  // 実際にAPIを叩いてテスト
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    const body = await res.text();
    return {
      keyInfo,
      apiTest: { status: res.status, body: body.substring(0, 300) }
    };
  } catch(e) {
    return { keyInfo, apiTest: { error: e.message } };
  }
}

// ---- CSRFトークンキャッシュ（5分間有効） ----
const csrfCache = {};
async function getCsrfToken(storeSlug) {
  const now = Date.now();
  if (csrfCache[storeSlug] && now - csrfCache[storeSlug].ts < 5 * 60 * 1000) {
    return csrfCache[storeSlug].token;
  }
  const res = await fetch(`https://admin.shopify.com/store/${storeSlug}/products`, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const html = await res.text();
  const patterns = [
    /"csrf[_-]?token"\s*:\s*"([^"]{20,}?)"/i,
    /csrfToken\s*=\s*['"]([^'"]{20,})['"]/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      csrfCache[storeSlug] = { token: m[1], ts: now };
      return m[1];
    }
  }
  throw new Error('CSRFトークンの取得に失敗しました。Shopify管理画面にログインしているか確認してください。');
}

// ---- キャッシュクリア（登録完了後に呼ぶ） ----
function clearCsrfCache(storeSlug) {
  delete csrfCache[storeSlug];
}

// ---- Shopify Admin API ----
async function handleShopifyRequest({ storeSlug, endpoint, method, body }) {
  let csrfToken = null;
  if (method && method !== 'GET') {
    csrfToken = await getCsrfToken(storeSlug);
  }

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const url = `https://admin.shopify.com/store/${storeSlug}${endpoint}`;
  const res = await fetch(url, {
    method: method || 'GET',
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 || res.status === 403) throw new Error('LOGIN_REQUIRED');
  if (!res.ok) {
    const errText = await res.text();
    let errMsg = `Shopify APIエラー (${res.status})`;
    try { errMsg += ': ' + JSON.stringify(JSON.parse(errText).errors); } catch(e) { errMsg += ': ' + errText.substring(0, 200); }
    throw new Error(errMsg);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return { success: true, data: await res.json() };
  return { success: true, data: {} };
}

// ---- ログイン確認 ----
async function checkShopifyLogin(storeSlug) {
  try {
    const res = await fetch(`https://admin.shopify.com/store/${storeSlug}/products/count.json`, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (res.ok) { const data = await res.json(); return { loggedIn: true, count: data.count }; }
    return { loggedIn: false };
  } catch(e) { return { loggedIn: false }; }
}
