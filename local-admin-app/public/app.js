const state = {
  products: [],
  selectedId: null,
  selectedProduct: null,
  query: '',
  status: '',
  sort: 'registeredDesc',
  autoSaveTimer: null,
  autoSaveBusy: false,
  autoSavePending: false,
  manualOrderSelectedKeys: new Set(),
  systemStatus: null,
  systemStatusLoading: false,
  systemStatusError: '',
};

const els = {
  productList: document.getElementById('productList'),
  searchInput: document.getElementById('searchInput'),
  statusFilter: document.getElementById('statusFilter'),
  sortSelect: document.getElementById('sortSelect'),
  productCount: document.getElementById('productCount'),
  detailView: document.getElementById('detailView'),
  emptyState: document.getElementById('emptyState'),
  detailProductNo: document.getElementById('detailProductNo'),
  detailSourceBadge: document.getElementById('detailSourceBadge'),
  detailManualBadge: document.getElementById('detailManualBadge'),
  detailAgeBadge: document.getElementById('detailAgeBadge'),
  detailTitle: document.getElementById('detailTitle'),
  detailOriginalTitle: document.getElementById('detailOriginalTitle'),
  detailStatus: document.getElementById('detailStatus'),
  detailLinkStatus: document.getElementById('detailLinkStatus'),
  detailRegisteredAt: document.getElementById('detailRegisteredAt'),
  detailLinkCheckedAt: document.getElementById('detailLinkCheckedAt'),
  detailLocalTitle: document.getElementById('detailLocalTitle'),
  detailSourceUrl: document.getElementById('detailSourceUrl'),
  detailReplacementUrl: document.getElementById('detailReplacementUrl'),
  detailShopifyUrl: document.getElementById('detailShopifyUrl'),
  detailCost: document.getElementById('detailCost'),
  detailSalePrice: document.getElementById('detailSalePrice'),
  detailShippingCny: document.getElementById('detailShippingCny'),
  detailCnyRate: document.getElementById('detailCnyRate'),
  detailFeeCny: document.getElementById('detailFeeCny'),
  detailMemo: document.getElementById('detailMemo'),
  linkOpenSource: document.getElementById('linkOpenSource'),
  linkOpenProductRegister: document.getElementById('linkOpenProductRegister'),
  linkOpenShopify: document.getElementById('linkOpenShopify'),
  linkOpenShopifyAdmin: document.getElementById('linkOpenShopifyAdmin'),
  detailLinkCheck: document.getElementById('detailLinkCheck'),
  profitSalePrice: document.getElementById('profitSalePrice'),
  profitCostJpy: document.getElementById('profitCostJpy'),
  profitFeesJpy: document.getElementById('profitFeesJpy'),
  profitShippingDetail: document.getElementById('profitShippingDetail'),
  profitCostRate: document.getElementById('profitCostRate'),
  profitAmount: document.getElementById('profitAmount'),
  shopifySyncMeta: document.getElementById('shopifySyncMeta'),
  shopifySyncSummary: document.getElementById('shopifySyncSummary'),
  shopifySyncDiffs: document.getElementById('shopifySyncDiffs'),
  summarySaleStatus: document.getElementById('summarySaleStatus'),
  summaryStageStatus: document.getElementById('summaryStageStatus'),
  summaryAgeStatus: document.getElementById('summaryAgeStatus'),
  summaryShopifyStatus: document.getElementById('summaryShopifyStatus'),
  summaryColorCount: document.getElementById('summaryColorCount'),
  summarySkuCount: document.getElementById('summarySkuCount'),
  summaryLinkStatus: document.getElementById('summaryLinkStatus'),
  summarySoldCount: document.getElementById('summarySoldCount'),
  btnShopifyCreate: document.getElementById('btnShopifyCreate'),
  btnShopifyReconcile: document.getElementById('btnShopifyReconcile'),
  btnShopifyApply: document.getElementById('btnShopifyApply'),
  btnShopifyConfirm: document.getElementById('btnShopifyConfirm'),
  btnCopyRegistrationData: document.getElementById('btnCopyRegistrationData'),
  btnExportProductMaster: document.getElementById('btnExportProductMaster'),
  btnProductRules: document.getElementById('btnProductRules'),
  productRulesModal: document.getElementById('productRulesModal'),
  variantRows: document.getElementById('variantRows'),
  manualOrderSelectedCount: document.getElementById('manualOrderSelectedCount'),
  btnSelectAllVariants: document.getElementById('btnSelectAllVariants'),
  btnClearVariantSelection: document.getElementById('btnClearVariantSelection'),
  btnDownloadSelectedVariants: document.getElementById('btnDownloadSelectedVariants'),
  toast: document.getElementById('toast'),
};

const STATUS_OPTIONS = [
  ['active', '販売中'],
  ['stopped', '販売停止'],
];

const LINK_STATUS_OPTIONS = [
  ['ok', '正常'],
  ['broken', 'リンク切れ'],
];

const SHOPIFY_PRODUCT_BASE_URL = 'https://socora-online.com/products/';
const SHOPIFY_ADMIN_PRODUCTS_URL = 'https://admin.shopify.com/store/y9wpse-tn/products';
const DEFAULT_FEE_CNY = 6;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

const loadingNoticeState = {
  count: 0,
  hideTimer: null,
};

function ensureLoadingNotice() {
  let notice = document.getElementById('globalLoadingNotice');
  if (notice) return notice;
  notice = document.createElement('div');
  notice.id = 'globalLoadingNotice';
  notice.className = 'loading-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span><span class="loading-notice-text">読み込み中です...</span>';
  document.body.appendChild(notice);
  return notice;
}

function showLoading(message = '読み込み中です...') {
  if (loadingNoticeState.hideTimer) {
    clearTimeout(loadingNoticeState.hideTimer);
    loadingNoticeState.hideTimer = null;
  }
  loadingNoticeState.count += 1;
  const notice = ensureLoadingNotice();
  const text = notice.querySelector('.loading-notice-text');
  if (text) text.textContent = message;
  notice.classList.add('visible');
  return () => hideLoading();
}

function hideLoading() {
  loadingNoticeState.count = Math.max(0, loadingNoticeState.count - 1);
  if (loadingNoticeState.count > 0) return;
  loadingNoticeState.hideTimer = setTimeout(() => {
    const notice = document.getElementById('globalLoadingNotice');
    if (notice) notice.classList.remove('visible');
    loadingNoticeState.hideTimer = null;
  }, 120);
}

async function withLoading(message, task) {
  const close = showLoading(message);
  try {
    return await task();
  } finally {
    close();
  }
}

function hasJapaneseKana(value) {
  return /[ぁ-んァ-ヶー]/.test(String(value || ''));
}

function productHasUnconfirmedSourceColor(product) {
  return (product.colors || []).some(color => !String(color.originalColor || '').trim() || hasJapaneseKana(color.originalColor));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '通信に失敗しました');
  return data;
}

function shouldShowSystemStatus() {
  const params = new URLSearchParams(window.location.search);
  return params.get('systemStatus') === '1' || params.get('debug') === 'system';
}

function ensureSystemStatusPanel() {
  if (!shouldShowSystemStatus()) return null;
  let panel = document.getElementById('systemStatusPanel');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'systemStatusPanel';
  panel.className = 'system-status-panel';
  const main = document.querySelector('.main') || document.body;
  main.prepend(panel);
  return panel;
}

function statusPill(ok, okLabel = 'OK', ngLabel = '要確認') {
  return `<span class="pill ${ok ? 'ok' : 'danger'}">${escapeHtml(ok ? okLabel : ngLabel)}</span>`;
}

function countText(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('ja-JP') : '0';
}

function renderHealthCard(label, value, tone = '') {
  return `
    <div class="system-status-card ${tone}">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderSystemStatusTable(headers, rows) {
  if (!rows?.length) return '<div class="system-status-empty">該当データはありません</div>';
  return `
    <div class="system-status-table-wrap">
      <table class="system-status-table">
        <thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
  `;
}

function renderSystemStatusPanel() {
  const panel = ensureSystemStatusPanel();
  if (!panel) return;
  if (state.systemStatusLoading) {
    panel.innerHTML = `
      <div class="system-status-head">
        <div>
          <h2>システム診断</h2>
          <p>Shopify API・商品反映・発送/佐川の状態を確認中です。</p>
        </div>
        <span class="pill warn">確認中</span>
      </div>
      <div class="system-status-loading">少し時間がかかる場合があります。商品と注文を読み取り専用で確認しています。</div>
    `;
    return;
  }
  if (state.systemStatusError) {
    panel.innerHTML = `
      <div class="system-status-head">
        <div>
          <h2>システム診断</h2>
          <p>確認に失敗しました。</p>
        </div>
        ${statusPill(false, 'OK', 'エラー')}
      </div>
      <div class="system-status-alert danger">${escapeHtml(state.systemStatusError)}</div>
    `;
    return;
  }
  const health = state.systemStatus;
  if (!health) return;
  const shopify = health.shopify || {};
  const products = health.products || {};
  const logistics = health.logistics || {};
  const trackingSummary = logistics.trackingPreview?.summary || {};
  const sagawa = logistics.sagawa || {};
  const critical = health.critical || [];
  const shopChecks = shopify.checks || {};
  const scopeStatus = shopify.requiredScopeStatus || {};
  const remoteRows = (products.remoteChecks || []).map(item => `
    <tr>
      <td>${escapeHtml(item.productNo || '')}</td>
      <td>${escapeHtml(item.titleRisk?.safeTitle || '')}</td>
      <td>${item.titleRisk?.suspiciousFields?.length ? '<span class="pill danger">店舗名疑い</span>' : '<span class="pill ok">安全候補</span>'}</td>
      <td>${item.remote?.found ? '<span class="pill ok">あり</span>' : '<span class="pill danger">未確認/なし</span>'}</td>
      <td>${escapeHtml(item.remote?.snapshot?.title || item.remote?.error || '')}</td>
      <td>${escapeHtml(item.remote?.snapshot?.handle || item.remote?.expectedHandle || '')}</td>
      <td>${escapeHtml(item.remote?.snapshot?.status || '')}</td>
      <td>${countText(item.remote?.snapshot?.variantCount)}</td>
      <td>${countText(item.remote?.snapshot?.imageCount)}</td>
    </tr>
  `);
  const titleRiskRows = (products.unsafeTitleProducts || []).map(item => `
    <tr>
      <td>${escapeHtml(item.productNo || '')}</td>
      <td>${escapeHtml(item.localTitle || '')}</td>
      <td>${escapeHtml(item.titleRisk?.safeTitle || '')}</td>
      <td>${escapeHtml((item.titleRisk?.suspiciousFields || []).map(field => `${field.field}: ${field.value}`).join(' / ') || item.titleRisk?.blockedReason || '')}</td>
    </tr>
  `);
  const trackingRows = (logistics.trackingPreview?.candidates || []).map(item => `
    <tr>
      <td>${escapeHtml(item.orderName || '')}</td>
      <td>${escapeHtml(item.trackingNumber || '')}</td>
      <td>${escapeHtml(item.companyLabel || item.company || '')}</td>
      <td>${escapeHtml((item.productNos || []).join(', '))}</td>
      <td>${escapeHtml((item.skus || []).join(', '))}</td>
      <td>${item.ready ? '<span class="pill ok">反映可能</span>' : '<span class="pill warn">保留</span>'}</td>
      <td>${escapeHtml(item.status || item.lastError || '')}</td>
    </tr>
  `);
  const remoteTrackingRows = (logistics.trackingPreview?.remoteSamples || []).map(item => `
    <tr>
      <td>${escapeHtml(item.orderName || '')}</td>
      <td>${escapeHtml(item.trackingNumber || '')}</td>
      <td>${item.remote?.foundOrder ? '<span class="pill ok">注文あり</span>' : '<span class="pill danger">未確認</span>'}</td>
      <td>${item.remote?.existingTracking ? '<span class="pill ok">追跡あり</span>' : '<span class="pill warn">未反映/未確認</span>'}</td>
      <td>${escapeHtml(item.remote?.remainingQuantity ?? item.remote?.error ?? item.remote?.warning ?? '')}</td>
    </tr>
  `);
  panel.innerHTML = `
    <div class="system-status-head">
      <div>
        <h2>システム診断</h2>
        <p>Shopify API・商品反映・発送/佐川を読み取り専用で確認しました。最終確認: ${escapeHtml(new Date(health.generatedAt || Date.now()).toLocaleString('ja-JP'))}</p>
      </div>
      <div class="system-status-actions">
        ${statusPill(Boolean(health.ok), '総合OK', '要確認あり')}
        <button id="btnReloadSystemStatus" class="ghost" type="button">再確認</button>
      </div>
    </div>
    ${critical.length ? `<div class="system-status-alert danger">${critical.map(item => `<div>・${escapeHtml(item)}</div>`).join('')}</div>` : '<div class="system-status-alert ok">重大な警告は出ていません。</div>'}
    <div class="system-status-cards">
      ${renderHealthCard('Shopify API', shopify.ok ? '接続OK' : '要確認', shopify.ok ? 'ok' : 'danger')}
      ${renderHealthCard('商品数', `${countText(products.totalProducts)}件`)}
      ${renderHealthCard('Shopify IDあり', `${countText(products.withShopifyProductId)}件`, products.withShopifyProductId ? 'ok' : 'warn')}
      ${renderHealthCard('ID/URLなし', `${countText(products.withoutAnyShopifyIdentity)}件`, products.withoutAnyShopifyIdentity ? 'danger' : 'ok')}
      ${renderHealthCard('タイトル危険候補', `${countText(products.unsafeTitleCount)}件`, products.unsafeTitleCount ? 'danger' : 'ok')}
      ${renderHealthCard('追跡候補', `${countText(trackingSummary.total)}件`)}
      ${renderHealthCard('追跡反映可能', `${countText(trackingSummary.ready)}件`, (trackingSummary.failed || 0) ? 'warn' : 'ok')}
      ${renderHealthCard('佐川確認', sagawa.sample?.ok ? 'OK' : (sagawa.trackingOrders ? '要確認' : '追跡なし'), sagawa.sample?.ok ? 'ok' : 'warn')}
    </div>
    <details class="system-status-details" open>
      <summary>Shopify APIの確認結果</summary>
      <div class="system-status-grid">
        <div>${statusPill(Boolean(shopChecks.shop?.ok), '店舗読取OK', '店舗読取NG')} <span>${escapeHtml(shopChecks.shop?.name || shopChecks.shop?.error || '')}</span></div>
        <div>${statusPill(Boolean(shopChecks.productsRead?.ok), '商品読取OK', '商品読取NG')} <span>${escapeHtml(shopChecks.productsRead?.sample?.title || shopChecks.productsRead?.error || '')}</span></div>
        <div>${statusPill(Boolean(shopChecks.ordersRead?.ok), '注文読取OK', '注文読取NG')} <span>${escapeHtml(shopChecks.ordersRead?.sample?.name || shopChecks.ordersRead?.error || '')}</span></div>
        <div>${statusPill(Boolean(shopChecks.scopes?.ok), '権限読取OK', '権限読取NG')} <span>${escapeHtml(shopChecks.scopes?.error || '')}</span></div>
      </div>
      <div class="system-status-scope-line">
        ${Object.entries(scopeStatus).map(([scope, ok]) => `<span class="pill ${ok ? 'ok' : 'danger'}">${escapeHtml(scope)} ${ok ? '✓' : '×'}</span>`).join('')}
      </div>
    </details>
    <details class="system-status-details" open>
      <summary>Shopify商品反映チェック（直近商品）</summary>
      ${renderSystemStatusTable(['管理番号', '安全タイトル候補', 'タイトル判定', 'Shopify商品', 'Shopifyタイトル/エラー', 'handle', '状態', 'SKU数', '画像数'], remoteRows)}
    </details>
    <details class="system-status-details" ${titleRiskRows.length ? 'open' : ''}>
      <summary>タイトル危険候補（店舗名・会社名疑い）</summary>
      ${renderSystemStatusTable(['管理番号', '現在タイトル', '安全タイトル候補', '理由'], titleRiskRows)}
    </details>
    <details class="system-status-details" open>
      <summary>発送・佐川チェック</summary>
      <div class="system-status-note">
        佐川設定: ${escapeHtml(sagawa.source || '')} / 追跡番号あり注文: ${countText(sagawa.trackingOrders)}件
        ${sagawa.sample ? ` / サンプル: ${escapeHtml(sagawa.sample.orderName || '')} ${escapeHtml(sagawa.sample.status || sagawa.sample.error || '')}` : ''}
      </div>
      ${renderSystemStatusTable(['注文', '追跡番号', '配送会社', '管理番号', 'SKU', '判定', '状態'], trackingRows)}
    </details>
    <details class="system-status-details">
      <summary>Shopify上の追跡反映サンプル</summary>
      ${renderSystemStatusTable(['注文', '追跡番号', 'Shopify注文', '既存追跡', '残数/エラー'], remoteTrackingRows)}
    </details>
    <details class="system-status-details">
      <summary>詳細データ（開発確認用）</summary>
      <pre>${escapeHtml(JSON.stringify(health, null, 2))}</pre>
    </details>
  `;
  document.getElementById('btnReloadSystemStatus')?.addEventListener('click', () => loadSystemStatus({ force: true }));
}

async function loadSystemStatus({ force = false } = {}) {
  if (!shouldShowSystemStatus()) return;
  if (state.systemStatus && !force) {
    renderSystemStatusPanel();
    return;
  }
  state.systemStatusLoading = true;
  state.systemStatusError = '';
  renderSystemStatusPanel();
  try {
    state.systemStatus = await api('/api/system-status');
  } catch (error) {
    state.systemStatusError = error.message || String(error);
  } finally {
    state.systemStatusLoading = false;
    renderSystemStatusPanel();
  }
}

async function loadAll(options = {}) {
  const run = async () => {
    const { products } = await api('/api/products');
    state.products = products || [];
    const requestedProductNo = getRequestedProductNo();
    const requestedProduct = requestedProductNo
      ? state.products.find(product => String(product.productNo || '').toLowerCase() === requestedProductNo.toLowerCase())
      : null;
    if (requestedProduct) state.selectedId = requestedProduct.id;
    if (!state.selectedId && state.products[0]) state.selectedId = state.products[0].id;
    state.selectedProduct = state.products.find(p => p.id === state.selectedId) || null;
    render();
  };
  if (options.silent) return run();
  return withLoading(options.message || '商品データを読み込み中です...', run);
}

function getRequestedProductNo() {
  return new URLSearchParams(window.location.search).get('productNo')?.trim() || '';
}

function syncProductNoToUrl(product) {
  const productNo = product?.productNo || '';
  if (!productNo) return;
  const url = new URL(window.location.href);
  url.searchParams.set('productNo', productNo);
  window.history.replaceState({}, '', url);
}

function render() {
  renderProducts();
  renderDetail();
}

function renderProducts() {
  const query = state.query.trim().toLowerCase();
  const products = state.products.filter(product => {
    const haystack = [
      product.productNo,
      product.localTitle,
      product.shopifyTitle,
      product.sourceTitle,
      product.originalTitle,
      product.sourceUrl,
    ].join(' ').toLowerCase();
    const queryOk = !query || haystack.includes(query);
    const statusOk = !state.status || normalizeStatusValue(product.status) === state.status;
    return queryOk && statusOk;
  }).sort(compareProducts);

  els.productCount.textContent = `${products.length}件`;

  els.productList.innerHTML = products.map(product => {
    const active = product.id === state.selectedId ? ' active' : '';
    const linkStatus = normalizeLinkStatus(product.linkStatus);
    return `
      <button class="product-row${active}${productAgeRowClass(product)}" data-product-id="${escapeHtml(product.id)}">
        <div class="product-row-title">${escapeHtml(product.productNo)} ${escapeHtml(displayTitle(product))}</div>
        <div class="product-row-meta">
          ${sourceBadgeHtml(product)}
          ${registrationStageBadgeHtml(product)}
          ${agePillHtml(product)}
          ${isManualProduct(product) ? '<span class="pill manual">手動登録</span>' : ''}
          ${Number(product.costCny || 0) <= 0 ? '<span class="pill warn">価格未設定</span>' : ''}
          ${productHasUnconfirmedSourceColor(product) ? '<span class="pill warn">元カラー未確認</span>' : ''}
          <span class="pill ${linkStatusClass(linkStatus)}">${escapeHtml(linkStatusLabel(linkStatus))}</span>
        </div>
      </button>
    `;
  }).join('') || '<div class="product-row"><div class="product-row-meta">該当する商品がありません</div></div>';
}

function compareProducts(a, b) {
  if (state.sort === 'registeredAsc') return productDateValue(a) - productDateValue(b) || productNoCompare(a, b);
  if (state.sort === 'soldDesc') return soldQuantityValue(b) - soldQuantityValue(a) || productNoCompare(b, a);
  if (state.sort === 'soldAsc') return soldQuantityValue(a) - soldQuantityValue(b) || productNoCompare(a, b);
  if (state.sort === 'productNoAsc') return productNoCompare(a, b);
  if (state.sort === 'productNoDesc') return productNoCompare(b, a);
  return productDateValue(b) - productDateValue(a) || productNoCompare(b, a);
}

function soldQuantityValue(product) {
  const value = Number(product.soldQuantity || 0);
  return Number.isFinite(value) ? value : 0;
}

function formatSoldQuantity(product) {
  return `${soldQuantityValue(product).toLocaleString('ja-JP')}点`;
}

function productDateValue(product) {
  const value = product.registeredAt || product.createdAt || '';
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function productNoCompare(a, b) {
  return String(a.productNo || '').localeCompare(String(b.productNo || ''), 'ja', {
    numeric: true,
    sensitivity: 'base',
  });
}

function renderDetail() {
  const product = state.selectedProduct;
  els.detailStatus.innerHTML = STATUS_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  els.detailLinkStatus.innerHTML = LINK_STATUS_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');

  if (!product) {
    els.emptyState.classList.remove('hidden');
    els.detailView.classList.add('hidden');
    return;
  }

  els.emptyState.classList.add('hidden');
  els.detailView.classList.remove('hidden');
  els.detailProductNo.textContent = product.productNo || '';
  renderDetailSourceBadge(product);
  els.detailManualBadge.classList.toggle('hidden', !isManualProduct(product));
  if (els.detailAgeBadge) {
    const ageTone = ageToneFromDays(registrationAgeDays(product));
    els.detailAgeBadge.textContent = ageLabel(product);
    els.detailAgeBadge.title = ageHelpText(product);
    els.detailAgeBadge.className = `pill age-pill ${ageTone}`;
  }
  els.detailTitle.textContent = displayTitle(product);
  els.detailOriginalTitle.textContent = product.sourceTitle || product.originalTitle || '';
  els.detailStatus.value = normalizeStatusValue(product.status || 'active');
  els.detailLinkStatus.value = normalizeLinkStatus(product.linkStatus);
  els.detailRegisteredAt.value = toDateInputValue(product.registeredAt || product.createdAt);
  els.detailLinkCheckedAt.value = product.linkCheckedAt || '';
  els.detailLocalTitle.value = product.localTitle || product.shopifyTitle || '';
  els.detailSourceUrl.value = product.sourceUrl || '';
  els.detailReplacementUrl.value = product.replacementUrl || '';
  const shopifyUrl = product.shopifyUrl || shopifyUrlFromProductNo(product.productNo);
  els.detailShopifyUrl.value = shopifyUrl;
  setOpenLink(els.linkOpenSource, product.sourceUrl || '', '1688 URLがありません');
  if (els.linkOpenProductRegister) els.linkOpenProductRegister.classList.add('hidden');
  setOpenLink(els.linkOpenShopify, shopifyUrl, 'Shopify URLがありません');
  setOpenLink(els.linkOpenShopifyAdmin, shopifyAdminUrlFromProduct(product), 'Shopify編集画面URLがありません');
  els.detailCost.value = product.costCny || '';
  els.detailSalePrice.value = product.salePriceJpy || '';
  els.detailShippingCny.value = String(product.shippingCny || 38);
  els.detailCnyRate.value = product.cnyRate || 24;
  els.detailFeeCny.value = DEFAULT_FEE_CNY;
  els.detailMemo.value = product.memo || '';
  renderProductChecks(product);
  renderProfitSummary(product);
  renderOperationSummary(product);
  renderShopifySync(product);

  const rows = flattenVariantRows(product);
  pruneManualOrderSelection(rows);
  els.variantRows.innerHTML = rows.map(row => `
    <tr class="${variantRowClass(row)}" data-variant-key="${escapeHtml(row.key)}">
      <td>${imageHtml(row.imageUrl, row.originalColor)}</td>
      <td>${escapeHtml(row.originalColor || '')}</td>
      <td><input class="cell-input variant-edit" data-color-id="${escapeHtml(row.colorId)}" data-field="colorJa" value="${escapeHtml(row.colorJa || '')}"></td>
      <td>${escapeHtml(row.originalSize || '')}</td>
      <td><input class="cell-input variant-edit" data-color-id="${escapeHtml(row.colorId)}" data-size-id="${escapeHtml(row.sizeId)}" data-field="sizeJa" value="${escapeHtml(row.sizeJa || '')}"></td>
      <td>${escapeHtml(row.sku || '')}</td>
      <td>${variantStatusHtml(row)}</td>
      <td>${manualOrderCell(row)}</td>
    </tr>
  `).join('');
  updateManualOrderSelectionUI();
}

function flattenVariantRows(product) {
  return (product.colors || []).flatMap(color => {
    const sizes = color.sizes?.length ? color.sizes : [{ id: 'default', originalSize: '', sizeJa: '', sku: '', stockStatus: 'available' }];
    return sizes.map(size => ({
      key: `${product.id}::${color.id}::${size.id}`,
      productId: product.id,
      productNo: product.productNo,
      title: displayTitle(product),
      sourceSite: product.sourceSite,
      sourceUrl: product.sourceUrl,
      unitCny: Number(size.costCny || color.costCny || product.costCny || 0),
      colorId: color.id,
      sizeId: size.id,
      originalColor: color.originalColor,
      colorJa: color.colorJa,
      imageUrl: color.imageUrl,
      originalSize: size.originalSize,
      sizeJa: size.sizeJa,
      sku: size.sku,
      stockStatus: size.stockStatus,
    }));
  });
}

function countVariantRows(product) {
  return flattenVariantRows(product).length;
}

function imageHtml(url, alt) {
  if (!url) return '<div class="no-image">画像なし</div>';
  return `<span class="thumb-wrap" title="${escapeHtml(alt || '')}"><img class="thumb" src="${escapeHtml(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('is-broken');"><span class="thumb-fallback">画像なし</span></span>`;
}

function variantStatusHtml(row) {
  const parts = [];
  if (!row.imageUrl) parts.push('<span class="pill warn">画像なし</span>');
  const isOut = row.stockStatus === 'out';
  parts.push(`<span class="pill ${isOut ? 'danger' : ''}">${isOut ? '在庫なし' : '通常'}</span>`);
  return parts.join(' ');
}

function variantRowClass(row) {
  const classes = [];
  if (!row.imageUrl) classes.push('missing-row');
  if (row.stockStatus === 'out') classes.push('stock-out-row');
  if (state.manualOrderSelectedKeys.has(row.key)) classes.push('manual-order-selected-row');
  return classes.join(' ');
}

function manualOrderCell(row) {
  return `<div class="manual-order-cell">
    <label class="manual-order-check-label">
      <input class="manual-order-check" data-variant-key="${escapeHtml(row.key)}" type="checkbox" ${state.manualOrderSelectedKeys.has(row.key) ? 'checked' : ''}>
      <span>選択</span>
    </label>
    <input class="sheet-input manual-order-qty" data-variant-key="${escapeHtml(row.key)}" type="number" min="1" step="1" value="1" aria-label="手動発注数量">
  </div>`;
}

function renderProductChecks(product) {
  if (els.detailLinkCheck) {
    const linkStatus = normalizeLinkStatus(product.linkStatus);
    els.detailLinkCheck.textContent = linkCheckLabel(product);
    els.detailLinkCheck.className = linkStatus === 'broken' ? 'check-danger' : 'check-ok';
  }
}

function renderProfitSummary(product) {
  const summary = calculateProfitSummary(product);
  els.profitSalePrice.textContent = summary.salePriceJpy > 0 ? formatYen(summary.salePriceJpy) : '-';
  els.profitCostJpy.textContent = formatYen(summary.costJpy);
  els.profitFeesJpy.textContent = formatYen(summary.feesJpy);
  els.profitShippingDetail.textContent = `${summary.shippingWeightKg}kg / 送料${summary.shippingCny}元 + 手数料${summary.feeCny}元`;
  els.profitCostRate.textContent = summary.salePriceJpy > 0 ? `${summary.profitRate.toFixed(1)}%` : '-';
  els.profitAmount.textContent = summary.salePriceJpy > 0 ? formatYen(summary.profitJpy) : '-';
  els.profitAmount.className = summary.profitJpy < 0 ? 'check-danger' : 'check-ok';
}

function shopifySyncLabel(product) {
  return product?.shopifySync?.status || '未照合';
}

function shopifySyncClass(status) {
  const text = String(status || '未照合');
  if (['照合済み', '確認済み', '確定済み'].includes(text)) return 'ok';
  if (['要確認', '取得失敗'].includes(text)) return 'danger';
  return 'warn';
}

function syncCheckLabel(status) {
  if (status === 'ok') return '一致';
  if (status === 'diff') return '差分';
  if (status === 'missing') return '不足';
  if (status === 'review') return '要確認';
  return status || '-';
}

function syncCheckClass(status) {
  if (status === 'ok') return 'ok';
  if (status === 'review') return 'warn';
  return 'danger';
}

function renderShopifySync(product) {
  if (!els.shopifySyncMeta || !els.shopifySyncSummary || !els.shopifySyncDiffs) return;
  const sync = product?.shopifySync || {};
  const result = sync.lastResult || null;
  const status = sync.status || '未照合';
  const lastChecked = sync.lastCheckedAt ? ` / 最終照合 ${formatDateTime(sync.lastCheckedAt)}` : '';
  const confirmed = sync.confirmedAt ? ` / 確認 ${formatDateTime(sync.confirmedAt)}` : '';
  els.shopifySyncMeta.textContent = `${status}${lastChecked}${confirmed}`;
  const syncPanel = document.querySelector('.product-sync-panel');
  if (syncPanel && 'open' in syncPanel) syncPanel.open = false;

  const stats = [
    ['一致', Number(sync.okCount || 0), 'ok'],
    ['差分', Number(sync.diffCount || 0), 'danger'],
    ['不足', Number(sync.missingCount || 0), 'danger'],
    ['要確認', Number(sync.reviewCount || 0), 'warn'],
  ];
  const history = Array.isArray(product?.shopifySyncHistory) ? product.shopifySyncHistory : [];
  const latestHistory = history[0];
  const lastError = sync.lastError ? `<div class="sync-alert">${escapeHtml(sync.lastError)}</div>` : '';
  const historyHtml = latestHistory
    ? `<div class="sync-history">履歴: ${escapeHtml(latestHistory.type || '')} ${escapeHtml(formatDateTime(latestHistory.at))}</div>`
    : '<div class="sync-history">Shopifyに商品登録したあと、ここで実データを照合できます。</div>';
  els.shopifySyncSummary.innerHTML = `
    <div class="sync-stat-line">
      ${stats.map(([label, count, klass]) => `<span class="sync-stat ${klass}"><small>${label}</small><strong>${count}</strong></span>`).join('')}
    </div>
    ${lastError}
    ${historyHtml}
  `;

  const checks = Array.isArray(result?.checks) ? result.checks : [];
  const importantChecks = checks.filter(check => check.status !== 'ok');
  const rows = importantChecks.length ? importantChecks : checks.slice(0, 6);
  const duplicateHtml = Array.isArray(result?.duplicates) && result.duplicates.length
    ? `<div class="sync-alert">
        重複候補: ${result.duplicates.map(item => {
          const label = `${item.handle || item.title || item.legacyId}`;
          return item.adminUrl ? `<a href="${escapeHtml(item.adminUrl)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>` : escapeHtml(label);
        }).join(' / ')}
      </div>`
    : '';
  if (!checks.length) {
    els.shopifySyncDiffs.innerHTML = `
      <div class="sync-empty">未照合です。Shopify登録後に「照合（見るだけ）」を押してください。</div>
    `;
  } else {
    els.shopifySyncDiffs.innerHTML = `
      ${duplicateHtml}
      <div class="sync-table-wrap">
        <table class="sync-table">
          <thead>
            <tr>
              <th>項目</th>
              <th>予定データ</th>
              <th>Shopify実データ</th>
              <th>判定</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(check => `
              <tr>
                <td>${escapeHtml(check.label)}</td>
                <td>${escapeHtml(check.planned)}</td>
                <td>${escapeHtml(check.actual)}</td>
                <td><span class="pill ${syncCheckClass(check.status)}">${escapeHtml(syncCheckLabel(check.status))}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${importantChecks.length ? '' : '<div class="sync-ok-note">主要項目は一致しています。必要なら確認済みにしてください。</div>'}
    `;
  }

  if (els.btnShopifyApply) els.btnShopifyApply.disabled = !product;
  if (els.btnShopifyConfirm) els.btnShopifyConfirm.disabled = !product || !checks.length;
  if (els.btnShopifyReconcile) els.btnShopifyReconcile.disabled = !product;
  if (els.btnShopifyCreate) {
    const hasShopifyProduct = Boolean(product?.shopifyProductId || product?.shopifyAdminUrl);
    els.btnShopifyCreate.classList.toggle('hidden', false);
    els.btnShopifyCreate.disabled = !product;
    els.btnShopifyCreate.textContent = hasShopifyProduct ? 'Shopify紐付け補完' : 'Shopifyへ直接作成';
  }
}

function calculateProfitSummary(product) {
  const costCny = Number(product?.costCny || 0);
  const salePriceJpy = Number(product?.salePriceJpy || 0);
  const shippingCny = Number(product?.shippingCny || 38);
  const feeCny = DEFAULT_FEE_CNY;
  const cnyRate = Number(product?.cnyRate || 24);
  const shippingWeightKg = Number(product?.shippingWeightKg || shippingWeightFromCny(shippingCny));
  const costJpy = Math.round(costCny * cnyRate);
  const feesJpy = Math.round((shippingCny + feeCny) * cnyRate);
  const totalCostJpy = costJpy + feesJpy;
  return {
    costJpy,
    feesJpy,
    totalCostJpy,
    salePriceJpy,
    shippingCny,
    feeCny,
    shippingWeightKg,
    profitJpy: salePriceJpy - totalCostJpy,
    profitRate: salePriceJpy > 0 ? ((salePriceJpy - totalCostJpy) / salePriceJpy) * 100 : 0,
  };
}

function formatYen(value) {
  return `¥${Math.round(Number(value || 0)).toLocaleString('ja-JP')}`;
}

function shippingWeightFromCny(value) {
  const shipping = Number(value || 38);
  if (shipping === 46) return 1;
  if (shipping === 54) return 1.5;
  return 0.5;
}

function statusLabel(status) {
  const normalized = normalizeStatusValue(status);
  return (STATUS_OPTIONS.find(([value]) => value === normalized) || [normalized, normalized || '未設定'])[1];
}

function statusClass(status) {
  return normalizeStatusValue(status) === 'stopped' ? 'danger' : '';
}

function isManualProduct(product) {
  return product?.registrationType === 'manual' || product?.manualEntry === true;
}

function sourceSiteValue(item) {
  const text = String(item?.sourceSite || item?.sourceUrl || '').toLowerCase();
  if (text.includes('taobao')) return 'taobao';
  if (text.includes('tmall')) return 'tmall';
  return '1688';
}

function sourceSiteLabel(item) {
  const site = sourceSiteValue(item);
  if (site === 'taobao') return 'Taobao';
  if (site === 'tmall') return 'Tmall';
  return '1688';
}

function sourceBadgeHtml(item) {
  const site = sourceSiteValue(item);
  return `<span class="pill source ${escapeHtml(site)}">${escapeHtml(sourceSiteLabel(item))}</span>`;
}

function renderDetailSourceBadge(product) {
  if (!els.detailSourceBadge) return;
  const site = sourceSiteValue(product);
  els.detailSourceBadge.textContent = sourceSiteLabel(product);
  els.detailSourceBadge.className = `pill source ${site}`;
  els.detailSourceBadge.classList.remove('hidden');
}

function normalizeStatusValue(status) {
  if (status === 'stopped') return 'stopped';
  return 'active';
}

function displayTitle(product) {
  return product.localTitle || product.shopifyTitle || product.sourceTitle || product.originalTitle || '名称未設定';
}

function shopifyUrlFromProductNo(productNo) {
  const handle = String(productNo || '').trim().toLowerCase();
  return handle ? `${SHOPIFY_PRODUCT_BASE_URL}${encodeURIComponent(handle)}` : '';
}

function registrationStageLabel(product) {
  const stage = product?.registrationStage || 'needs_review';
  if (stage === 'ready_for_shopify_draft') return '下書き待ち';
  if (stage === 'shopify_draft_created') return '下書き済み';
  if (stage === 'published') return '公開済み';
  return '要確認';
}

function registrationStageClass(product) {
  const stage = product?.registrationStage || 'needs_review';
  if (stage === 'published' || stage === 'shopify_draft_created') return 'ok';
  if (stage === 'ready_for_shopify_draft') return 'manual';
  return 'warn';
}

function registrationStageBadgeHtml(product) {
  return `<span class="pill ${registrationStageClass(product)}">${escapeHtml(registrationStageLabel(product))}</span>`;
}

function setSummaryChip(element, label, tone = '') {
  if (!element) return;
  element.textContent = label;
  element.className = `status-chip ${tone}`.trim();
}

function shopifyOperationalStatus(product) {
  const sync = product?.shopifySync || {};
  const hasShopifyLink = Boolean(product?.shopifyProductId || product?.shopifyAdminUrl || product?.shopifyUrl);
  const hasIssue = Boolean(
    sync.lastError ||
    sync.status === '取得失敗' ||
    Number(sync.diffCount || 0) > 0 ||
    Number(sync.missingCount || 0) > 0 ||
    Number(sync.reviewCount || 0) > 0
  );
  if (hasIssue) return { label: 'Shopify要確認', tone: 'danger' };
  if (hasShopifyLink) return { label: 'Shopify正常', tone: 'ok' };
  return { label: 'Shopify未確認', tone: 'warn' };
}

function renderOperationSummary(product) {
  const rows = flattenVariantRows(product);
  const colorCount = (product?.colors || []).length;
  const skuCount = rows.filter(row => row.sku).length;
  const saleTone = normalizeStatusValue(product.status) === 'stopped' ? 'danger' : 'ok';
  const stageTone = registrationStageClass(product);
  const ageTone = ageToneFromDays(registrationAgeDays(product));
  const linkTone = linkStatusClass(product.linkStatus);
  const shopifyStatus = shopifyOperationalStatus(product);
  setSummaryChip(els.summarySaleStatus, statusLabel(product.status), saleTone);
  setSummaryChip(els.summaryStageStatus, registrationStageLabel(product), stageTone);
  setSummaryChip(els.summaryAgeStatus, `${ageLabel(product)} / ${ageHelpText(product)}`, ageTone);
  setSummaryChip(els.summaryShopifyStatus, shopifyStatus.label, shopifyStatus.tone);
  setSummaryChip(els.summaryColorCount, `カラー ${colorCount.toLocaleString('ja-JP')}色`, colorCount ? 'ok' : 'warn');
  setSummaryChip(els.summarySkuCount, `SKU ${skuCount.toLocaleString('ja-JP')}件`, skuCount ? 'ok' : 'warn');
  setSummaryChip(els.summaryLinkStatus, `仕入れURL ${linkStatusLabel(product.linkStatus)}`, linkTone);
  setSummaryChip(els.summarySoldCount, `販売 ${formatSoldQuantity(product)}`, soldQuantityValue(product) ? 'manual' : '');
}

function shopifyAdminUrlFromProduct(product) {
  if (!product) return '';
  if (product.shopifyAdminUrl) return product.shopifyAdminUrl;
  if (product.shopifyProductId) return `${SHOPIFY_ADMIN_PRODUCTS_URL}/${encodeURIComponent(product.shopifyProductId)}`;
  const query = String(product.productNo || product.shopifyUrl || product.localTitle || '').trim();
  return query ? `${SHOPIFY_ADMIN_PRODUCTS_URL}?query=${encodeURIComponent(query)}` : '';
}

function setOpenLink(element, url, emptyLabel) {
  if (!url) {
    element.href = '#';
    element.setAttribute('aria-disabled', 'true');
    element.title = emptyLabel;
    element.classList.add('disabled-link');
    return;
  }
  element.href = url;
  element.removeAttribute('aria-disabled');
  element.title = url;
  element.classList.remove('disabled-link');
}

function productTagsForDescription(product) {
  const source = Array.isArray(product?.shopifyTags)
    ? product.shopifyTags
    : String(product?.shopifyTags || '').split(',');
  return [...new Set(source.map(tag => String(tag || '').trim()).filter(Boolean))];
}

function productCollectionsForDescription(product) {
  const seen = new Set();
  return (product?.shopifyCollections || [])
    .map(collection => collection?.title || collection?.handle || collection?.id || '')
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase().replace(/\s+/g, '').replace(/[／/・_-]+/g, '/');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function copyTextToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // ブラウザ側で一時的にClipboard権限が拒否された場合は、下の従来方式でコピーする。
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function registrationStockQuantity(size = {}) {
  const explicit = size.stockQuantity ?? size.inventoryQuantity ?? size.quantity;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    const number = Number(explicit);
    if (Number.isFinite(number)) return Math.max(0, Math.round(number));
  }
  return size.stockStatus === 'out' ? 0 : 100;
}

function buildProductRegistrationDataText(product) {
  if (!product) return '';
  const sourceLabel = sourceSiteLabel(product);
  const shopifyUrl = product.shopifyUrl || shopifyUrlFromProductNo(product.productNo);
  const tags = productTagsForDescription(product);
  const collections = productCollectionsForDescription(product);
  const snapshot = product.sourceSnapshot || {};
  const sections = [];
  const add = (title, lines) => {
    const body = (Array.isArray(lines) ? lines : [lines])
      .map(line => String(line || '').trim())
      .filter(Boolean)
      .join('\n');
    if (body) sections.push(`【${title}】\n${body}`);
  };
  const colorBlocks = (product.colors || []).map(color => {
    const sizes = (color.sizes || []).map(size => [
      `  - 元サイズ: ${size.originalSize || size.sizeJa || '-'}`,
      `登録サイズ: ${size.sizeJa || size.originalSize || '-'}`,
      `SKU: ${size.sku || '-'}`,
      `在庫予定: ${registrationStockQuantity(size)}`,
      size.stockStatus === 'out' ? '1688/Taobao在庫なし' : '1688/Taobao在庫あり',
    ].filter(Boolean).join(' / '));
    return [
      `■ 元カラー: ${color.originalColor || '-'}`,
      `登録カラー: ${color.colorJa || color.originalColor || '-'}`,
      color.colorCode ? `カラー番号: ${color.colorCode}` : '',
      color.imageUrl ? `画像: ${color.imageUrl}` : '画像なし',
      sizes.join('\n'),
    ].filter(Boolean).join('\n');
  });
  const sourceTextBlocks = [
    product.descriptionSourceText || '',
    sourceSnapshotVariantsText(snapshot),
    sourceSnapshotAttributesText(snapshot),
  ].filter(Boolean).join('\n\n');

  add('商品登録用データ', [
    '中国語原文と、実際にShopify登録へ使う管理データを1つにまとめています。',
    'Shopifyの商品説明欄は空欄で登録する前提です。説明文は必要に応じて自分で入力してください。',
    '在庫予定は、1688/Taobao側で在庫あり=100、在庫なし=0です。',
  ]);
  add('基本情報', [
    `作成日時: ${new Date().toISOString()}`,
    product.productNo ? `管理番号: ${product.productNo}` : '',
    `仕入れ元: ${sourceLabel}`,
    product.sourceUrl ? `仕入れURL: ${product.sourceUrl}` : '',
    shopifyUrl ? `Shopify公開URL: ${shopifyUrl}` : '',
    product.shopifyAdminUrl ? `Shopify編集URL: ${product.shopifyAdminUrl}` : '',
  ]);
  add('タイトル', [
    product.sourceTitle || product.originalTitle ? `${sourceLabel}原文タイトル: ${product.sourceTitle || product.originalTitle}` : '',
    displayTitle(product) ? `登録タイトル: ${displayTitle(product)}` : '',
  ]);
  add('Shopify登録情報', [
    product.shopifyProductType ? `商品タイプ: ${product.shopifyProductType}` : '',
    product.shopifyVendor ? `販売元: ${product.shopifyVendor}` : '',
    Number(product.salePriceJpy || 0) > 0 ? `販売価格: ${formatYen(product.salePriceJpy)}` : '',
    Number(product.costCny || 0) > 0 ? `仕入原価: ${product.costCny}元` : '',
    `送料/手数料: 送料 ${product.shippingCny || 38}元 / 手数料 ${product.feeCny || DEFAULT_FEE_CNY}元 / 為替 ${product.cnyRate || 24}円`,
    tags.length ? `タグ: ${tags.join(', ')}` : '',
    collections.length ? `コレクション: ${collections.join(', ')}` : '',
  ]);
  add('カラー・サイズ・SKU・在庫予定', colorBlocks.join('\n\n'));
  add('中国語原文・取得データ', sourceTextBlocks);
  add('メモ', product.memo || '');
  return sections.join('\n\n').trim() + '\n';
}

async function copySelectedRegistrationData() {
  const product = getSelectedFormData() || state.selectedProduct;
  if (!product) return toast('商品を選択してください');
  await copyTextToClipboard(buildProductRegistrationDataText(product));
  toast('商品登録用データをコピーしました');
}

function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

function productColorSummary(product) {
  return (product?.colors || [])
    .map(color => {
      const ja = String(color.colorJa || '').trim();
      const original = String(color.originalColor || '').trim();
      if (ja && original && ja !== original) return `${ja}（${original}）`;
      return ja || original;
    })
    .filter(Boolean)
    .join(' / ');
}

function productStockOutSummary(product) {
  const rows = flattenVariantRows(product);
  const outCount = rows.filter(row => row.stockStatus === 'out').length;
  return outCount ? `在庫なし ${outCount}/${rows.length}` : '';
}

function productMasterCsvRows(products) {
  const headers = [
    '管理番号',
    '商品名',
    '登録日',
    '経過日数',
    '経過注意',
    '販売状況',
    '公開状況',
    'Shopify状態',
    '仕入れURL状態',
    '販売数',
    'カラー',
    'SKU数',
    '在庫メモ',
    '仕入価格(元)',
    '販売価格(円)',
    '配送重量',
    '送料(元)',
    '仕入れURL',
    'Shopify URL',
    'Shopify編集URL',
    'メモ',
  ];
  const rows = [...products].sort((a, b) => productDateValue(b) - productDateValue(a) || productNoCompare(b, a));
  return [
    headers,
    ...rows.map(product => {
      const age = registrationAgeDays(product);
      const shopifyStatus = shopifyOperationalStatus(product);
      const variantRows = flattenVariantRows(product);
      return [
        product.productNo || '',
        displayTitle(product),
        toDateInputValue(product.registeredAt || product.createdAt),
        age === null ? '' : age,
        ageHelpText(product),
        statusLabel(product.status),
        registrationStageLabel(product),
        shopifyStatus.label,
        linkStatusLabel(product.linkStatus),
        soldQuantityValue(product),
        productColorSummary(product),
        variantRows.filter(row => row.sku).length,
        productStockOutSummary(product),
        product.costCny || '',
        product.salePriceJpy || '',
        `${product.shippingWeightKg || shippingWeightFromCny(product.shippingCny)}kg`,
        product.shippingCny || 38,
        product.sourceUrl || '',
        product.shopifyUrl || shopifyUrlFromProductNo(product.productNo),
        shopifyAdminUrlFromProduct(product),
        product.memo || '',
      ];
    }),
  ];
}

function downloadCsvFile(filename, rows) {
  const body = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadProductMasterCsv() {
  if (!state.products.length) return toast('出力する商品がありません');
  const stamp = todayYmd();
  downloadCsvFile(`product_master_${stamp}.csv`, productMasterCsvRows(state.products));
  toast('商品マスタCSVを出力しました');
}

function sourceSnapshotVariantsText(sourceSnapshot) {
  const variants = Array.isArray(sourceSnapshot?.variants) ? sourceSnapshot.variants : [];
  if (!variants.length) return '';
  return variants.map(variant => {
    const rows = (variant.values || []).map(value => {
      if (value && typeof value === 'object') {
        return `  - 元: ${value.originalValue || value.value || ''} / 入力値: ${value.value || ''}${value.outOfStock ? ' / 在庫なし' : ''}`;
      }
      return `  - ${value}`;
    }).join('\n');
    return `■ ${variant.originalLabel || variant.label || ''}\n${rows}`;
  }).join('\n\n');
}

function sourceSnapshotAttributesText(sourceSnapshot) {
  const attr = sourceSnapshot?.attributes || {};
  const blocks = [];
  if (attr.paramText) blocks.push(`【商品属性】\n${attr.paramText}`);
  if (Array.isArray(attr.sizeTables) && attr.sizeTables.length) blocks.push(`【サイズ表・表データ】\n${attr.sizeTables.join('\n\n---\n\n')}`);
  if (attr.detailText) blocks.push(`【商品詳細原文】\n${attr.detailText}`);
  if (attr.pageText) blocks.push(`【ページ全文控え】\n${attr.pageText}`);
  return blocks.join('\n\n');
}

function normalizeLinkStatus(status) {
  if (status === 'broken') return 'broken';
  if (status === 'partial') return 'broken';
  return 'ok';
}

function linkStatusLabel(status) {
  const normalized = normalizeLinkStatus(status);
  return (LINK_STATUS_OPTIONS.find(([value]) => value === normalized) || ['ok', '正常'])[1];
}

function linkStatusClass(status) {
  const normalized = normalizeLinkStatus(status);
  if (normalized === 'broken') return 'danger';
  return 'ok';
}

function linkCheckLabel(product) {
  const status = linkStatusLabel(product.linkStatus);
  return product.linkCheckedAt ? `${status} ${product.linkCheckedAt}` : status;
}

function todayYmd() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function toDateInputValue(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function localDateFromYmd(value) {
  const ymd = toDateInputValue(value);
  if (!ymd) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function registrationAgeDays(product) {
  const registered = localDateFromYmd(product?.registeredAt || product?.createdAt);
  if (!registered) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today.getTime() - registered.getTime()) / 86400000));
}

function ageToneFromDays(days) {
  if (days === null || days === undefined) return 'warn';
  if (days >= 60) return 'danger';
  if (days >= 30) return 'warn';
  return 'ok';
}

function ageLabel(product) {
  const days = registrationAgeDays(product);
  if (days === null) return '登録日未設定';
  return `登録${days}日`;
}

function ageHelpText(product) {
  const days = registrationAgeDays(product);
  if (days === null) return '登録日を入れると経過日数を確認できます';
  if (days >= 60) return '2か月超え。在庫切れが増えるため発注前に確認';
  if (days >= 30) return '1か月超え。発注前に軽く確認';
  return '新しめの商品';
}

function agePillHtml(product) {
  const tone = ageToneFromDays(registrationAgeDays(product));
  return `<span class="pill age-pill ${tone}">${escapeHtml(ageLabel(product))}</span>`;
}

function productAgeRowClass(product) {
  const tone = ageToneFromDays(registrationAgeDays(product));
  if (tone === 'danger') return ' old-product-row';
  if (tone === 'warn') return ' aging-product-row';
  return '';
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSelectedFormData() {
  const product = structuredClone(state.selectedProduct);
  if (!product) return null;
  product.status = els.detailStatus.value;
  product.linkStatus = els.detailLinkStatus.value;
  product.registeredAt = els.detailRegisteredAt.value;
  product.linkCheckedAt = els.detailLinkCheckedAt.value;
  product.localTitle = els.detailLocalTitle.value.trim();
  product.sourceUrl = els.detailSourceUrl.value.trim();
  product.replacementUrl = els.detailReplacementUrl.value.trim();
  product.shopifyUrl = els.detailShopifyUrl.value.trim();
  product.costCny = Number(els.detailCost.value || 0);
  product.salePriceJpy = Number(els.detailSalePrice.value || 0);
  product.shippingCny = Number(els.detailShippingCny.value || 38);
  product.shippingWeightKg = selectedShippingWeight();
  product.cnyRate = Number(els.detailCnyRate.value || 24);
  product.feeCny = DEFAULT_FEE_CNY;
  product.memo = els.detailMemo.value.trim();
  return product;
}

function selectedShippingWeight() {
  const option = els.detailShippingCny?.selectedOptions?.[0];
  return Number(option?.dataset.weight || 0.5);
}

function updateSelectedProductFromForm() {
  const product = getSelectedFormData();
  if (!product) return null;
  state.selectedProduct = product;
  const index = state.products.findIndex(item => item.id === product.id);
  if (index >= 0) state.products[index] = product;
  return product;
}

async function saveSelectedProduct(message = '保存しました', options = {}) {
  const product = options.useCurrentState
    ? structuredClone(state.selectedProduct)
    : updateSelectedProductFromForm();
  if (!product) return;
  await withLoading('商品情報を保存中です...', () => api(`/api/products/${encodeURIComponent(product.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ product }),
  }));
  if (message) toast(message);
  if (options.reload !== false) await loadAll({ silent: true });
}

function replaceProductInState(product) {
  if (!product) return;
  const index = state.products.findIndex(item => item.id === product.id);
  if (index >= 0) {
    state.products[index] = product;
  } else {
    state.products.unshift(product);
  }
  state.selectedId = product.id;
  state.selectedProduct = product;
  syncProductNoToUrl(product);
  render();
}

async function saveBeforeShopifySync() {
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = null;
  state.autoSavePending = false;
  await saveSelectedProduct('', { reload: false });
}

async function reconcileSelectedShopifyProduct() {
  if (!state.selectedProduct) return toast('商品を選択してください');
  try {
    await saveBeforeShopifySync();
    const id = state.selectedProduct.id;
    const data = await withLoading('Shopify実データを照合中です...', () => api(`/api/products/${encodeURIComponent(id)}/shopify-reconcile`, {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    replaceProductInState(data.product);
    toast(data.result?.status === '照合済み' ? 'Shopify実データと一致しました' : 'Shopify実データとの差分を表示しました');
  } catch (e) {
    toast(e.message);
  }
}

async function applyShopifyDataToSelectedProduct() {
  if (!state.selectedProduct) return toast('商品を選択してください');
  const ok = confirm('Shopifyの実データを正として、管理システム側の商品名・URL・バリエーション・画像紐づきを上書きします。Shopify側の商品内容は変更しません。実行しますか？');
  if (!ok) return;
  try {
    await saveBeforeShopifySync();
    const id = state.selectedProduct.id;
    const data = await withLoading('Shopifyデータで上書き中です...', () => api(`/api/products/${encodeURIComponent(id)}/shopify-apply`, {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    replaceProductInState(data.product);
    toast('Shopifyデータで管理システム側を更新しました');
  } catch (e) {
    toast(e.message);
  }
}

async function confirmSelectedShopifySync() {
  if (!state.selectedProduct) return toast('商品を選択してください');
  try {
    await saveBeforeShopifySync();
    const id = state.selectedProduct.id;
    const data = await withLoading('照合結果を確認済みにしています...', () => api(`/api/products/${encodeURIComponent(id)}/shopify-confirm`, {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    replaceProductInState(data.product);
    toast('Shopify照合を確認済みにしました');
  } catch (e) {
    toast(e.message);
  }
}

async function createSelectedShopifyProduct() {
  if (!state.selectedProduct) return toast('商品を選択してください');
  const productNo = state.selectedProduct.productNo || '';
  const hasShopifyProduct = Boolean(state.selectedProduct.shopifyProductId || state.selectedProduct.shopifyAdminUrl);
  const actionLabel = hasShopifyProduct ? 'Shopifyの紐付けを補完' : 'Shopifyへ直接作成';
  const ok = confirm(`${productNo} を${actionLabel}します。\n\n商品登録画面は経由しません。会社名・店舗名のような危険なタイトルの場合は自動で停止します。実行しますか？`);
  if (!ok) return;
  try {
    await saveBeforeShopifySync();
    const id = state.selectedProduct.id || state.selectedProduct.productNo;
    const data = await withLoading(hasShopifyProduct ? 'Shopifyの紐付けを補完中です...' : 'Shopifyへ商品を作成中です...', () => api(`/api/products/${encodeURIComponent(id)}/shopify-create`, {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    replaceProductInState(data.product);
    const publishMessage = data.publication?.published ? '・公開確認済み' : '';
    const message = data.alreadyExists ? `既存のShopify商品を補完しました${publishMessage}` : `Shopifyへ商品を作成しました${publishMessage}`;
    toast(`${data.product?.productNo || productNo}：${message}`);
  } catch (e) {
    toast(e.message);
  }
}

async function createManualProduct() {
  toast('手動商品を追加します。管理番号とタイトルを順番に入力してください');
  const suggested = await withLoading('次の管理番号を確認中です...', fetchNextProductNo);
  const productNo = prompt('管理番号を入力してください', suggested)?.trim();
  if (!productNo) return;

  const existing = state.products.find(product =>
    String(product.productNo || '').toLowerCase() === productNo.toLowerCase()
  );
  if (existing) {
    state.selectedId = existing.id;
    state.selectedProduct = existing;
    syncProductNoToUrl(existing);
    render();
    toast('同じ管理番号があるので、その商品を開きました');
    return;
  }

  const localTitle = prompt('管理用タイトルを入力してください')?.trim() || productNo;
  const product = {
    productNo,
    localTitle,
    shopifyTitle: localTitle,
    sourceTitle: '',
    originalTitle: '',
    sourceUrl: '',
    replacementUrl: '',
    shopifyUrl: shopifyUrlFromProductNo(productNo),
    shopifyAdminUrl: '',
    shopifyProductId: '',
    registrationType: 'manual',
    status: 'active',
    registeredAt: todayYmd(),
    linkStatus: 'ok',
    linkCheckedAt: '',
    costCny: 0,
    salePriceJpy: 0,
    shippingCny: 38,
    shippingWeightKg: 0.5,
    cnyRate: 24,
    feeCny: DEFAULT_FEE_CNY,
    memo: '',
    colors: [],
  };
  const data = await withLoading('手動商品を登録中です...', () => api('/api/products', {
    method: 'POST',
    body: JSON.stringify({ product }),
  }));
  state.selectedId = data.product?.id || product.productNo;
  await loadAll({ silent: true });
  toast('手動登録として追加しました');
}

function selectedVariantOrderItem(variantKey, quantity) {
  const product = state.selectedProduct;
  if (!product) return null;
  const row = flattenVariantRows(product).find(item => item.key === variantKey);
  if (!row) return null;
  return {
    productId: product.id,
    productNo: product.productNo || row.productNo || '',
    title: displayTitle(product),
    sku: row.sku || '',
    sourceSite: product.sourceSite || row.sourceSite || '',
    sourceUrl: product.sourceUrl || row.sourceUrl || '',
    imageUrl: row.imageUrl || '',
    originalSize: row.originalSize || '',
    originalColor: row.originalColor || '',
    quantity: Math.max(1, Number(quantity || 1)),
    unitCny: Number(row.unitCny || product.costCny || 0),
  };
}

function pruneManualOrderSelection(rows) {
  const liveKeys = new Set((rows || []).map(row => row.key));
  state.manualOrderSelectedKeys.forEach(key => {
    if (!liveKeys.has(key)) state.manualOrderSelectedKeys.delete(key);
  });
}

function updateManualOrderSelectionUI() {
  const selectedCount = state.manualOrderSelectedKeys.size;
  if (els.manualOrderSelectedCount) {
    els.manualOrderSelectedCount.textContent = `選択 ${selectedCount}件`;
  }
  if (els.btnDownloadSelectedVariants) {
    els.btnDownloadSelectedVariants.disabled = selectedCount === 0;
  }
  els.variantRows?.querySelectorAll('tr[data-variant-key]').forEach(row => {
    row.classList.toggle('manual-order-selected-row', state.manualOrderSelectedKeys.has(row.dataset.variantKey));
  });
}

function selectedManualOrderItems() {
  return [...state.manualOrderSelectedKeys].map(key => {
    const qtyInput = els.variantRows.querySelector(`.manual-order-qty[data-variant-key="${CSS.escape(key)}"]`);
    return selectedVariantOrderItem(key, qtyInput?.value || 1);
  }).filter(Boolean);
}

async function downloadManualOrderItems(items, fileLabel = 'manual_order') {
  if (!items.length) return toast('Excelに出力するバリアントを選択してください');
  await saveSelectedProduct('', { reload: false });
  await withLoading('手動発注Excelを作成中です...', async () => {
    const res = await fetch('/api/manual-order-xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderItems: items }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || '手動発注Excelを作成できませんでした');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

async function downloadManualOrderForSelection() {
  const items = selectedManualOrderItems();
  try {
    await downloadManualOrderItems(items, `manual_order_${state.selectedProduct?.productNo || 'selected'}`);
    toast(`${items.length}件を手動発注Excelに出力しました`);
  } catch (e) {
    toast(e.message);
  }
}

async function fetchNextProductNo() {
  try {
    const data = await api('/api/next-product-no');
    return data.productNo || 'S0001';
  } catch(e) {
    return 'S0001';
  }
}

function scheduleAutoSave({ renderList = false } = {}) {
  const product = getSelectedFormData();
  if (!product) return;
  state.selectedProduct = product;
  const index = state.products.findIndex(item => item.id === product.id);
  if (index >= 0) state.products[index] = product;
  if (renderList) renderProducts();
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(flushAutoSave, 700);
}

async function flushAutoSave() {
  if (!state.selectedProduct) return;
  if (state.autoSaveBusy) {
    state.autoSavePending = true;
    return;
  }
  state.autoSaveBusy = true;
  state.autoSavePending = false;
  const product = structuredClone(state.selectedProduct);
  try {
    await api(`/api/products/${encodeURIComponent(product.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ product }),
    });
    toast('自動保存しました');
  } catch(e) {
    toast('自動保存に失敗しました: ' + e.message);
  } finally {
    state.autoSaveBusy = false;
    if (state.autoSavePending) {
      clearTimeout(state.autoSaveTimer);
      state.autoSaveTimer = setTimeout(flushAutoSave, 300);
    }
  }
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('visible');
  setTimeout(() => els.toast.classList.remove('visible'), 2200);
}

function toggleProductRules(open) {
  if (!els.productRulesModal) return;
  els.productRulesModal.classList.toggle('hidden', !open);
  document.body.classList.toggle('modal-open', Boolean(open));
}

function bindEvents() {
  document.getElementById('btnReload').addEventListener('click', loadAll);
  document.getElementById('btnManualProduct').addEventListener('click', createManualProduct);
  els.btnExportProductMaster?.addEventListener('click', downloadProductMasterCsv);
  els.btnProductRules?.addEventListener('click', () => toggleProductRules(true));
  els.productRulesModal?.addEventListener('click', event => {
    if (event.target.closest('[data-close-rules]')) toggleProductRules(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && els.productRulesModal && !els.productRulesModal.classList.contains('hidden')) {
      toggleProductRules(false);
    }
  });
  document.getElementById('btnMarkLinkOk').addEventListener('click', async () => {
    els.detailLinkStatus.value = 'ok';
    els.detailLinkCheckedAt.value = todayYmd();
    await saveSelectedProduct('正常として保存しました');
  });
  document.getElementById('btnMarkLinkBroken').addEventListener('click', async () => {
    els.detailLinkStatus.value = 'broken';
    els.detailLinkCheckedAt.value = todayYmd();
    await saveSelectedProduct('リンク切れとして保存しました');
  });
  document.getElementById('btnApplyReplacement').addEventListener('click', async () => {
    const nextUrl = els.detailReplacementUrl.value.trim();
    if (!nextUrl) return toast('差し替え候補URLがありません');
    els.detailSourceUrl.value = nextUrl;
    els.detailReplacementUrl.value = '';
    els.detailLinkStatus.value = 'ok';
    els.detailLinkCheckedAt.value = todayYmd();
    await saveSelectedProduct('1688 URLを差し替えました');
  });
  document.getElementById('btnCopySource').addEventListener('click', async () => {
    const url = els.detailSourceUrl.value.trim() || state.selectedProduct?.sourceUrl;
    if (!url) return toast('1688 URLがありません');
    await copyTextToClipboard(url);
    toast('1688 URLをコピーしました');
  });
  els.btnCopyRegistrationData?.addEventListener('click', copySelectedRegistrationData);
  els.btnShopifyReconcile?.addEventListener('click', reconcileSelectedShopifyProduct);
  els.btnShopifyCreate?.addEventListener('click', createSelectedShopifyProduct);
  els.btnShopifyApply?.addEventListener('click', applyShopifyDataToSelectedProduct);
  els.btnShopifyConfirm?.addEventListener('click', confirmSelectedShopifySync);

  els.searchInput.addEventListener('input', event => {
    state.query = event.target.value;
    renderProducts();
  });
  els.statusFilter.addEventListener('change', event => {
    state.status = event.target.value;
    renderProducts();
  });
  els.sortSelect.addEventListener('change', event => {
    state.sort = event.target.value;
    renderProducts();
  });
  els.productList.addEventListener('click', event => {
    const row = event.target.closest('[data-product-id]');
    if (!row) return;
    state.selectedId = row.dataset.productId;
    state.selectedProduct = state.products.find(p => p.id === state.selectedId) || null;
    syncProductNoToUrl(state.selectedProduct);
    render();
  });
  [
    els.detailStatus,
    els.detailLinkStatus,
    els.detailRegisteredAt,
    els.detailLinkCheckedAt,
    els.detailLocalTitle,
    els.detailSourceUrl,
    els.detailReplacementUrl,
    els.detailShopifyUrl,
    els.detailCost,
    els.detailSalePrice,
    els.detailShippingCny,
    els.detailCnyRate,
    els.detailFeeCny,
    els.detailMemo,
  ].forEach(input => {
    const refreshAndSave = () => {
      const product = getSelectedFormData();
      if (product) renderProfitSummary(product);
      scheduleAutoSave({ renderList: true });
    };
    if (!input) return;
    input.addEventListener('input', refreshAndSave);
    input.addEventListener('change', refreshAndSave);
  });
  els.variantRows.addEventListener('input', event => {
    const input = event.target.closest('.variant-edit');
    if (!input || !state.selectedProduct) return;
    const color = state.selectedProduct.colors.find(item => item.id === input.dataset.colorId);
    if (!color) return;
    if (input.dataset.field === 'colorJa') color.colorJa = input.value;
    if (input.dataset.field === 'sizeJa') {
      const size = color.sizes.find(item => item.id === input.dataset.sizeId);
      if (size) size.sizeJa = input.value;
    }
    scheduleAutoSave();
  });
  els.variantRows.addEventListener('change', event => {
    const checkbox = event.target.closest('.manual-order-check');
    if (!checkbox) return;
    if (checkbox.checked) {
      state.manualOrderSelectedKeys.add(checkbox.dataset.variantKey);
    } else {
      state.manualOrderSelectedKeys.delete(checkbox.dataset.variantKey);
    }
    updateManualOrderSelectionUI();
  });
  els.btnSelectAllVariants?.addEventListener('click', () => {
    flattenVariantRows(state.selectedProduct || {}).forEach(row => state.manualOrderSelectedKeys.add(row.key));
    renderDetail();
  });
  els.btnClearVariantSelection?.addEventListener('click', () => {
    state.manualOrderSelectedKeys.clear();
    renderDetail();
  });
  els.btnDownloadSelectedVariants?.addEventListener('click', downloadManualOrderForSelection);
}

bindEvents();
loadAll()
  .then(() => loadSystemStatus())
  .catch(err => toast(err.message));
