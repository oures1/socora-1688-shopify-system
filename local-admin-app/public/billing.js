const billingState = {
  items: [],
  imports: [],
  query: '',
  month: '',
  status: '',
  bucket: '',
  pendingPayload: null,
  preview: null,
  uploadBusy: false,
  tracking: null,
  trackingBusy: false,
  compactMode: true,
};

const billingEls = {
  csvFile: document.getElementById('billingCsvFile'),
  btnPreview: document.getElementById('btnPreviewBilling'),
  btnApply: document.getElementById('btnApplyBilling'),
  btnExportCsv: document.getElementById('btnExportBillingCsv'),
  search: document.getElementById('billingSearch'),
  monthFilter: document.getElementById('billingMonthFilter'),
  statusFilter: document.getElementById('billingStatusFilter'),
  rows: document.getElementById('billingRows'),
  table: document.querySelector('.billing-table'),
  headRow: document.getElementById('billingHeadRow'),
  visibleCount: document.getElementById('billingVisibleCount'),
  viewModeToggle: document.getElementById('billingViewModeToggle'),
  importResult: document.getElementById('billingImportResult'),
  lastUpload: document.getElementById('billingLastUpload'),
  uploadState: document.getElementById('billingUploadState'),
  previewPanel: document.getElementById('billingPreviewPanel'),
  previewMessage: document.getElementById('billingPreviewMessage'),
  previewStats: document.getElementById('billingPreviewStats'),
  statProductSales: document.getElementById('statBillingProductSales'),
  statShippingRevenue: document.getElementById('statBillingShippingRevenue'),
  statRevenue: document.getElementById('statBillingRevenue'),
  statGrossProfit: document.getElementById('statBillingGrossProfit'),
  statItems: document.getElementById('statBillingItems'),
  statAction: document.getElementById('statBillingAction'),
  statUnbilled: document.getElementById('statBillingUnbilled'),
  statTracking: document.getElementById('statBillingTracking'),
  statLowMargin: document.getElementById('statBillingLowMargin'),
  statItemNoOnly: document.getElementById('statBillingItemNoOnly'),
  statCoDelivery: document.getElementById('statBillingCoDelivery'),
  statFinalCandidate: document.getElementById('statBillingFinalCandidate'),
  statConfirmed: document.getElementById('statBillingConfirmed'),
  statButtons: [...document.querySelectorAll('[data-billing-bucket]')],
  trackingStatus: document.getElementById('shopifyTrackingStatus'),
  btnLoadTracking: document.getElementById('btnLoadShopifyTracking'),
  btnSyncTracking: document.getElementById('btnSyncShopifyTracking'),
  notifyCustomer: document.getElementById('shopifyNotifyCustomer'),
  trackingCompany: document.getElementById('shopifyTrackingCompany'),
  trackingReviewPanel: document.getElementById('trackingReviewPanel'),
  trackingReviewMessage: document.getElementById('trackingReviewMessage'),
  trackingReviewList: document.getElementById('trackingReviewList'),
  toast: document.getElementById('toast'),
};

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
  let closed = false;
  const notice = ensureLoadingNotice();
  const text = notice.querySelector('.loading-notice-text');
  if (text) text.textContent = message;
  notice.classList.add('visible');
  return () => {
    if (closed) return;
    closed = true;
    hideLoading();
  };
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

function clearLoading() {
  loadingNoticeState.count = 0;
  if (loadingNoticeState.hideTimer) {
    clearTimeout(loadingNoticeState.hideTimer);
    loadingNoticeState.hideTimer = null;
  }
  const notice = document.getElementById('globalLoadingNotice');
  if (notice) notice.classList.remove('visible');
}

async function withLoading(message, task) {
  const close = showLoading(message);
  try {
    return await task();
  } finally {
    close();
    setTimeout(() => {
      if (loadingNoticeState.count <= 0) clearLoading();
    }, 180);
  }
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

async function loadBilling(options = {}) {
  const run = async () => {
    const params = new URLSearchParams();
    if (billingState.query) params.set('query', billingState.query);
    if (billingState.month) params.set('month', billingState.month);
    if (billingState.status) params.set('status', billingState.status);
    if (billingState.bucket) params.set('bucket', billingState.bucket);
    const data = await api(`/api/billing-reconciliation${params.toString() ? `?${params}` : ''}`);
    billingState.items = data.items || [];
    billingState.imports = data.imports || [];
    renderBilling(data.summary || summarizeBilling(billingState.items), data.allSummary || data.summary || summarizeBilling(billingState.items));
    renderLastUpload();
  };
  if (options.silent) return run();
  return withLoading(options.message || '請求突合台帳を読み込み中です...', run);
}

function renderBilling(summary = summarizeBilling(billingState.items), allSummary = summary) {
  const rows = prioritizeTrackingCandidates(billingState.items);
  billingEls.visibleCount.textContent = `${rows.length}行`;
  billingEls.statItems.textContent = `${allSummary.itemCount || 0}件`;
  billingEls.statAction.textContent = `${allSummary.actionCount || 0}件`;
  billingEls.statUnbilled.textContent = `${allSummary.unbilledCount || 0}件`;
  billingEls.statTracking.textContent = `${allSummary.missingTrackingCount || 0}件`;
  billingEls.statLowMargin.textContent = `${allSummary.lowMarginCount || 0}件`;
  if (billingEls.statProductSales) billingEls.statProductSales.textContent = yen(allSummary.totalProductSalesJpy || 0);
  if (billingEls.statShippingRevenue) billingEls.statShippingRevenue.textContent = yen(allSummary.totalCustomerShippingRevenueJpy || 0);
  if (billingEls.statRevenue) billingEls.statRevenue.textContent = yen(allSummary.totalRevenueJpy || allSummary.totalSalesJpy || 0);
  if (billingEls.statGrossProfit) billingEls.statGrossProfit.textContent = yen(allSummary.totalGrossProfitJpy || 0);
  if (billingEls.statItemNoOnly) billingEls.statItemNoOnly.textContent = `${allSummary.itemNoOnlyCount || 0}件`;
  if (billingEls.statCoDelivery) billingEls.statCoDelivery.textContent = `${allSummary.coDeliveryGroupCount || 0}組/${allSummary.coDeliveryCount || 0}件`;
  if (billingEls.statFinalCandidate) billingEls.statFinalCandidate.textContent = `${allSummary.finalCandidateCount || 0}件`;
  billingEls.statConfirmed.textContent = `${allSummary.confirmedCount || 0}件`;
  billingEls.statButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.billingBucket === billingState.bucket);
  });

  const summaryMode = billingState.compactMode;
  if (billingEls.table) billingEls.table.classList.toggle('is-summary', summaryMode);
  if (billingEls.headRow) billingEls.headRow.innerHTML = summaryMode ? summaryHeaderHtml() : detailHeaderHtml();
  if (billingEls.viewModeToggle) {
    billingEls.viewModeToggle.textContent = summaryMode ? '詳細編集' : '要点表示';
    billingEls.viewModeToggle.classList.toggle('active', !summaryMode);
  }
  billingEls.rows.innerHTML = rows.map(row => summaryMode ? summaryRowHtml(row) : detailRowHtml(row)).join('')
    || `<tr><td colspan="${summaryMode ? 6 : 8}" class="empty-cell">料金明細CSVを読み込むとここに表示されます。</td></tr>`;
}

function summaryHeaderHtml() {
  return `
    <th class="source-manual">状態</th>
    <th class="source-shopify">注文</th>
    <th class="source-shopify">商品/SKU</th>
    <th class="source-csv">原価</th>
    <th class="source-calc">売上/粗利</th>
    <th class="source-manual">確認</th>
  `;
}

function detailHeaderHtml() {
  return `
    <th class="source-manual">処理<span class="source-chip manual">手動</span></th>
    <th class="source-shopify">注文・配送先<span class="source-chip shopify">CSV/Shopify</span></th>
    <th class="source-shopify">商品<span class="source-chip shopify">Shopify補完</span></th>
    <th class="source-csv">追跡<span class="source-chip csv">料金明細CSV</span></th>
    <th class="source-csv">費用<span class="source-chip csv">料金明細CSV</span></th>
    <th class="source-calc">売上・利益<span class="source-chip calc">自動計算</span></th>
    <th class="source-shopify">Shopify反映<span class="source-chip shopify">API</span></th>
    <th class="source-manual">確認・メモ<span class="source-chip manual">手動</span></th>
  `;
}

function detailRowHtml(row) {
  return `
    <tr class="${rowClass(row)}">
      <td>
        <select class="sheet-select billing-edit status-select ${statusClass(row.status)}" data-billing-id="${escapeHtml(row.id)}" data-field="status">
          ${['未処理', '要確認', '未請求', '確認済み'].map(status => `<option value="${status}" ${row.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </td>
      <td class="compact-cell">${orderCompactCell(row)}</td>
      <td class="product-compact-cell">${productCompactCell(row)}</td>
      <td class="compact-cell mono">${banriCompactCell(row)}</td>
      <td class="cost-compact-cell">${costCompactCell(row)}</td>
      <td class="profit-compact-cell">${profitCompactCell(row)}</td>
      <td class="shopify-sync-cell">${shopifyTrackingCell(row)}</td>
      <td class="issue-compact-cell">${issueMemoCell(row)}</td>
    </tr>
  `;
}

function summaryRowHtml(row) {
  return `
    <tr class="${rowClass(row)}">
      <td class="summary-status-cell">${summaryStatusCell(row)}</td>
      <td class="summary-order-cell">${summaryOrderCell(row)}</td>
      <td class="summary-product-cell">${summaryProductCell(row)}</td>
      <td class="summary-cost-cell">${summaryCostCell(row)}</td>
      <td class="summary-profit-cell">${summaryProfitCell(row)}</td>
      <td class="summary-action-cell">${summaryActionCell(row)}</td>
    </tr>
  `;
}

function valueOrDash(value) {
  const text = String(value ?? '').trim();
  return text || '-';
}

function manualMark(row, fields) {
  const list = Array.isArray(fields) ? fields : [fields];
  return list.some(field => isManualField(row, field))
    ? '<span class="manual-field-badge compact-manual-badge" title="手入力済み。次回アップロードでもこの値を優先します">手</span>'
    : '';
}

function summaryMeta(label, value, options = {}) {
  const body = options.raw ? value : escapeHtml(valueOrDash(value));
  return `<span class="summary-meta-item ${options.tone ? `tone-${options.tone}` : ''}"><span>${escapeHtml(label)}</span><strong>${body}</strong></span>`;
}

function summaryStatusCell(row) {
  return `<div class="summary-line summary-status-line">
    <select class="sheet-select billing-edit status-select ${statusClass(row.status)}" data-billing-id="${escapeHtml(row.id)}" data-field="status">
      ${['未処理', '要確認', '未請求', '確認済み'].map(status => `<option value="${status}" ${row.status === status ? 'selected' : ''}>${status}</option>`).join('')}
    </select>
  </div>`;
}

function summaryOrderCell(row) {
  const trackingNo = row.logisticsNo || row.shopifyTrackingNumber || '';
  const orderNo = row.displayCustomerOrderNo || row.customerOrderNo || row.shopifyOrderName;
  const recipient = row.displayRecipientName || row.recipientName || row.orderGroupRecipientName || '';
  return `<div class="summary-line">
    <strong class="summary-key">${escapeHtml(valueOrDash(orderNo))}</strong>
    ${manualMark(row, 'customerOrderNo')}
    ${sameOrderBadge(row)}
    <span class="summary-text truncate">${escapeHtml(valueOrDash(recipient))}${manualMark(row, 'recipientName')}</span>
    ${row.banriOrderNo ? `<span class="summary-pill">BANRI ${escapeHtml(row.banriOrderNo)}</span>` : ''}
    ${trackingNo ? `<span class="summary-pill tracking-pill">追跡 ${escapeHtml(trackingNo)}</span>` : ''}
    ${deliveryGroupBadge(row)}
  </div>`;
}

function summaryProductCell(row) {
  return `<div class="summary-line">
    <strong class="summary-key">${escapeHtml(valueOrDash(row.productNo))}</strong>
    ${manualMark(row, 'productNo')}
    <span class="summary-sku mono">${escapeHtml(valueOrDash(row.sku))}</span>
    ${manualMark(row, 'sku')}
    <span class="summary-text truncate">${escapeHtml(valueOrDash(row.productName || row.shopifyLineName))}${manualMark(row, 'productName')}</span>
    <span class="summary-pill">${Number(row.quantity || 0)}点</span>
  </div>`;
}

function summaryCostCell(row) {
  const shipping = Number(row.domesticShippingJpy || 0) + Number(row.allocatedInternationalShippingJpy || 0);
  const banriFee = Number(row.workFeeJpy || 0);
  return `<div class="summary-line money-summary-line">
    <strong>${yen(row.totalCostJpy)}${cnyNote(row.totalCostJpy, row)}</strong>
    <span class="summary-subtle">商品 ${yen(row.productCostJpy)}</span>
    ${shipping ? `<span class="summary-subtle">送料 ${yen(shipping)}</span>` : ''}
    <span class="summary-subtle">BANRI手数料 ${yen(banriFee)}</span>
  </div>`;
}

function summaryProfitCell(row) {
  const marginClass = isLowMargin(row) ? 'danger' : 'ok';
  const profitTone = Number(row.grossProfitJpy || 0) < 0 ? 'danger' : 'ok';
  const shippingRevenue = Number(row.customerShippingRevenueJpy || 0);
  return `<div class="summary-line money-summary-line">
    <span class="summary-subtle">商品売上 ${yen(row.salesJpy)}</span>
    ${shippingRevenue ? `<span class="summary-subtle">送料売上 ${yen(shippingRevenue)}</span>` : ''}
    <span class="summary-subtle">総売上 ${yen(revenueJpy(row))}</span>
    <strong class="${profitTone === 'danger' ? 'check-danger' : 'check-ok'}">粗利 ${yen(row.grossProfitJpy)}</strong>
    <span class="${marginClass === 'danger' ? 'check-danger' : 'check-ok'}">利益率 ${percent(row.grossMarginPct)}</span>
  </div>`;
}

function summaryActionCell(row) {
  const candidate = trackingCandidateForRow(row);
  const trackingStatus = candidate?.status || row.shopifyTrackingStatus || (row.logisticsNo ? '未確認' : '追跡なし');
  const statusTone = trackingStatus === '反映済み' ? 'ok' : (trackingStatus === '失敗' ? 'danger' : 'warn');
  return `<div class="summary-line summary-action-line">
    ${issueSummaryHtml(row)}
    <span class="pill ${statusTone}">Shopify ${escapeHtml(trackingStatus)}</span>
    ${row.manualAdjustedAt ? '<span class="pill manual">手入力あり</span>' : ''}
  </div>`;
}

function issueSummaryHtml(row) {
  const issues = row.issues || [];
  const notices = row.notices || [];
  if (isFinalCandidate(row)) return '<span class="pill ok">確定候補</span>';
  if (issues.length) {
    const first = issues[0];
    const tone = first.includes('30%') ? 'danger' : 'warn';
    const rest = issues.length > 1 ? ` +${issues.length - 1}` : '';
    return `<span class="pill ${tone}">${escapeHtml(first)}${rest}</span>`;
  }
  if (notices.length) {
    const rest = notices.length > 1 ? ` +${notices.length - 1}` : '';
    return `<span class="pill source">${escapeHtml(notices[0])}${rest}</span>`;
  }
  return '<span class="pill ok">問題なし</span>';
}

function readyTrackingCandidates() {
  return (billingState.tracking?.candidates || []).filter(candidate => candidate.ready);
}

function trackingCandidateRowIds() {
  const ids = new Set();
  readyTrackingCandidates().forEach(candidate => {
    (candidate.itemIds || []).forEach(id => ids.add(id));
  });
  return ids;
}

function prioritizeTrackingCandidates(items) {
  const candidateIds = trackingCandidateRowIds();
  if (!candidateIds.size) return items;
  return [...items].sort((a, b) => {
    const aCandidate = candidateIds.has(a.id) ? 1 : 0;
    const bCandidate = candidateIds.has(b.id) ? 1 : 0;
    return bCandidate - aCandidate;
  });
}

function editableInput(row, field, value, type = 'text', size = '') {
  const step = type === 'number' ? ' step="1" min="0"' : '';
  const manual = isManualField(row, field);
  const title = manual ? `手入力済み: ${escapeHtml(formatDateTime(row.manualAdjustedAt))}` : '';
  return `<span class="manual-field-wrap ${manual ? 'is-manual' : ''} ${size === 'wide' ? 'wide' : ''}">
    <input class="sheet-input billing-edit manual-input ${manual ? 'is-manual' : ''} ${size === 'wide' ? 'wide-manual-input' : ''}" data-billing-id="${escapeHtml(row.id)}" data-field="${escapeHtml(field)}" type="${type}"${step} value="${escapeHtml(value ?? '')}" ${manual ? `title="${title}"` : ''}>
    ${manual ? '<span class="manual-field-badge" title="手入力済み。次回アップロードでもこの値を優先します">手</span>' : ''}
  </span>`;
}

function moneyInput(row, field, value) {
  return `<div class="money-cell">${editableInput(row, field, Number(value || 0), 'number')}${cnyNote(value, row)}</div>`;
}

function moneyDisplay(value, row) {
  return `<div class="money-cell money-readonly"><span>${yen(value)}</span>${cnyNote(value, row)}</div>`;
}

function cnyNote(value, row) {
  const rate = Number(row.rate || 0);
  if (!rate) return '';
  const cny = Number(value || 0) / rate;
  return `<span class="cny-note" title="レート ${escapeHtml(rate)} 円/元で換算">(${escapeHtml(formatCny(cny))}元)</span>`;
}

function formatCny(value) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Number(value.toFixed(1));
  return rounded.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
}

function logisticsInput(row) {
  const input = editableInput(row, 'logisticsNo', row.logisticsNo || '', 'text');
  const no = String(row.logisticsNo || '').replace(/[^\d]/g, '');
  if (!no) return input;
  const url = `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${encodeURIComponent(no)}`;
  return `<div class="logistics-cell">${input}<a class="tracking-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="佐川急便で物流状況を確認">佐川</a></div>`;
}

function compactLine(label, body, source = '') {
  return `<div class="compact-line ${source ? `compact-${source}` : ''}"><span>${escapeHtml(label)}</span>${body}</div>`;
}

function compactNote(text) {
  return text ? `<div class="compact-note">${escapeHtml(text)}</div>` : '';
}

function orderCompactCell(row) {
  const shopifyOrder = row.shopifyOrderName && row.shopifyOrderName !== row.customerOrderNo
    ? compactNote(`Shopify ${row.shopifyOrderName}`)
    : '';
  const delivery = deliveryGroupBadge(row);
  const orderNo = row.displayCustomerOrderNo || row.customerOrderNo || row.shopifyOrderName || '';
  const recipient = row.displayRecipientName || row.recipientName || row.orderGroupRecipientName || '';
  return `<div class="compact-stack">
    ${compactLine('注文', editableInput(row, 'customerOrderNo', orderNo, 'text'), 'shopify')}
    ${compactLine('受取', editableInput(row, 'recipientName', recipient, 'text'), 'csv')}
    ${sameOrderBadge(row)}
    ${delivery}
    ${shopifyOrder}
  </div>`;
}

function banriCompactCell(row) {
  const coShipment = Number(row.coShipmentCount || 0) > 1
    ? `<span class="pill source">同梱 ${Number(row.coShipmentCount || 0)}件</span>`
    : '';
  return `<div class="compact-stack">
    ${compactLine('BANRI', editableInput(row, 'banriOrderNo', row.banriOrderNo || '', 'text'), 'csv')}
    ${compactLine('物流', logisticsInput(row), 'csv')}
    ${compactLine('請求', editableInput(row, 'invoiceNumber', row.invoiceNumber || '', 'text'), 'csv')}
    ${coShipment}
  </div>`;
}

function productCompactCell(row) {
  return `<div class="compact-stack">
    ${compactLine('管理', editableInput(row, 'productNo', row.productNo || '', 'text'), 'shopify')}
    ${compactLine('SKU', editableInput(row, 'sku', row.sku || '', 'text'), 'shopify')}
    ${compactLine('商品', editableInput(row, 'productName', row.productName || row.shopifyLineName || '', 'text', 'wide'), 'shopify')}
  </div>`;
}

function costCompactCell(row) {
  return `<div class="compact-stack">
    ${compactLine('数量', editableInput(row, 'quantity', Number(row.quantity || 0), 'number'), 'csv')}
    ${compactLine('商品', moneyInput(row, 'productCostJpy', row.productCostJpy), 'csv')}
    ${compactLine('国内', moneyInput(row, 'domesticShippingJpy', row.domesticShippingJpy), 'csv')}
    ${compactLine('BANRI手数料', moneyInput(row, 'workFeeJpy', row.workFeeJpy), 'csv')}
    ${compactLine('国際', moneyInput(row, 'allocatedInternationalShippingJpy', row.allocatedInternationalShippingJpy), 'csv')}
    ${Number(row.otherFeeJpy || 0) ? compactLine('その他', moneyInput(row, 'otherFeeJpy', row.otherFeeJpy), 'csv') : ''}
    <div class="compact-total"><span>原価</span>${moneyDisplay(row.totalCostJpy, row)}</div>
  </div>`;
}

function profitCompactCell(row) {
  const marginClass = isLowMargin(row) ? 'check-danger' : 'check-ok';
  const profitClass = Number(row.grossProfitJpy || 0) < 0 ? 'check-danger' : 'check-ok';
  return `<div class="compact-stack">
    ${compactLine('商品売上', moneyInput(row, 'salesJpy', row.salesJpy), 'shopify')}
    ${compactLine('送料売上', moneyInput(row, 'customerShippingRevenueJpy', row.customerShippingRevenueJpy), 'shopify')}
    <div class="compact-total"><span>総売上</span>${moneyDisplay(revenueJpy(row), row)}</div>
    <div class="compact-total ${profitClass}"><span>粗利</span>${moneyDisplay(row.grossProfitJpy, row)}</div>
    <div class="compact-total ${marginClass}"><span>利益率</span><strong>${percent(row.grossMarginPct)}</strong></div>
    <div class="compact-note">1個: 原価 ${yen(row.unitCostJpy || unitCost(row))} / 粗利 ${yen(row.unitGrossProfitJpy ?? unitGrossProfit(row))} / 利益率 ${percent(row.unitGrossMarginPct ?? unitMargin(row))}</div>
  </div>`;
}

function trackingCandidateForRow(row) {
  const list = billingState.tracking?.candidates || [];
  return list.find(candidate => (candidate.itemIds || []).includes(row.id));
}

function shopifyTrackingCell(row) {
  const candidate = trackingCandidateForRow(row);
  const status = candidate?.status || row.shopifyTrackingStatus || (row.logisticsNo ? '未確認' : '追跡なし');
  const syncedAt = candidate?.syncedAt || row.shopifyTrackingSyncedAt || '';
  const error = candidate?.lastError || row.shopifyTrackingLastError || '';
  const statusTone = status === '反映済み' ? 'ok' : (status === '失敗' ? 'danger' : 'warn');
  const trackingNo = candidate?.trackingNumber || row.shopifyTrackingNumber || row.logisticsNo || '';
  return `<div class="compact-stack">
    <span class="pill ${statusTone}">${escapeHtml(status)}</span>
    ${trackingNo ? compactLine('追跡', `<span class="mono">${escapeHtml(trackingNo)}</span>`, 'shopify') : ''}
    ${syncedAt ? compactNote(`反映 ${formatDateTime(syncedAt)}`) : ''}
    ${error ? `<div class="compact-note check-danger">${escapeHtml(error)}</div>` : ''}
  </div>`;
}

function issueMemoCell(row) {
  return `<div class="compact-stack">
    <div class="issue-list">${issueHtml(row)}</div>
    <input class="sheet-input billing-edit wide-manual-input" data-billing-id="${escapeHtml(row.id)}" data-field="note" value="${escapeHtml(row.note || '')}" placeholder="メモ">
  </div>`;
}

function rowClass(row) {
  const classes = [];
  const trackingCandidate = trackingCandidateForRow(row);
  if (trackingCandidate?.ready) classes.push('tracking-candidate-row');
  if (row.status === '要確認') classes.push('missing-row');
  if (row.status === '未請求') classes.push('unbilled-row');
  if (isLowMargin(row)) classes.push('low-margin-row');
  if (isFinalCandidate(row) || row.status === '確認済み') classes.push('final-candidate-row');
  if (hasCoDeliveryCandidate(row)) classes.push('co-delivery-row');
  if (Number(row.orderGroupSize || 0) > 1) classes.push('same-order-row');
  return classes.join(' ');
}

function renderLastUpload() {
  const latest = billingState.imports?.[0];
  if (!latest) {
    billingEls.lastUpload.textContent = '最終アップロード: まだありません';
    return;
  }
  const detailFile = latest.csvFileName ? `明細 ${latest.csvFileName}` : '明細';
  billingEls.lastUpload.textContent = `最終アップロード: ${formatDateTime(latest.importedAt)} / ${detailFile}`;
}

function setTrackingBusy(isBusy) {
  billingState.trackingBusy = Boolean(isBusy);
  if (billingEls.btnLoadTracking) billingEls.btnLoadTracking.disabled = billingState.trackingBusy;
  renderShopifyTrackingPanel();
}

function renderShopifyTrackingPanel() {
  if (!billingEls.trackingStatus) return;
  const tracking = billingState.tracking;
  if (!tracking) {
    billingEls.trackingStatus.textContent = '追跡番号の反映候補を確認できます。';
    if (billingEls.btnSyncTracking) billingEls.btnSyncTracking.disabled = true;
    renderTrackingReviewPanel();
    return;
  }
  const summary = tracking.summary || {};
  const connection = tracking.connection || {};
  const ready = Number(summary.ready || 0);
  const synced = Number(summary.synced || 0);
  const failed = Number(summary.failed || 0);
  const configNote = connection.configured
    ? `API接続OK: ${connection.domain}`
    : `API未設定: ${connection.missing?.join(' / ') || 'Shopify接続情報'} が必要です`;
  const companyLabel = billingEls.trackingCompany?.selectedOptions?.[0]?.textContent || connection.trackingCompany || '佐川急便';
  billingEls.trackingStatus.textContent = `${configNote} / 配送会社 ${companyLabel} / 未反映 ${ready}件 / 反映済み ${synced}件 / 失敗 ${failed}件`;
  if (billingEls.btnSyncTracking) {
    billingEls.btnSyncTracking.disabled = billingState.trackingBusy || !connection.configured || ready <= 0;
  }
  renderTrackingReviewPanel();
}

function renderTrackingReviewPanel() {
  if (!billingEls.trackingReviewPanel || !billingEls.trackingReviewList) return;
  const tracking = billingState.tracking;
  if (!tracking) {
    billingEls.trackingReviewPanel.classList.add('hidden');
    billingEls.trackingReviewList.innerHTML = '';
    return;
  }
  const targets = readyTrackingCandidates();
  billingEls.trackingReviewPanel.classList.remove('hidden');
  if (!targets.length) {
    billingEls.trackingReviewMessage.textContent = '今回Shopifyへ反映できる候補はありません。';
    billingEls.trackingReviewList.innerHTML = '<div class="tracking-review-empty">候補なし。追跡番号とShopify注文番号が揃うとここに表示されます。</div>';
    return;
  }
  const companyLabel = billingEls.trackingCompany?.selectedOptions?.[0]?.textContent || '佐川急便';
  const notifyLabel = billingEls.notifyCustomer?.checked ? '発送通知メールあり' : '発送通知メールなし';
  billingEls.trackingReviewMessage.textContent = `${targets.length}件を反映候補としてピックアップしています。配送会社: ${companyLabel} / ${notifyLabel}`;
  billingEls.trackingReviewList.innerHTML = targets.map(candidate => `
    <article class="tracking-review-card">
      <div class="tracking-review-main">
        <div class="tracking-review-order">${escapeHtml(candidate.orderName || '')}</div>
        <div class="tracking-review-recipient">${escapeHtml(candidate.recipientName || '')}</div>
      </div>
      <div class="tracking-review-detail">
        <span>追跡番号</span>
        <strong class="mono">${escapeHtml(candidate.trackingNumber || '')}</strong>
        ${candidate.trackingUrl ? `<a href="${escapeHtml(candidate.trackingUrl)}" target="_blank" rel="noopener noreferrer">佐川で確認</a>` : ''}
      </div>
      <div class="tracking-review-detail">
        <span>管理番号</span>
        <strong>${escapeHtml((candidate.productNos || []).join(' / ') || '-')}</strong>
      </div>
      <div class="tracking-review-detail">
        <span>SKU</span>
        <strong class="mono">${escapeHtml((candidate.skus || []).join(' / ') || '-')}</strong>
      </div>
      <div class="tracking-review-detail wide">
        <span>商品</span>
        <strong>${escapeHtml((candidate.productNames || []).join(' / ') || '-')}</strong>
      </div>
    </article>
  `).join('');
}

async function loadShopifyTrackingCandidates({ silent = false } = {}) {
  try {
    setTrackingBusy(true);
    const tracking = silent
      ? await api('/api/shopify-tracking')
      : await withLoading('Shopify反映候補を確認中です...', () => api('/api/shopify-tracking'));
    billingState.tracking = tracking;
    renderShopifyTrackingPanel();
    renderBilling();
    if (!silent) toast('Shopify追跡反映の候補を確認しました');
  } catch (error) {
    if (billingEls.trackingStatus) billingEls.trackingStatus.textContent = `確認エラー: ${error.message}`;
    if (!silent) toast(error.message);
  } finally {
    setTrackingBusy(false);
  }
}

async function syncShopifyTracking() {
  const tracking = billingState.tracking || await api('/api/shopify-tracking');
  billingState.tracking = tracking;
  const targets = (tracking.candidates || []).filter(candidate => candidate.ready);
  if (!targets.length) {
    renderShopifyTrackingPanel();
    return toast('Shopifyへ反映できる候補がありません');
  }
  const companyValue = billingEls.trackingCompany?.value || 'Sagawa Express';
  const companyLabel = billingEls.trackingCompany?.selectedOptions?.[0]?.textContent || '佐川急便';
  const notifyText = billingEls.notifyCustomer?.checked ? 'お客様への発送通知メールも送ります。' : 'お客様への発送通知メールは送りません。';
  if (!window.confirm(`${targets.length}件の追跡番号をShopifyへ反映します。\n配送会社: ${companyLabel}\n${notifyText}\nよろしいですか？`)) return;

  try {
    setTrackingBusy(true);
    if (billingEls.trackingStatus) billingEls.trackingStatus.textContent = 'Shopifyへ反映中です。画面を閉じずにお待ちください。';
    const result = await withLoading('Shopifyへ追跡番号を反映中です...', () => api('/api/shopify-tracking/sync', {
      method: 'POST',
      body: JSON.stringify({
        ids: targets.map(candidate => candidate.id),
        notifyCustomer: Boolean(billingEls.notifyCustomer?.checked),
        trackingCompany: companyValue,
      }),
    }));
    billingState.tracking = result.tracking;
    await loadBilling({ silent: true });
    renderShopifyTrackingPanel();
    toast(`Shopify反映: 成功 ${result.summary?.success || 0}件 / 失敗 ${result.summary?.failed || 0}件`);
  } catch (error) {
    if (billingEls.trackingStatus) billingEls.trackingStatus.textContent = `反映エラー: ${error.message}`;
    toast(error.message);
  } finally {
    setTrackingBusy(false);
  }
}

function setUploadBusy(isBusy) {
  billingState.uploadBusy = Boolean(isBusy);
  billingEls.btnPreview.disabled = billingState.uploadBusy;
  renderPreview();
}

function setUploadState(status, message) {
  if (!billingEls.uploadState) return;
  billingEls.uploadState.className = `upload-state ${status || 'idle'}`;
  billingEls.uploadState.textContent = message;
}

function selectedUploadLabel() {
  const csvName = billingEls.csvFile.files?.[0]?.name || '';
  if (!csvName) return '';
  return `料金明細CSV ${csvName}`;
}

function isManualField(row, field) {
  return Array.isArray(row.manualFields) && row.manualFields.includes(field);
}

function resetPendingUploadState() {
  billingState.pendingPayload = null;
  billingState.preview = null;
  renderPreview();
  const label = selectedUploadLabel();
  if (label) {
    setUploadState('selected', `選択済み: ${label}。まだアップロードしていません`);
  } else {
    setUploadState('idle', '未選択: 料金明細CSVを選択してください');
  }
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

function revenueJpy(row = {}) {
  return Math.round(Number(row.totalRevenueJpy ?? (Number(row.salesJpy || 0) + Number(row.customerShippingRevenueJpy || 0))) || 0);
}

function isLowMargin(row) {
  return revenueJpy(row) > 0 && Number(row.grossMarginPct || 0) <= 0.3;
}

function issueHtml(row) {
  const issues = row.issues || [];
  const notices = row.notices || [];
  const finalCandidateHtml = isFinalCandidate(row) ? '<span class="pill ok">確定候補</span>' : '';
  if (!issues.length && !notices.length) return '<span class="pill ok">差額なし</span>';
  const issueHtml = issues.map(issue => {
    const tone = issue.includes('30%') ? 'danger' : 'warn';
    return `<span class="pill ${tone}">${escapeHtml(issue)}</span>`;
  }).join(' ');
  const noticeHtml = notices.map(notice => `<span class="pill source">${escapeHtml(notice)}</span>`).join(' ');
  return [finalCandidateHtml, issueHtml, noticeHtml].filter(Boolean).join(' ');
}

function statusClass(status) {
  if (status === '確認済み') return 'ok';
  if (status === '要確認') return 'danger';
  if (status === '未請求') return 'warn';
  return '';
}

function renderPreview() {
  const preview = billingState.preview;
  billingEls.btnApply.disabled = billingState.uploadBusy || !preview || !billingState.pendingPayload;
  if (!preview) {
    billingEls.previewPanel.classList.add('hidden');
    billingEls.previewStats.innerHTML = '';
    billingEls.previewMessage.textContent = '料金明細CSVを選ぶと、保存前に自動確認します。';
    return;
  }
  billingEls.previewPanel.classList.remove('hidden');
  billingEls.previewMessage.textContent = `CSV ${preview.rowsRead || 0}行を確認しました。まだ台帳には保存していません。`;
  const summary = preview.summary || {};
  const stats = [
    ['明細', `${summary.itemCount || 0}件`],
    ['要対応', `${summary.actionCount || 0}件`, summary.actionCount ? 'warn' : ''],
    ['未請求', `${summary.unbilledCount || 0}件`, summary.unbilledCount ? 'warn' : ''],
    ['追跡なし', `${summary.missingTrackingCount || 0}件`, summary.missingTrackingCount ? 'warn' : ''],
    ['低粗利', `${summary.lowMarginCount || 0}件`, summary.lowMarginCount ? 'warn' : ''],
    ['確定候補', `${summary.finalCandidateCount || 0}件`],
  ];
  billingEls.previewStats.innerHTML = stats.map(([label, value, tone]) => `
    <div class="preview-stat ${tone || ''}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join('');
}

function summarizeBilling(items) {
  const count = status => items.filter(item => item.status === status).length;
  return {
    itemCount: items.length,
    pendingCount: count('未処理'),
    needsReviewCount: count('要確認'),
    unbilledCount: count('未請求'),
    confirmedCount: count('確認済み'),
    actionCount: items.filter(needsAction).length,
    missingTrackingCount: items.filter(item => !String(item.logisticsNo || '').trim()).length,
    lowMarginCount: items.filter(isLowMargin).length,
    itemNoOnlyCount: items.filter(item => {
      const itemNo = String(item.itemNo || '').trim();
      return itemNo && !/^\d+$/.test(itemNo) && !String(item.sku || '').trim() && !String(item.productNo || '').trim();
    }).length,
    coDeliveryCount: items.filter(hasCoDeliveryCandidate).length,
    coDeliveryGroupCount: new Set(items.filter(hasCoDeliveryCandidate).map(item => item.deliveryGroupId || item.deliveryGroupLabel).filter(Boolean)).size,
    finalCandidateCount: items.filter(isFinalCandidate).length,
    totalProductSalesJpy: items.reduce((sum, item) => sum + Number(item.salesJpy || 0), 0),
    totalCustomerShippingRevenueJpy: items.reduce((sum, item) => sum + Number(item.customerShippingRevenueJpy || 0), 0),
    totalSalesJpy: items.reduce((sum, item) => sum + revenueJpy(item), 0),
    totalGrossProfitJpy: items.reduce((sum, item) => sum + Number(item.grossProfitJpy || 0), 0),
  };
}

function hasCoDeliveryCandidate(item) {
  return Number(item.deliveryGroupSize || 0) > 1;
}

function deliveryGroupBadge(row) {
  if (!hasCoDeliveryCandidate(row)) return '';
  const orders = (row.deliveryGroupOrderNames || []).join(' / ');
  const title = `${row.deliveryGroupReason || '同一配送先'} ${orders}`.trim();
  return `<span class="pill co-delivery-pill" title="${escapeHtml(title)}">${escapeHtml(row.deliveryGroupLabel || `同梱候補 ${row.deliveryGroupSize}件`)}</span>`;
}

function sameOrderBadge(row) {
  const size = Number(row.orderGroupSize || 0);
  if (size <= 1) return '';
  const index = Number(row.orderGroupIndex || 0);
  const title = row.orderGroupProductNos?.length
    ? `同じShopify注文内の商品: ${row.orderGroupProductNos.join(' / ')}`
    : '同じShopify注文内の複数商品';
  const suffix = index ? ` ${index}/${size}` : '';
  return `<span class="pill same-order-pill" title="${escapeHtml(title)}">${escapeHtml(row.orderGroupLabel || `同一注文 ${size}点`)}${escapeHtml(suffix)}</span>`;
}

function needsAction(item) {
  return item.status !== '確認済み' && (
    item.status === '要確認'
    || item.status === '未請求'
    || (item.issues || []).length > 0
    || isLowMargin(item)
    || !String(item.logisticsNo || '').trim()
  );
}

function isFinalCandidate(item) {
  return item.status !== '確認済み'
    && !(item.issues || []).length
    && !isLowMargin(item)
    && String(item.banriOrderNo || '').trim()
    && String(item.logisticsNo || '').trim()
    && Number(item.productCostJpy || 0) > 0
    && (
      Number(item.allocatedInternationalShippingJpy || 0) > 0
      || Number(item.csvInternationalShippingJpy || 0) > 0
      || Number(item.invoiceInternationalGroupJpy || 0) > 0
    )
    && revenueJpy(item) > 0;
}

function yen(value) {
  return Number(value || 0).toLocaleString('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  });
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function unitQuantity(row) {
  return Math.max(1, Number(row.quantity || 1));
}

function unitCost(row) {
  return Math.round(Number(row.totalCostJpy || 0) / unitQuantity(row));
}

function unitSales(row) {
  return Math.round(revenueJpy(row) / unitQuantity(row));
}

function unitGrossProfit(row) {
  return unitSales(row) - unitCost(row);
}

function unitCostRate(row) {
  const sales = unitSales(row);
  return sales ? unitCost(row) / sales : 0;
}

function unitMargin(row) {
  const sales = unitSales(row);
  return sales ? unitGrossProfit(row) / sales : 0;
}

function scoreCsvText(text) {
  return ['BANRI注文番号', '物流番号', '商品代金', '国内送料', '作業代', 'BANRI手数料', '受取人']
    .reduce((score, key) => score + (text.includes(key) ? 2 : 0), 0)
    - ((text.match(/[�]/g) || []).length * 3);
}

async function readCsvFile(file) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  const sjis = new TextDecoder('shift_jis').decode(buffer);
  return scoreCsvText(sjis) > scoreCsvText(utf8) ? sjis : utf8;
}

async function buildPayload() {
  const csvFile = billingEls.csvFile.files?.[0];
  if (!csvFile) throw new Error('BTOC料金明細CSVを選択してください');
  const name = String(csvFile.name || '').toLowerCase();
  if (name && !name.endsWith('.csv')) throw new Error('アップロードできるのはCSVだけです');
  return {
    csv: await readCsvFile(csvFile),
    csvFileName: csvFile.name,
  };
}

async function previewBilling() {
  try {
    setUploadBusy(true);
    setUploadState('busy', 'アップロード中・CSVを読み取り中...');
    const { payload, preview } = await withLoading('料金明細CSVを読み取り中です...', async () => {
      const nextPayload = await buildPayload();
      const nextPreview = await api('/api/billing-reconciliation/preview', {
        method: 'POST',
        body: JSON.stringify(nextPayload),
      });
      return { payload: nextPayload, preview: nextPreview };
    });
    billingState.pendingPayload = payload;
    billingState.preview = preview;
    billingEls.importResult.textContent = `取込前確認済み: 明細 ${preview.summary?.itemCount || 0}件 / 要対応 ${preview.summary?.actionCount || 0}件 / 未請求 ${preview.summary?.unbilledCount || 0}件 / 低粗利 ${preview.summary?.lowMarginCount || 0}件`;
    setUploadState('ready', `取込前確認完了: 明細 ${preview.summary?.itemCount || 0}件。台帳にはまだ反映していません`);
    renderPreview();
    toast('請求データを自動確認しました');
  } catch (error) {
    setUploadState('error', `エラー: ${error.message}`);
    toast(error.message);
  } finally {
    setUploadBusy(false);
  }
}

async function applyBilling() {
  try {
    if (!billingState.pendingPayload || !billingState.preview) throw new Error('先に取込前確認をしてください');
    setUploadBusy(true);
    setUploadState('busy', '台帳に反映中・設定中...');
    const result = await withLoading('請求データを台帳に反映中です...', () => api('/api/billing-reconciliation/import', {
      method: 'POST',
      body: JSON.stringify(billingState.pendingPayload),
    }));
    billingState.pendingPayload = null;
    billingState.preview = null;
    billingEls.csvFile.value = '';
    billingEls.importResult.textContent = `台帳に反映済み: 追加 ${result.added}件 / 更新 ${result.updated}件`;
    setUploadState('done', `アップロード完了・設定完了: 追加 ${result.added}件 / 更新 ${result.updated}件`);
    renderPreview();
    await loadBilling({ silent: true });
    toast('請求突合台帳に反映しました');
  } catch (error) {
    setUploadState('error', `エラー: ${error.message}`);
    toast(error.message);
  } finally {
    setUploadBusy(false);
  }
}

async function saveBillingRow(id, updates) {
  const row = billingState.items.find(item => item.id === id);
  if (row) Object.assign(row, updates);
  const result = await withLoading('変更を保存中です...', () => api(`/api/billing-reconciliation/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }));
  if (row && result.item) Object.assign(row, result.item);
  renderBilling();
}

async function exportBillingCsv() {
  try {
    await withLoading('CSVを作成中です...', async () => {
      const res = await fetch('/api/billing-reconciliation-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'CSV出力に失敗しました');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `billing_reconciliation_all_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    toast('全データCSVを出力しました');
  } catch (error) {
    toast(error.message);
  }
}

function toast(message) {
  billingEls.toast.textContent = message;
  billingEls.toast.classList.add('visible');
  setTimeout(() => billingEls.toast.classList.remove('visible'), 2400);
}

function bindBillingEvents() {
  document.getElementById('btnReloadBilling').addEventListener('click', loadBilling);
  billingEls.btnPreview.addEventListener('click', previewBilling);
  billingEls.btnApply.addEventListener('click', applyBilling);
  billingEls.btnExportCsv.addEventListener('click', exportBillingCsv);
  billingEls.btnLoadTracking?.addEventListener('click', () => loadShopifyTrackingCandidates());
  billingEls.btnSyncTracking?.addEventListener('click', syncShopifyTracking);
  billingEls.notifyCustomer?.addEventListener('change', renderTrackingReviewPanel);
  billingEls.trackingCompany?.addEventListener('change', renderTrackingReviewPanel);
  billingEls.csvFile.addEventListener('change', () => {
    resetPendingUploadState();
  });
  billingEls.search.addEventListener('input', event => {
    billingState.query = event.target.value;
    loadBilling().catch(error => toast(error.message));
  });
  billingEls.monthFilter.addEventListener('change', event => {
    billingState.month = event.target.value;
    loadBilling().catch(error => toast(error.message));
  });
  billingEls.statusFilter.addEventListener('change', event => {
    billingState.status = event.target.value;
    billingState.bucket = '';
    loadBilling().catch(error => toast(error.message));
  });
  billingEls.statButtons.forEach(button => {
    button.addEventListener('click', () => {
      billingState.bucket = button.dataset.billingBucket || '';
      if (billingState.bucket) {
        billingState.status = '';
        billingEls.statusFilter.value = '';
      }
      loadBilling().catch(error => toast(error.message));
    });
  });
  billingEls.viewModeToggle?.addEventListener('click', () => {
    billingState.compactMode = !billingState.compactMode;
    renderBilling();
  });
  billingEls.rows.addEventListener('change', event => {
    const input = event.target.closest('.billing-edit');
    if (!input) return;
    saveBillingRow(input.dataset.billingId, { [input.dataset.field]: input.value })
      .then(() => toast('保存しました'))
      .catch(error => toast(error.message));
  });
}

bindBillingEvents();
renderPreview();
renderShopifyTrackingPanel();
loadBilling()
  .then(() => loadShopifyTrackingCandidates({ silent: true }))
  .catch(error => toast(error.message))
  .finally(clearLoading);
