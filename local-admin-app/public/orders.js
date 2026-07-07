const orderState = {
  orders: [],
  query: '',
  month: '',
  sort: 'orderDesc',
  tableSort: { key: '', direction: 'asc' },
  groupOnly: false,
  pendingCsv: '',
  pendingSource: '',
  preview: null,
  smallorderPreview: null,
  smallorderTarget: 'unordered',
  selectedOrderIds: new Set(),
  expandedBillingIds: new Set(),
  pendingBillingPayload: null,
  billingPreview: null,
  billingUploadBusy: false,
  trackingPreview: null,
  trackingBusy: false,
  fetchLimit: 100,
};

const orderEls = {
  file: document.getElementById('orderCsvFile'),
  btnApply: document.getElementById('btnApplyOrders'),
  btnFetchShopify: document.getElementById('btnFetchShopifyOrders'),
  btnRefreshDeliveryStatus: document.getElementById('btnRefreshDeliveryStatus'),
  btnClearFilters: document.getElementById('btnClearOrderFilters'),
  fetchLimit: document.getElementById('shopifyFetchLimit'),
  search: document.getElementById('orderSearch'),
  monthFilter: document.getElementById('orderMonthFilter'),
  sort: document.getElementById('orderSort'),
  rows: document.getElementById('orderRows'),
  visibleCount: document.getElementById('visibleCount'),
  importResult: document.getElementById('orderImportResult'),
  uploadState: document.getElementById('orderUploadState'),
  previewPanel: document.getElementById('orderPreviewPanel'),
  previewMessage: document.getElementById('orderPreviewMessage'),
  previewStats: document.getElementById('orderPreviewStats'),
  smallorderSummary: document.getElementById('orderSmallorderSummary'),
  smallorderResult: document.getElementById('orderSmallorderResult'),
  smallorderTarget: document.getElementById('orderSmallorderTarget'),
  selectAll: document.getElementById('orderSelectAll'),
  btnClearSelection: document.getElementById('btnClearOrderSelection'),
  btnPreviewSmallorder: document.getElementById('btnPreviewOrderSmallorder'),
  btnDownloadSmallorder: document.getElementById('btnDownloadOrderSmallorder'),
  billingFile: document.getElementById('orderBillingCsvFile'),
  btnPreviewBilling: document.getElementById('btnPreviewOrderBilling'),
  btnApplyBilling: document.getElementById('btnApplyOrderBilling'),
  billingUploadState: document.getElementById('orderBillingUploadState'),
  billingResult: document.getElementById('orderBillingResult'),
  btnLoadTracking: document.getElementById('btnLoadOrderShopifyTracking'),
  btnSyncTracking: document.getElementById('btnSyncOrderShopifyTracking'),
  notifyCustomer: document.getElementById('orderShopifyNotifyCustomer'),
  trackingStatus: document.getElementById('orderShopifyTrackingStatus'),
  trackingResult: document.getElementById('orderShopifyTrackingResult'),
  btnRules: document.getElementById('btnOrderRules'),
  rulesModal: document.getElementById('orderRulesModal'),
  statOrders: document.getElementById('statOrders'),
  statQuantity: document.getElementById('statQuantity'),
  statSales: document.getElementById('statSales'),
  statGrossSales: document.getElementById('statGrossSales'),
  statRefund: document.getElementById('statRefund'),
  statRefundRate: document.getElementById('statRefundRate'),
  statProfit: document.getElementById('statProfit'),
  statGrossProfit: document.getElementById('statGrossProfit'),
  statProfitRate: document.getElementById('statProfitRate'),
  statGrossProfitRate: document.getElementById('statGrossProfitRate'),
  statCoDelivery: document.getElementById('statCoDelivery'),
  statCoDeliveryHelp: document.getElementById('statCoDeliveryHelp'),
  statDeliveryGroups: document.getElementById('statDeliveryGroups'),
  toast: document.getElementById('toast'),
};

const PURCHASE_STATUS_OPTIONS = ['未発注', '発注済', '発送済', '失注', '返品', 'その他'];
const PURCHASE_STATUS_LABELS = {
  未発注: '① 未発注',
  発注済: '② 発注済',
  発送済: '③ 発送済',
  失注: '④ 失注',
  返品: '④ 返品',
  その他: '⑤ その他',
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


function confirmAction(title, lines = []) {
  const body = lines.filter(Boolean).join('\n');
  return window.confirm(body ? `${title}\n\n${body}` : title);
}

function setButtonState(button, disabled, disabledReason = '', enabledTitle = '') {
  if (!button) return;
  button.disabled = Boolean(disabled);
  button.title = disabled ? (disabledReason || '現在は実行できません') : (enabledTitle || '');
}

function previewAddedCount(preview = orderState.preview) {
  return Number(preview?.added || 0);
}

function activeFilterCount() {
  let count = 0;
  if (String(orderState.query || '').trim()) count += 1;
  if (String(orderState.month || '').trim()) count += 1;
  if (orderState.groupOnly) count += 1;
  return count;
}

function updateOrderFilterUi() {
  const count = activeFilterCount();
  if (!orderEls.btnClearFilters) return;
  orderEls.btnClearFilters.disabled = !count;
  orderEls.btnClearFilters.textContent = count ? `全解除 (${count})` : '検索クリア';
  orderEls.btnClearFilters.title = count
    ? '検索・月・同梱絞り込みをすべて解除します'
    : '現在、解除する検索条件はありません';
}

function setOrderSelectionFromCheckbox(checkbox) {
  const id = String(checkbox?.dataset?.orderId || '');
  if (!id) return;
  if (checkbox.checked) {
    orderState.selectedOrderIds.add(id);
  } else {
    orderState.selectedOrderIds.delete(id);
  }
  resetSmallorderPreviewForSelection();
  renderOrders();
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

async function loadOrders(options = {}) {
  const run = async () => {
    const { orders } = await api('/api/shopify-orders');
    orderState.orders = orders || [];
    renderOrders();
  };
  if (options.silent) return run();
  return withLoading(options.message || '注文台帳を読み込み中です...', run);
}

function renderOrders() {
  pruneSelectedOrderIds();
  const rows = filteredOrders();
  const summaryRows = accountingSummaryRows(rows);
  const summary = summarize(summaryRows);
  const orderLineCounts = orderLineCountMap(rows);
  orderEls.visibleCount.textContent = `${rows.length}行`;
  orderEls.statOrders.textContent = `${summary.orderCount}件`;
  orderEls.statQuantity.textContent = `${summary.totalQuantity}点`;
  const grossSalesValue = Number.isFinite(summary.grossSales) ? summary.grossSales : summary.totalSales;
  const grossProfitValue = Number.isFinite(summary.grossProfit) ? summary.grossProfit : summary.totalProfit;
  const grossProfitRateValue = Number.isFinite(summary.grossProfitRate) ? summary.grossProfitRate : summary.totalProfitRate;
  const refundRateValue = Number.isFinite(summary.refundRate) ? summary.refundRate : (grossSalesValue ? summary.totalRefund / grossSalesValue : 0);
  orderEls.statSales.textContent = yen(summary.totalSales);
  if (orderEls.statGrossSales) orderEls.statGrossSales.textContent = `返金なし ${yen(grossSalesValue)}`;
  if (orderEls.statRefund) orderEls.statRefund.textContent = yen(summary.totalRefund);
  if (orderEls.statRefundRate) orderEls.statRefundRate.textContent = `返金率 ${percent(refundRateValue)}`;
  orderEls.statProfit.textContent = yen(summary.totalProfit);
  if (orderEls.statGrossProfit) orderEls.statGrossProfit.textContent = `返金なし ${yen(grossProfitValue)}`;
  if (orderEls.statProfitRate) orderEls.statProfitRate.textContent = percent(summary.totalProfitRate);
  if (orderEls.statGrossProfitRate) orderEls.statGrossProfitRate.textContent = `返金なし ${percent(grossProfitRateValue)}`;
  orderEls.statCoDelivery.textContent = `${summary.deliveryGroupCount || 0}組`;
  if (orderEls.statCoDeliveryHelp) {
    orderEls.statCoDeliveryHelp.textContent = orderState.groupOnly ? '同梱だけ表示中・クリックで解除' : 'クリックで同梱だけ表示';
  }
  if (orderEls.statDeliveryGroups) {
    orderEls.statDeliveryGroups.classList.toggle('active', orderState.groupOnly);
    orderEls.statDeliveryGroups.title = orderState.groupOnly ? '同梱候補の絞り込みを解除します' : 'クリックすると同梱候補だけを表示します';
  }

  orderEls.rows.innerHTML = rows.map(row => {
    const rowId = String(row.id || '');
    const selected = rowId && orderState.selectedOrderIds.has(rowId);
    return `
    <tr class="${[orderRowClass(row, orderLineCounts), selected ? 'order-row-selected' : ''].filter(Boolean).join(' ')}">
      <td class="select-col select-cell"><input class="order-select-check order-row-check" type="checkbox" data-order-id="${escapeHtml(rowId)}" aria-label="${escapeHtml(row.orderName || '注文')}をBANRI出力対象に選択" ${selected ? 'checked' : ''}></td>
      <td class="nowrap strong">${escapeHtml(row.orderName || '')}</td>
      <td class="co-delivery-cell">${deliveryGroupBadge(row, orderLineCounts)}</td>
      <td class="nowrap">${escapeHtml(formatDate(row.createdAt))}</td>
      <td>${escapeHtml(row.billingName || row.customerName || '')}</td>
      <td>${escapeHtml(row.shippingName || row.customerName || '')}</td>
      <td class="nowrap">${escapeHtml(row.shippingZip || row.billingZip || '')}</td>
      <td class="address-cell">${escapeHtml(row.shippingAddress || row.billingAddress || '')}</td>
      <td class="nowrap">${escapeHtml(row.shippingPhone || row.billingPhone || '')}</td>
      <td class="nowrap strong">${productNoLink(row.productNo)}</td>
      <td class="mono">${escapeHtml(row.sku || '')}</td>
      <td class="number-cell">${Number(row.quantity || 0)}</td>
      <td class="number-cell">${yen(row.lineTotal || row.total || 0)}</td>
      <td class="number-cell profit-cell">${billingProfitCell(row)}</td>
      <td>${financialStatusBadge(row)}</td>
      <td class="number-cell">${paidAgeCell(row)}</td>
      <td>${purchaseStatusSelect(row)}</td>
      <td class="tracking-number-col">${trackingNumberBadge(row)}</td>
      <td class="tracking-summary-col">${trackingSummaryBadge(row)}</td>
      <td><input class="sheet-input order-edit" data-order-id="${escapeHtml(row.id)}" data-field="note" value="${escapeHtml(row.note || '')}" placeholder="メモ"></td>
    </tr>
    ${rowId && orderState.expandedBillingIds.has(rowId) ? billingDetailRow(row) : ''}
  `;
  }).join('') || '<tr><td colspan="20" class="empty-cell">注文CSVを読み込むとここに表示されます</td></tr>';
  updateTableSortHeaders();
  updateOrderSelectionUi(rows);
  updateOrderFilterUi();
}

function selectedOrderIdsArray() {
  return [...orderState.selectedOrderIds].filter(Boolean);
}

function pruneSelectedOrderIds() {
  const validIds = new Set(orderState.orders.map(row => String(row.id || '')).filter(Boolean));
  [...orderState.selectedOrderIds].forEach(id => {
    if (!validIds.has(id)) orderState.selectedOrderIds.delete(id);
  });
}

function resetSmallorderPreviewForSelection() {
  orderState.smallorderPreview = null;
  renderSmallorderPreview();
}

function updateOrderSelectionUi(rows = filteredOrders()) {
  const visibleIds = rows.map(row => String(row.id || '')).filter(Boolean);
  const selectedVisibleCount = visibleIds.filter(id => orderState.selectedOrderIds.has(id)).length;
  const selectedTotal = orderState.selectedOrderIds.size;

  if (orderEls.selectAll) {
    orderEls.selectAll.checked = Boolean(visibleIds.length && selectedVisibleCount === visibleIds.length);
    orderEls.selectAll.indeterminate = Boolean(selectedVisibleCount && selectedVisibleCount < visibleIds.length);
    orderEls.selectAll.disabled = !visibleIds.length;
  }
  if (orderEls.btnClearSelection) {
    setButtonState(
      orderEls.btnClearSelection,
      !selectedTotal,
      '選択中の注文がありません',
      `${selectedTotal}件の選択を解除します`
    );
    orderEls.btnClearSelection.textContent = selectedTotal ? `選択解除 (${selectedTotal})` : '選択解除';
  }
  if (!orderState.smallorderPreview && orderEls.smallorderSummary) {
    orderEls.smallorderSummary.textContent = selectedTotal ? `選択 ${selectedTotal}件` : '未確認';
  }
}

function shopifyProductUrlFromProductNo(productNo) {
  const handle = String(productNo || '').trim().toLowerCase();
  return handle ? `https://socora-online.com/products/${encodeURIComponent(handle)}` : '';
}

function productNoLink(productNo) {
  const text = String(productNo || '').trim();
  if (!text) return '';
  const url = shopifyProductUrlFromProductNo(text);
  return `<a class="product-no-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Shopify販売ページを開く">${escapeHtml(text)}</a>`;
}

function hasTrackingNumber(row = {}) {
  if (row.trackingNumberDisabled) return false;
  return Boolean(String(row.shopifyTrackingNumber || row.trackingNumber || row.logisticsNo || '').trim());
}

function trackingNumberForRow(row = {}) {
  if (row.trackingNumberDisabled) return '';
  return String(row.shopifyTrackingNumber || row.trackingNumber || row.logisticsNo || '').replace(/[^\d]/g, '');
}

function sagawaTrackingUrl(trackingNumber) {
  const no = String(trackingNumber || '').replace(/[^\d]/g, '');
  return no ? `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${encodeURIComponent(no)}` : '';
}

function deliveryStatusForRow(row = {}) {
  return String(row.sagawaDeliveryStatus || row.deliveryStatus || row.trackingDeliveryStatus || '').trim() || '未確認';
}

function isDeliveredOrder(row = {}) {
  return deliveryStatusForRow(row) === '配達済み';
}

function displayPurchaseStatus(row = {}) {
  const raw = String(row.purchaseStatus || '').trim();
  if (PURCHASE_STATUS_OPTIONS.includes(raw)) return raw;
  if (raw.includes('手動発送')) return '発送済';
  if (raw.includes('返品') || raw.includes('返送')) return '返品';
  if (raw.includes('其他') || raw.includes('その他')) return 'その他';
  return '未発注';
}

function isCompletedOrder(row = {}) {
  return displayPurchaseStatus(row) === '発送済';
}

function isOtherPurchaseStatus(row = {}) {
  return displayPurchaseStatus(row) === 'その他';
}

function accountingSummaryRows(rows = []) {
  const excludedOrderNames = new Set(
    rows
      .filter(row => isOtherPurchaseStatus(row))
      .map(row => String(row.orderName || '').trim())
      .filter(Boolean)
  );
  return rows.filter(row => {
    if (isOtherPurchaseStatus(row)) return false;
    const orderName = String(row.orderName || '').trim();
    return !(orderName && excludedOrderNames.has(orderName));
  });
}

function isPaidAgeClosed(row = {}) {
  return isCompletedOrder(row) || ['失注', '返品'].includes(displayPurchaseStatus(row));
}

function hasCoShipment(row = {}, orderLineCounts = new Map()) {
  return Number(row.deliveryGroupSize || 0) > 1
    || Number(row.quantity || 0) > 1
    || Number(orderLineCounts.get(row.orderName) || 0) > 1;
}

function orderRowClass(row = {}, orderLineCounts = new Map()) {
  const status = displayPurchaseStatus(row);
  return [
    hasCoShipment(row, orderLineCounts) ? 'co-delivery-row' : '',
    ['失注', '返品'].includes(status) ? 'lost-order-row' : '',
    status === 'その他' ? 'other-order-row' : '',
    isCompletedOrder(row) ? 'completed-order-row' : '',
  ].filter(Boolean).join(' ');
}

function purchaseStatusClass(value) {
  const status = String(value || '');
  if (status.includes('発送済')) return 'purchase-shipped';
  if (status.includes('発注済') || status.includes('出力済')) return 'purchase-ordered';
  if (status.includes('失注') || status.includes('返品') || status.includes('返送')) return 'purchase-lost';
  if (status.includes('その他') || status.includes('其他')) return 'purchase-other';
  return 'purchase-pending';
}

function purchaseStatusSelect(row) {
  const status = displayPurchaseStatus(row);
  return `<select class="sheet-select order-edit purchase-status-select ${purchaseStatusClass(status)}" data-order-id="${escapeHtml(row.id)}" data-field="purchaseStatus" data-current="${escapeHtml(status)}" title="注文ステータスを変更します。失注・返品は返金集計にも反映されます">
    ${PURCHASE_STATUS_OPTIONS.map(option => `<option class="${purchaseStatusClass(option)}" value="${escapeHtml(option)}" ${status === option ? 'selected' : ''}>${escapeHtml(PURCHASE_STATUS_LABELS[option] || option)}</option>`).join('')}
  </select>`;
}

function trackingDisabledLink(row, disabled) {
  const id = encodeURIComponent(String(row.id || ''));
  const next = encodeURIComponent('/orders.html?trackingLock=1');
  const href = `/api/shopify-orders/${id}/tracking-number-disabled?disabled=${disabled ? '1' : '0'}&next=${next}`;
  const label = disabled ? '除外' : '解除';
  const title = disabled ? 'この注文行では追跡番号を使わないよう固定します' : 'この注文行への追跡番号除外を解除します';
  return `<a class="tracking-ignore-button" href="${escapeHtml(href)}" data-order-id="${escapeHtml(row.id)}" data-tracking-disabled="${disabled ? '1' : '0'}" title="${escapeHtml(title)}">${escapeHtml(label)}</a>`;
}

function trackingNumberBadge(row) {
  if (row.trackingNumberDisabled) {
    return `<span class="tracking-disabled-wrap"><span class="tracking-empty tracking-disabled-label">なし固定</span>${trackingDisabledLink(row, false)}</span>`;
  }
  const number = trackingNumberForRow(row);
  if (!number) return '<span class="tracking-empty">なし</span>';
  const url = sagawaTrackingUrl(number);
  return `<span class="tracking-number-wrap"><a class="tracking-number-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="佐川急便で配送状況を確認">${escapeHtml(number)}</a>${trackingDisabledLink(row, true)}</span>`;
}

function trackingSummaryBadge(row) {
  const number = trackingNumberForRow(row);
  if (!number) return '';
  const status = deliveryStatusForRow(row);
  return `<span class="tracking-summary-cell"><span class="delivery-status-pill ${deliveryStatusClass(status)}">${escapeHtml(status)}</span>${trackingAgeCell(row)}</span>`;
}

function deliveryStatusClass(status) {
  const text = String(status || '');
  if (text.includes('集荷')) return 'delivery-pickup';
  if (text.includes('輸送') || text.includes('配達中')) return 'delivery-progress';
  if (text.includes('配達済')) return 'delivery-done';
  if (text.includes('持戻') || text.includes('持ち戻') || text.includes('保管') || text.includes('不在')) return 'delivery-alert';
  return 'delivery-unknown';
}

function trackingStartedAt(row = {}) {
  return row.shopifyTrackingSyncedAt || row.trackingAddedAt || row.trackingStatusCheckedAt || '';
}

function trackingAgeDays(row = {}) {
  if (!trackingNumberForRow(row) || isDeliveredOrder(row)) return '';
  const startAt = trackingStartedAt(row);
  if (!startAt) return '';
  const startDate = new Date(startAt);
  if (Number.isNaN(startDate.getTime())) return '';
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const diff = Math.floor((startToday - startDay) / 86400000) + 1;
  return diff > 0 ? diff : 1;
}

function trackingAgeClass(days) {
  if (!days) return '';
  if (days >= 9) return 'tracking-age-danger';
  if (days >= 6) return 'tracking-age-warn';
  return 'tracking-age-ok';
}

function trackingAgeCell(row = {}) {
  if (isDeliveredOrder(row)) {
    return '<span class="tracking-age tracking-age-done" title="配達済みのためカウント停止">済</span>';
  }
  const days = trackingAgeDays(row);
  if (!days) return '';
  const title = trackingStartedAt(row) ? `追跡反映日: ${formatDate(trackingStartedAt(row))}` : '';
  return `<span class="tracking-age ${trackingAgeClass(days)}" title="${escapeHtml(title)}">${days}</span>`;
}

function isPaidOrder(row) {
  const raw = String(row.financialStatus || '').toLowerCase().trim();
  const label = String(row.financialStatusJa || '').trim();
  return raw === 'paid' || raw === 'partially_paid' || label === '支払い済み' || label === '一部入金';
}

function financialStatusClass(row = {}) {
  const raw = String(row.financialStatus || '').toLowerCase().trim();
  const label = String(row.financialStatusJa || '').trim();
  if (raw.includes('refund') || raw.includes('void') || raw.includes('expired') || /返金|無効|期限切れ/.test(label)) {
    return 'financial-danger';
  }
  if (raw.includes('pending') || raw.includes('authorized') || raw.includes('unpaid') || /未入金|入金待ち|保留|承認/.test(label)) {
    return 'financial-warn';
  }
  if (isPaidOrder(row)) return 'financial-paid';
  return 'financial-neutral';
}

function financialStatusBadge(row = {}) {
  const label = row.financialStatusJa || row.financialStatus || '';
  return `<span class="pill financial-pill ${financialStatusClass(row)}">${escapeHtml(label)}</span>`;
}

function paidAgeDays(row) {
  if (isPaidAgeClosed(row)) return '';
  const paidAt = row.paidAt || (isPaidOrder(row) ? row.createdAt : '');
  if (!paidAt) return '';
  const paidDate = new Date(paidAt);
  if (Number.isNaN(paidDate.getTime())) return '';
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startPaid = new Date(paidDate.getFullYear(), paidDate.getMonth(), paidDate.getDate());
  const diff = Math.floor((startToday - startPaid) / 86400000) + 1;
  return diff > 0 ? diff : 1;
}

function paidAgeClass(days) {
  if (!days) return '';
  if (days >= 15) return 'paid-age-danger';
  if (days >= 8) return 'paid-age-warn';
  return 'paid-age-ok';
}

function paidAgeCell(row) {
  if (isPaidAgeClosed(row)) {
    const status = displayPurchaseStatus(row);
    const title = ['失注', '返品'].includes(status)
      ? `${status}のためカウント停止`
      : '発送完了扱いのためカウント停止';
    return `<span class="paid-age paid-age-done" title="${escapeHtml(title)}">済</span>`;
  }
  const days = paidAgeDays(row);
  if (!days) return '';
  const paidAt = row.paidAt || row.createdAt || '';
  const title = paidAt ? `入金日: ${formatDate(paidAt)}` : '';
  return `<span class="paid-age ${paidAgeClass(days)}" title="${escapeHtml(title)}">${days}</span>`;
}

function renderPreview() {
  const preview = orderState.preview;
  const hasPendingImport = orderState.pendingSource === 'csv'
    ? Boolean(orderState.pendingCsv)
    : orderState.pendingSource === 'shopify';
  const addedCount = previewAddedCount(preview);
  const canApply = Boolean(preview && hasPendingImport && addedCount > 0);
  if (orderEls.btnApply) {
    orderEls.btnApply.disabled = !canApply;
    orderEls.btnApply.textContent = canApply ? '台帳に反映' : (preview ? '新規0件のため反映不要' : '反映対象なし');
    orderEls.btnApply.title = canApply
      ? `${addedCount}行を注文台帳へ保存します`
      : (preview ? '新規行が0件のため、台帳に反映する必要はありません' : 'CSVまたはShopify取得で新規注文を確認すると押せます');
  }
  if (!preview) {
    orderEls.previewPanel.classList.add('hidden');
    orderEls.previewStats.innerHTML = '';
    orderEls.previewMessage.textContent = 'CSVを選択、またはShopifyから取得すると、保存前に件数を自動確認します。';
    return;
  }
  orderEls.previewPanel.classList.remove('hidden');
  if (preview.source === 'shopify') {
    orderEls.previewMessage.textContent = `Shopify APIから${Number(preview.fetchedOrders || 0)}件取得しました。まだ台帳には保存していません。重複明細は追加しません。`;
  } else {
    orderEls.previewMessage.textContent = 'まだ台帳には保存していません。重複明細は追加せず、新規分だけ反映します。';
  }
  const stats = [
    ...(preview.source === 'shopify' ? [['取得元', 'Shopify API'], ['取得注文', `${Number(preview.fetchedOrders || 0)}件`]] : [['取得元', 'CSV']]),
    ['注文', `${Number(preview.summary?.orderCount || 0)}件`],
    ['明細', `${Number(preview.summary?.rowCount || 0)}行`],
    ['新規', `${Number(preview.added || 0)}行`],
    ['重複', `${Number(preview.duplicateRows || 0)}行`, Number(preview.duplicateRows || 0) ? 'warn' : ''],
    ['SKUなし', `${Number(preview.noSku || 0)}行`, 'warn'],
    ['管理番号なし', `${Number(preview.noProductNo || 0)}行`, 'warn'],
    ['同梱候補', `${Number(preview.summary?.deliveryGroupCount || 0)}組`],
    ['読取不可', `${Number(preview.skipped || 0)}行`, 'warn'],
    ...(preview.hasNextPage ? [['続きあり', 'あり', 'warn']] : []),
  ];
  orderEls.previewStats.innerHTML = stats.map(([label, value, tone]) => `
    <div class="preview-stat ${tone || ''}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join('');
}

function renderSmallorderPreview() {
  const preview = orderState.smallorderPreview;
  const disabled = !preview
    || !Number(preview.matchedCount || 0)
    || Number(preview.missingPriceCount || 0) > 0
    || Number(preview.missingSourceColorCount || 0) > 0;
  if (orderEls.btnDownloadSmallorder) {
    let reason = '発注対象確認が完了すると押せます';
    if (preview) {
      if (!Number(preview.matchedCount || 0)) reason = 'BANRI Excelに出力できる注文がありません';
      else if (Number(preview.missingPriceCount || 0) > 0) reason = '仕入価格未設定の注文があります';
      else if (Number(preview.missingSourceColorCount || 0) > 0) reason = '中国発注用の元カラー未確認があります';
    }
    setButtonState(orderEls.btnDownloadSmallorder, disabled, reason, '確認済みの対象をBANRI発注Excelで出力します');
  }
  if (!preview) {
    if (orderEls.smallorderSummary) {
      const selectedCount = orderState.selectedOrderIds.size;
      orderEls.smallorderSummary.textContent = selectedCount ? `選択 ${selectedCount}件` : '未確認';
    }
    if (orderEls.smallorderResult) orderEls.smallorderResult.innerHTML = '';
    return;
  }
  if (orderEls.smallorderSummary) {
    orderEls.smallorderSummary.textContent = `${Number(preview.matchedCount || 0)}件 / ${Number(preview.totalQuantity || 0)}点`;
  }
  const unmatched = preview.unmatched || [];
  const missingPrice = preview.missingPriceItems || [];
  const missingSourceColor = preview.missingSourceColorItems || [];
  const unmatchedHtml = unmatched.length
    ? `<div class="smallorder-alert">商品マスターと未一致 ${unmatched.length}件<br>${unmatched.slice(0, 5).map(item => escapeHtml(item.sku || item.title || item.orderName)).join('<br>')}</div>`
    : '<div class="smallorder-ok">全SKU一致</div>';
  const missingPriceHtml = missingPrice.length
    ? `<div class="smallorder-alert">仕入価格未設定 ${missingPrice.length}件<br>${missingPrice.slice(0, 6).map(item => escapeHtml([item.orderName, item.productNo, item.color, item.size].filter(Boolean).join(' / '))).join('<br>')}</div>`
    : '';
  const missingSourceColorHtml = missingSourceColor.length
    ? `<div class="smallorder-alert">元カラー未確認 ${missingSourceColor.length}件<br>${missingSourceColor.slice(0, 6).map(item => escapeHtml([item.orderName, item.productNo, item.color || '元カラー未設定', item.size].filter(Boolean).join(' / '))).join('<br>')}</div>`
    : '';
  if (orderEls.smallorderResult) {
    orderEls.smallorderResult.innerHTML = `
      <div class="smallorder-line">${escapeHtml(smallorderTargetLabel(preview.target || orderState.smallorderTarget))}: Excel対象 ${Number(preview.matchedCount || 0)}件 / 数量 ${Number(preview.totalQuantity || 0)} / 合計 ${Number(preview.totalCny || 0)} CNY</div>
      ${unmatchedHtml}
      ${missingPriceHtml}
      ${missingSourceColorHtml}
    `;
  }
}

function smallorderTargetLabel(target = orderState.smallorderTarget) {
  if (target === 'selected') return '選択した注文';
  if (target === 'ordered') return '発注済みの再出力';
  if (target === 'active') return '未発注 + 発注済み';
  return '未発注';
}

function smallorderPayload() {
  const selectedOrderIds = selectedOrderIdsArray();
  if (selectedOrderIds.length) {
    return { fromLedger: true, target: 'selected', selectedOrderIds };
  }
  const target = orderEls.smallorderTarget?.value || orderState.smallorderTarget || 'unordered';
  orderState.smallorderTarget = target;
  return { fromLedger: true, target };
}

function setOrderUploadState(status, message) {
  if (!orderEls.uploadState) return;
  orderEls.uploadState.className = `upload-state ${status || 'idle'}`;
  orderEls.uploadState.textContent = message;
}

function resetOrderUploadState() {
  const fileName = orderEls.file.files?.[0]?.name || '';
  if (fileName) {
    setOrderUploadState('selected', `選択済み: ${fileName}`);
  } else {
    setOrderUploadState('idle', 'CSV未選択');
  }
}

function filteredOrders() {
  const query = orderState.query.trim().toLowerCase();
  const orderLineCounts = orderLineCountMap(orderState.orders);
  return orderState.orders.filter(row => {
    const haystack = [
      row.orderName,
      row.customerName,
      row.billingName,
      row.shippingName,
      row.shippingZip,
      row.shippingAddress,
      row.shippingPhone,
      row.billingZip,
      row.billingAddress,
      row.billingPhone,
      row.productNo,
      row.sku,
      row.lineName,
      row.note,
      displayPurchaseStatus(row),
      row.deliveryGroupLabel,
      ...(row.deliveryGroupOrderNames || []),
    ].join(' ').toLowerCase();
    const queryOk = !query || haystack.includes(query);
    const monthOk = !orderState.month || monthKey(row.createdAt) === orderState.month;
    const groupOk = !orderState.groupOnly || hasCoShipment(row, orderLineCounts);
    return queryOk && monthOk && groupOk;
  }).sort((a, b) => compareOrders(a, b, orderLineCounts));
}

function orderLineCountMap(rows = []) {
  const counts = new Map();
  rows.forEach(row => {
    if (!row.orderName) return;
    counts.set(row.orderName, Number(counts.get(row.orderName) || 0) + 1);
  });
  return counts;
}

function compareOrders(a, b, orderLineCounts = new Map()) {
  if (orderState.sort === 'table' && orderState.tableSort?.key) {
    const key = orderState.tableSort.key;
    const direction = orderState.tableSort.direction === 'desc' ? 'desc' : 'asc';
    const result = compareTableSortValues(
      tableSortValue(a, key, orderLineCounts),
      tableSortValue(b, key, orderLineCounts),
      direction,
    );
    if (result) return result;
    return compareOrderNumberDesc(a, b);
  }
  if (orderState.sort === 'orderAsc') return Number(a.orderNo || 0) - Number(b.orderNo || 0);
  if (orderState.sort === 'dateDesc') return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  if (orderState.sort === 'dateAsc') return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  if (orderState.sort === 'productNoAsc') {
    return String(a.productNo || '').localeCompare(String(b.productNo || ''), 'ja', { numeric: true, sensitivity: 'base' })
      || compareOrderNumberDesc(a, b);
  }
  return compareOrderNumberDesc(a, b);
}

function compareOrderNumberDesc(a, b) {
  return Number(b.orderNo || 0) - Number(a.orderNo || 0);
}

function tableSortValue(row = {}, key, orderLineCounts = new Map()) {
  if (key === 'order') return Number(row.orderNo || String(row.orderName || '').replace(/\D/g, '') || 0);
  if (key === 'deliveryGroup') return hasCoShipment(row, orderLineCounts) ? 1 : 0;
  if (key === 'date') return dateSortNumber(row.createdAt);
  if (key === 'billingName') return row.billingName || row.customerName || '';
  if (key === 'shippingName') return row.shippingName || row.customerName || '';
  if (key === 'zip') return row.shippingZip || row.billingZip || '';
  if (key === 'address') return row.shippingAddress || row.billingAddress || '';
  if (key === 'phone') return row.shippingPhone || row.billingPhone || '';
  if (key === 'productNo') return row.productNo || '';
  if (key === 'sku') return row.sku || '';
  if (key === 'quantity') return Number(row.quantity || 0);
  if (key === 'sales') return Number(row.lineTotal || row.total || 0);
  if (key === 'profit') return hasGrossProfitValue(row) ? grossProfitValue(row) : '';
  if (key === 'payment') return row.financialStatusJa || row.financialStatus || '';
  if (key === 'paidAge') {
    if (isPaidAgeClosed(row)) return 999999;
    const days = paidAgeDays(row);
    return days ? Number(days) : '';
  }
  if (key === 'status') return displayPurchaseStatus(row);
  if (key === 'tracking') return trackingNumberForRow(row) || '';
  if (key === 'trackingAge') {
    if (isDeliveredOrder(row)) return 999999;
    const days = trackingAgeDays(row);
    return days ? Number(days) : '';
  }
  if (key === 'note') return row.note || '';
  return '';
}

function dateSortNumber(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.getTime();
}

function compareTableSortValues(a, b, direction = 'asc') {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const base = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'ja', { numeric: true, sensitivity: 'base' });
  return direction === 'desc' ? -base : base;
}

function updateTableSortHeaders() {
  const active = orderState.sort === 'table' ? orderState.tableSort : { key: '', direction: 'asc' };
  document.querySelectorAll('[data-order-sort]').forEach(button => {
    const isActive = button.dataset.orderSort === active.key;
    const direction = active.direction === 'desc' ? 'desc' : 'asc';
    button.classList.toggle('active', isActive);
    button.classList.toggle('asc', isActive && direction === 'asc');
    button.classList.toggle('desc', isActive && direction === 'desc');
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.setAttribute('aria-label', `${button.textContent.trim()}で${isActive && direction === 'asc' ? '降順' : '昇順'}に並び替え`);
    const th = button.closest('th');
    if (th) th.setAttribute('aria-sort', isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

function summarize(rows) {
  const orderTotals = new Map();
  const orderRefunds = new Map();
  const productNos = new Set();
  const orderLineCounts = orderLineCountMap(rows);
  let totalQuantity = 0;
  rows.forEach(row => {
    if (row.orderName && !orderTotals.has(row.orderName)) orderTotals.set(row.orderName, Number(row.total || 0));
    if (row.orderName) {
      const refundAmount = refundAmountForOrder(row);
      const currentRefund = orderRefunds.get(row.orderName) || 0;
      if (!orderRefunds.has(row.orderName) || refundAmount > currentRefund) orderRefunds.set(row.orderName, refundAmount);
    }
    if (row.productNo) productNos.add(row.productNo);
    totalQuantity += Number(row.quantity || 0);
  });
  const deliveryGroups = new Set();
  rows.forEach(row => {
    if (!hasCoShipment(row, orderLineCounts)) return;
    deliveryGroups.add(row.deliveryGroupId || row.deliveryGroupLabel || `same-order-${row.orderName || row.id || deliveryGroups.size}`);
  });
  const grossSales = [...orderTotals.values()].reduce((sum, value) => sum + value, 0);
  const totalRefund = [...orderRefunds.values()].reduce((sum, value) => sum + value, 0);
  const grossProfit = rows.reduce((sum, row) => sum + (hasGrossProfitValue(row) ? grossProfitValue(row) : 0), 0);
  const totalSales = Math.max(0, grossSales - totalRefund);
  const totalProfit = grossProfit - totalRefund;
  return {
    orderCount: orderTotals.size,
    rowCount: rows.length,
    totalQuantity,
    grossSales,
    totalSales,
    totalRefund,
    refundRate: grossSales ? totalRefund / grossSales : 0,
    grossProfit,
    totalProfit,
    grossProfitRate: grossSales ? grossProfit / grossSales : 0,
    totalProfitRate: totalSales ? totalProfit / totalSales : 0,
    productCount: productNos.size,
    deliveryGroupCount: deliveryGroups.size,
    deliveryGroupRowCount: rows.filter(row => hasCoShipment(row, orderLineCounts)).length,
  };
}

function refundAmountForOrder(row = {}) {
  if (['失注', '返品'].includes(displayPurchaseStatus(row))) {
    return lostOrderAmount(row);
  }
  const explicit = Number(row.orderRefundAmountJpy ?? row.refundAmountJpy ?? row.totalRefundedJpy ?? row.refundedAmountJpy ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const originalTotal = Number(row.orderOriginalTotalJpy || row.originalTotalJpy || 0);
  const currentTotal = Number(row.orderCurrentTotalJpy || row.total || 0);
  if (Number.isFinite(originalTotal) && Number.isFinite(currentTotal) && originalTotal > currentTotal) {
    return Math.round(originalTotal - currentTotal);
  }
  const raw = String(row.financialStatus || '').toLowerCase().trim();
  const label = String(row.financialStatusJa || '').trim();
  if (raw === 'refunded' || label === '返金済み') {
    return Math.round(Number(row.lineTotal || row.total || row.billingRevenueJpy || 0));
  }
  return 0;
}

function lostOrderAmount(row = {}) {
  const candidates = [
    row.orderOriginalTotalJpy,
    row.originalTotalJpy,
    row.orderCurrentTotalJpy,
    row.total,
    row.lineTotal,
    row.billingRevenueJpy,
  ]
    .map(value => Number(value || 0))
    .filter(value => Number.isFinite(value) && value > 0);
  return Math.round(Math.max(0, ...candidates));
}

function deliveryGroupBadge(row, orderLineCounts = new Map()) {
  if (!hasCoShipment(row, orderLineCounts)) return '<span class="pill muted-pill">なし</span>';
  const orders = (row.deliveryGroupOrderNames || []).join(' / ');
  const title = `${row.deliveryGroupReason || '同一注文の商品'} ${orders || row.orderName || ''}`.trim();
  return `<span class="pill co-delivery-pill" title="${escapeHtml(title)}">あり</span>`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function monthKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
  const match = String(value).match(/^(\d{4})[-/](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}` : '';
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

function hasManualBilling(row = {}) {
  if (row.billingManual) return true;
  return ['manualProductCostJpy', 'manualDomesticShippingJpy', 'manualWorkFeeJpy', 'manualInternationalShippingJpy', 'manualOtherFeeJpy']
    .some(key => row[key] != null && String(row[key]).trim() !== '');
}

function hasGrossProfitValue(row = {}) {
  return row.billingMatched || row.billingManual;
}

function grossProfitValue(row = {}) {
  return hasGrossProfitValue(row) ? Number(row.grossProfitJpy || 0) : 0;
}

function grossMarginValue(row = {}) {
  const revenue = Number(row.billingRevenueJpy || row.lineTotal || row.total || 0);
  return revenue ? grossProfitValue(row) / revenue : 0;
}

function billingProfitTone(row = {}) {
  if (!hasGrossProfitValue(row)) return 'none';
  const profit = grossProfitValue(row);
  const margin = grossMarginValue(row);
  if (profit < 0 || (Number(row.billingRevenueJpy || 0) > 0 && margin <= 0.3)) return 'bad';
  if (margin <= 0.5) return 'warn';
  return 'good';
}

function billingProfitCell(row = {}) {
  const rowId = String(row.id || '');
  const expanded = rowId && orderState.expandedBillingIds.has(rowId);
  const tone = billingProfitTone(row);
  const manual = hasManualBilling(row);
  const hasValue = hasGrossProfitValue(row);
  const detailTone = hasValue ? tone : 'none';
  const detailButton = rowId
    ? `<button class="profit-detail-button order-profit-toggle order-profit-${detailTone}" type="button" data-order-id="${escapeHtml(rowId)}" aria-expanded="${expanded ? 'true' : 'false'}" title="原価・送料・手数料の詳細を表示">内訳</button>`
    : '';
  return `<div class="profit-edit-cell ${manual ? 'is-manual' : ''}">
    ${hasValue ? `<span class="profit-value-pill order-profit-${tone}">粗利 ${escapeHtml(yen(grossProfitValue(row)))} / ${escapeHtml(percent(grossMarginValue(row)))}</span>` : '<span class="billing-profit-empty">未取込</span>'}
    ${detailButton}
    ${manual ? '<span class="manual-profit-chip">手</span>' : ''}
  </div>`;
}

function billingIssueLabels(row = {}) {
  return [...new Set(row.billingIssues || [])].map(issue => {
    if (issue === '物流番号なし') return '物流番号未記載';
    if (issue === 'BANRI注文番号なし') return 'BANRI注文番号未記載';
    if (issue === 'Shopify売上未一致') return 'Shopify売上未一致';
    if (issue === '粗利率30%以下') return '低粗利';
    return issue;
  }).filter(Boolean);
}

function billingReviewTone(row = {}) {
  const issues = row.billingIssues || [];
  if (issues.length === 1 && issues[0] === '物流番号なし') return 'warn';
  return 'danger';
}

function billingReviewLabel(row = {}) {
  const labels = billingIssueLabels(row);
  if (!labels.length) return '明細確認あり';
  return labels.length === 1 ? labels[0] : `${labels[0]} ほか${labels.length - 1}件`;
}

function billingStatusPill(row = {}) {
  if (row.billingManual) return '<span class="pill source">手入力</span>';
  if (!row.billingMatched) return '<span class="pill muted-pill">未取込</span>';
  const status = row.billingStatus || '取込済み';
  if (status === '要確認') {
    const labels = billingIssueLabels(row);
    const title = labels.length ? `確認理由: ${labels.join(' / ')}` : '料金明細に確認が必要な項目があります';
    return `<span class="pill ${billingReviewTone(row)}" title="${escapeHtml(title)}">${escapeHtml(billingReviewLabel(row))}</span>`;
  }
  const tone = status === '要確認' ? 'danger' : status === '未請求' ? 'warn' : status === '確認済み' ? 'ok' : 'source';
  return `<span class="pill ${tone}">${escapeHtml(status)}</span>`;
}

function billingReviewNote(row = {}) {
  if (row.billingStatus !== '要確認') return '';
  const labels = billingIssueLabels(row);
  if (!labels.length) return '';
  const logisticsOnly = labels.length === 1 && labels[0] === '物流番号未記載';
  const message = logisticsOnly
    ? '料金明細CSVに物流番号がありません。金額計算は完了していますが、追跡番号との突合だけ確認してください。'
    : `確認理由: ${labels.join(' / ')}`;
  const notices = (row.billingNotices || []).length
    ? `<span class="billing-review-subnote">補足: ${escapeHtml(row.billingNotices.join(' / '))}</span>`
    : '';
  return `<div class="billing-review-note ${logisticsOnly ? 'is-light' : 'is-strong'}">
    <span>${escapeHtml(message)}</span>
    ${notices}
  </div>`;
}

function billingInputValue(row = {}, manualField, valueField) {
  if (row[manualField] != null && String(row[manualField]).trim() !== '') return Math.round(Number(row[manualField] || 0));
  if (row.billingMatched) return Math.round(Number(row[valueField] || 0));
  return '';
}

function billingCostField(row = {}, label, manualField, valueField) {
  const editable = !row.billingMatched;
  if (!editable) {
    return `<span>${escapeHtml(label)} <b>${yen(row[valueField] || 0)}</b></span>`;
  }
  return `<label class="billing-manual-fee-field">${escapeHtml(label)}
    <input class="billing-fee-input order-edit" type="number" inputmode="numeric" data-order-id="${escapeHtml(row.id || '')}" data-field="${escapeHtml(manualField)}" value="${escapeHtml(billingInputValue(row, manualField, valueField))}" aria-label="${escapeHtml(row.orderName || '注文')}の${escapeHtml(label)}">
  </label>`;
}

function billingDetailRow(row = {}) {
  return `
    <tr class="billing-detail-row">
      <td colspan="20">
        <div class="billing-detail-box">
          <div class="billing-detail-head">
            <strong>料金明細の内訳</strong>
            ${billingStatusPill(row)}
            <span class="muted">${row.billingMatched ? `一致 ${Number(row.billingMatchCount || 1)}件` : 'CSVにない費用はここで手入力'}</span>
          </div>
          ${billingReviewNote(row)}
          <div class="billing-cost-grid">
            <span>売上 <b>${yen(row.billingRevenueJpy || row.lineTotal || row.total || 0)}</b></span>
            <span>原価合計 <b>${yen(row.billingCostJpy)}</b></span>
            ${billingCostField(row, '商品原価', 'manualProductCostJpy', 'billingProductCostJpy')}
            ${billingCostField(row, '国内送料', 'manualDomesticShippingJpy', 'billingDomesticShippingJpy')}
            ${billingCostField(row, '作業/手数料', 'manualWorkFeeJpy', 'billingWorkFeeJpy')}
            ${billingCostField(row, '国際送料', 'manualInternationalShippingJpy', 'billingInternationalShippingJpy')}
            <label class="billing-other-fee-field">その他
              <input class="billing-fee-input order-edit" type="number" inputmode="numeric" data-order-id="${escapeHtml(row.id || '')}" data-field="manualOtherFeeJpy" value="${escapeHtml(billingInputValue(row, 'manualOtherFeeJpy', 'billingOtherFeeJpy'))}" aria-label="${escapeHtml(row.orderName || '注文')}のその他費用">
            </label>
            <span class="profit-total">粗利 <b>${yen(row.grossProfitJpy)}</b></span>
            <span class="profit-total">粗利率 <b>${percent(row.grossMarginPct)}</b></span>
          </div>
        </div>
      </td>
    </tr>
  `;
}

async function previewOrders() {
  try {
    const file = orderEls.file.files?.[0];
    if (!file) throw new Error('Shopify注文CSVを選択してください');
    setOrderUploadState('busy', 'アップロード中・CSVを読み取り中...');
    const { csv, result } = await withLoading('Shopify注文CSVを読み取り中です...', async () => {
      const nextCsv = await file.text();
      const nextResult = await api('/api/shopify-orders/preview', {
        method: 'POST',
        body: JSON.stringify({ csv: nextCsv }),
      });
      return { csv: nextCsv, result: nextResult };
    });
    orderState.pendingCsv = csv;
    orderState.pendingSource = 'csv';
    orderState.preview = result;
    orderEls.importResult.textContent = `確認済み: 新規 ${result.added}行 / 重複 ${result.duplicateRows || 0}行 / 管理番号なし ${result.noProductNo}行`;
    setOrderUploadState(result.added > 0 ? 'ready' : 'selected', result.added > 0 ? `確認OK: 新規 ${result.added}行` : '新規0行（反映不要）');
    renderPreview();
    toast('CSVを自動確認しました');
  } catch (error) {
    setOrderUploadState('error', `エラー: ${error.message}`);
    toast(error.message);
  }
}

function shopifyFetchPayload() {
  return {
    limit: Number(orderState.fetchLimit || 100),
  };
}

async function previewShopifyOrders() {
  try {
    orderState.pendingCsv = '';
    orderState.pendingSource = '';
    orderState.preview = null;
    if (orderEls.file) orderEls.file.value = '';
    renderPreview();
    setOrderUploadState('busy', 'Shopifyから注文を取得中...');
    const result = await withLoading('Shopifyから注文を取得中です...', () => api('/api/shopify-orders/fetch-preview', {
      method: 'POST',
      body: JSON.stringify(shopifyFetchPayload()),
    }));
    orderState.pendingSource = 'shopify';
    orderState.preview = result;
    orderEls.importResult.textContent = `Shopify確認済み: 取得 ${result.fetchedOrders || 0}件 / 新規 ${result.added}行 / 重複 ${result.duplicateRows || 0}行`;
    setOrderUploadState(result.added > 0 ? 'ready' : 'selected', result.added > 0 ? `Shopify取得OK: 新規 ${result.added}行` : 'Shopify取得OK: 新規0行（反映不要）');
    renderPreview();
    toast('Shopify注文を自動確認しました');
  } catch (error) {
    orderState.pendingSource = '';
    orderState.preview = null;
    setOrderUploadState('error', `エラー: ${error.message}`);
    renderPreview();
    toast(error.message);
  }
}

function shopifyProcessingResultText(processing = {}) {
  if (!processing || !processing.attempted) return '';
  if (processing.disabled) return ' / Shopify未発送のまま保持';
  const base = ` / Shopify未発送のまま ${processing.skipped || processing.success || 0}件`;
  return processing.failed ? `${base} / 失敗 ${processing.failed}件` : base;
}

async function applyOrders() {
  try {
    if (!orderState.preview) throw new Error('先に取込前確認をしてください');
    const addedCount = previewAddedCount(orderState.preview);
    if (addedCount <= 0) throw new Error('新規行が0件のため、台帳に反映する必要はありません');
    const sourceLabel = orderState.pendingSource === 'shopify' ? 'Shopify取得分' : 'CSV取込分';
    if (!confirmAction('注文を台帳に反映しますか？', [
      `${sourceLabel}の新規 ${addedCount}行を保存します。`,
      '重複行は追加されません。Shopify側の発送状態は未発送のまま変更しません。'
    ])) return;
    setOrderUploadState('busy', '台帳に反映中...');
    const isShopifyFetch = orderState.pendingSource === 'shopify';
    const result = await withLoading(isShopifyFetch ? 'Shopify注文を台帳に反映中です。Shopify側は未発送のまま変更しません。' : '注文CSVを台帳に反映中です...', () => {
      if (isShopifyFetch) {
        return api('/api/shopify-orders/fetch-import', {
          method: 'POST',
          body: JSON.stringify(shopifyFetchPayload()),
        });
      }
      if (!orderState.pendingCsv) throw new Error('先にCSVファイルを選択してください');
      return api('/api/shopify-orders/import', {
        method: 'POST',
        body: JSON.stringify({ csv: orderState.pendingCsv }),
      });
    });
    orderState.orders = result.orders || [];
    orderState.pendingCsv = '';
    orderState.pendingSource = '';
    orderState.preview = null;
    orderEls.file.value = '';
    const processingText = isShopifyFetch ? shopifyProcessingResultText(result.shopifyProcessing) : '';
    orderEls.importResult.textContent = `${isShopifyFetch ? 'Shopify取得分' : 'CSV'}を台帳に反映済み: 追加 ${result.added}行 / 重複 ${result.duplicateRows || 0}行 / 読み飛ばし ${result.skipped}行${processingText}`;
    setOrderUploadState('done', `設定完了: 追加 ${result.added}行 / 重複 ${result.duplicateRows || 0}行${processingText}`);
    renderPreview();
    renderOrders();
    toast('台帳に反映しました');
  } catch (error) {
    setOrderUploadState('error', `エラー: ${error.message}`);
    toast(error.message);
  }
}

function setOrderBillingUploadState(status, message) {
  if (!orderEls.billingUploadState) return;
  orderEls.billingUploadState.className = `upload-state ${status || 'idle'}`;
  orderEls.billingUploadState.textContent = message;
}

function operationTimeText(date = new Date()) {
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function billingChangedCount(result = {}) {
  return Number(result.added || 0) + Number(result.updated || 0) + Number(result.removed || 0);
}

function billingApplySummaryText(result = {}) {
  const added = Number(result.added || 0);
  const updated = Number(result.updated || 0);
  const unchanged = Number(result.unchanged || 0);
  const removed = Number(result.removed || 0);
  const parts = [`追加 ${added}件`, `更新 ${updated}件`, `変更なし ${unchanged}件`];
  if (removed) parts.push(`CSVになく削除 ${removed}件`);
  return parts.join(' / ');
}

function billingApplyResultHtml(result = {}) {
  const changed = billingChangedCount(result);
  const summary = billingApplySummaryText(result);
  const message = changed
    ? `保存完了。台帳へ反映した変更があります。${summary}`
    : `保存完了。今回新しく反映する変更はありません。${summary}`;
  return `
    <div class="${changed ? 'smallorder-ok' : 'smallorder-line'}">${escapeHtml(message)}</div>
    <div class="smallorder-line">確認時刻: ${escapeHtml(operationTimeText())}</div>
  `;
}

function setOrderBillingBusy(isBusy) {
  orderState.billingUploadBusy = Boolean(isBusy);
  setButtonState(orderEls.btnPreviewBilling, orderState.billingUploadBusy, '料金CSVを処理中です', '料金明細CSVの内容を保存前に確認します');
  const canApplyBilling = !orderState.billingUploadBusy && orderState.pendingBillingPayload && orderState.billingPreview;
  setButtonState(orderEls.btnApplyBilling, !canApplyBilling, orderState.billingUploadBusy ? '料金CSVを処理中です' : '先に料金取込を確認してください', '確認済みの料金を注文台帳へ保存します');
}

function resetOrderBillingUploadState() {
  orderState.pendingBillingPayload = null;
  orderState.billingPreview = null;
  setOrderBillingBusy(false);
  if (orderEls.billingResult) orderEls.billingResult.innerHTML = '';
  const fileName = orderEls.billingFile?.files?.[0]?.name || '';
  if (fileName) {
    setOrderBillingUploadState('selected', `選択済み: ${fileName}`);
  } else {
    setOrderBillingUploadState('idle', '料金CSV未選択');
  }
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

async function buildOrderBillingPayload() {
  const file = orderEls.billingFile?.files?.[0];
  if (!file) throw new Error('料金明細CSVを選択してください');
  const name = String(file.name || '').toLowerCase();
  if (name && !name.endsWith('.csv')) throw new Error('アップロードできるのはCSVだけです');
  return {
    csv: await readCsvFile(file),
    csvFileName: file.name,
  };
}

async function previewOrderBilling() {
  try {
    setOrderBillingBusy(true);
    setOrderBillingUploadState('busy', 'アップロード中・料金CSVを確認中...');
    const { payload, preview } = await withLoading('料金明細CSVを確認中です...', async () => {
      const nextPayload = await buildOrderBillingPayload();
      const nextPreview = await api('/api/billing-reconciliation/preview', {
        method: 'POST',
        body: JSON.stringify(nextPayload),
      });
      return { payload: nextPayload, preview: nextPreview };
    });
    orderState.pendingBillingPayload = payload;
    orderState.billingPreview = preview;
    const summary = preview.summary || {};
    const changes = preview.changes || {};
    const changed = billingChangedCount(changes);
    setOrderBillingUploadState('ready', `確認完了（未反映）: 明細 ${summary.itemCount || 0}件 / 変更予定 ${changed}件`);
    if (orderEls.billingResult) {
      orderEls.billingResult.innerHTML = `
        <div class="smallorder-alert">まだ台帳には保存していません。「料金を台帳へ反映」を押すと保存されます。</div>
        <div class="${changed ? 'smallorder-ok' : 'smallorder-line'}">保存した場合: ${escapeHtml(changed ? billingApplySummaryText(changes) : `更新する変更はありません（変更なし ${changes.unchanged || 0}件）`)}</div>
        <div class="smallorder-line">確認内容: 要対応 ${Number(summary.actionCount || 0)}件 / 未請求 ${Number(summary.unbilledCount || 0)}件 / 低粗利 ${Number(summary.lowMarginCount || 0)}件</div>
      `;
    }
    setOrderBillingBusy(false);
    toast('料金CSVを確認しました');
  } catch (error) {
    orderState.pendingBillingPayload = null;
    orderState.billingPreview = null;
    setOrderBillingUploadState('error', `エラー: ${error.message}`);
    setOrderBillingBusy(false);
    toast(error.message);
  }
}

async function applyOrderBilling() {
  try {
    if (!orderState.pendingBillingPayload || !orderState.billingPreview) throw new Error('先に取込確認をしてください');
    const summary = orderState.billingPreview.summary || {};
    if (!confirmAction('料金CSVを台帳に反映しますか？', [
      `明細 ${summary.itemCount || 0}件を確認済みです。`,
      '原価・送料・手数料・粗利が注文台帳に上書き反映されます。'
    ])) return;
    setOrderBillingBusy(true);
    setOrderBillingUploadState('busy', '台帳に料金を反映中...');
    const importPayload = { ...orderState.pendingBillingPayload, replaceExisting: true };
    const result = await withLoading('料金明細を注文台帳へ反映中です...', () => api('/api/billing-reconciliation/import', {
      method: 'POST',
      body: JSON.stringify(importPayload),
    }));
    orderState.pendingBillingPayload = null;
    orderState.billingPreview = null;
    if (orderEls.billingFile) orderEls.billingFile.value = '';
    const changed = billingChangedCount(result);
    setOrderBillingUploadState(
      'done',
      changed
        ? `保存完了: ${billingApplySummaryText(result)}`
        : `保存完了: 更新する変更はありません（変更なし ${result.unchanged || 0}件）`
    );
    if (orderEls.billingResult) {
      orderEls.billingResult.innerHTML = billingApplyResultHtml(result);
    }
    await loadOrders({ silent: true });
    setOrderBillingBusy(false);
    toast('料金CSVを反映しました');
  } catch (error) {
    setOrderBillingUploadState('error', `エラー: ${error.message}`);
    setOrderBillingBusy(false);
    toast(error.message);
  }
}

function setOrderTrackingBusy(isBusy) {
  orderState.trackingBusy = Boolean(isBusy);
  setButtonState(orderEls.btnLoadTracking, orderState.trackingBusy, '追跡候補を確認中です', '注文IDが一致する追跡番号だけをShopifyへ反映できるか確認します');
  const readyCount = (orderState.trackingPreview?.candidates || []).filter(candidate => candidate.ready).length;
  setButtonState(orderEls.btnSyncTracking, orderState.trackingBusy || !readyCount, orderState.trackingBusy ? '追跡候補を確認中です' : '注文ID一致でShopifyへ反映できる追跡番号がありません', `${readyCount}件の追跡番号をShopifyへ反映します`);
  setButtonState(orderEls.btnRefreshDeliveryStatus, orderState.trackingBusy, '追跡処理中です', '佐川急便の配送状況を更新します');
}

function trackingSummaryLine(summary = {}) {
  return `対象 ${Number(summary.total || 0)}件 / 新規反映 ${Number(summary.ready || 0)}件 / 反映済み ${Number(summary.synced || 0)}件 / 失敗 ${Number(summary.failed || 0)}件 / 対象外 ${Number(summary.skipped || 0)}件`;
}

function setTrackingStatus(status, message) {
  if (!orderEls.trackingStatus) return;
  orderEls.trackingStatus.className = `upload-state ${status || 'idle'}`;
  orderEls.trackingStatus.textContent = message;
}

function renderOrderTrackingPreview() {
  const tracking = orderState.trackingPreview;
  const candidates = tracking?.candidates || [];
  const ready = candidates.filter(candidate => candidate.ready);
  const failed = candidates.filter(candidate => candidate.error || candidate.lastError || candidate.status === '失敗');
  const summary = tracking?.summary || {};
  const failedCount = failed.length || Number(summary.failed || 0);
  if (orderEls.trackingStatus) {
    if (!tracking) {
      setTrackingStatus('idle', '追跡候補 未確認');
    } else if (ready.length) {
      setTrackingStatus('ready', `確認完了（未反映）: 新規反映 ${ready.length}件${failedCount ? ` / 失敗 ${failedCount}件` : ''}`);
    } else if (failedCount) {
      setTrackingStatus('error', `確認完了: 新規反映0件 / 失敗 ${failedCount}件`);
    } else {
      setTrackingStatus('done', '確認完了: Shopifyへ新しく反映する追跡番号はありません');
    }
  }
  if (orderEls.trackingResult) {
    orderEls.trackingResult.innerHTML = tracking
      ? `
        <div class="${ready.length ? 'smallorder-alert' : 'smallorder-ok'}">${ready.length ? '注文IDが一致した未反映候補があります。必要なら「Shopifyへ追跡番号反映」を押してください。' : '確認済み。今回Shopifyへ反映するものはありません。'}</div>
        <div class="smallorder-line">${escapeHtml(trackingSummaryLine(summary))}</div>
        ${ready.slice(0, 5).map(candidate => `<div class="smallorder-line">${escapeHtml(candidate.orderName || '')} / ${escapeHtml(candidate.trackingNumber || '')}</div>`).join('')}
        ${failed.slice(0, 3).map(candidate => `<div class="smallorder-alert">${escapeHtml(candidate.orderName || '')} / ${escapeHtml(candidate.trackingNumber || '')} / ${escapeHtml(candidate.error || candidate.lastError || '失敗候補')}</div>`).join('')}
      `
      : '';
  }
  setOrderTrackingBusy(false);
}

async function loadOrderShopifyTrackingCandidates() {
  try {
    setOrderTrackingBusy(true);
    setTrackingStatus('busy', 'Shopify反映候補を確認中...（最大30秒ほどかかる場合があります）');
    orderState.trackingPreview = await withLoading('Shopify追跡反映の候補を確認中です...', () => api('/api/shopify-tracking'));
    renderOrderTrackingPreview();
    toast('追跡反映候補を確認しました');
  } catch (error) {
    orderState.trackingPreview = null;
    setTrackingStatus('error', `確認エラー: ${error.message}`);
    setOrderTrackingBusy(false);
    toast(error.message);
  }
}

async function syncOrderShopifyTracking() {
  try {
    if (!orderState.trackingPreview) {
      orderState.trackingPreview = await api('/api/shopify-tracking');
    }
    const targets = (orderState.trackingPreview.candidates || []).filter(candidate => candidate.ready);
    if (!targets.length) {
      renderOrderTrackingPreview();
      return toast('Shopifyへ反映できる候補がありません');
    }
    if (!window.confirm(`${targets.length}件の追跡番号をShopifyへ反映します。
配送会社: 佐川急便
よろしいですか？`)) return;

    setOrderTrackingBusy(true);
    setTrackingStatus('busy', 'Shopifyへ反映中...');
    const result = await withLoading('Shopifyへ追跡番号を反映中です...', () => api('/api/shopify-tracking/sync', {
      method: 'POST',
      body: JSON.stringify({
        ids: targets.map(candidate => candidate.id),
        notifyCustomer: false,
        trackingCompany: 'Sagawa Express',
      }),
    }));
    orderState.trackingPreview = result.tracking;
    const success = Number(result.summary?.success || 0);
    const failedCount = Number(result.summary?.failed || 0);
    await loadOrders({ silent: true });
    renderOrderTrackingPreview();
    setTrackingStatus(
      failedCount ? 'error' : 'done',
      failedCount
        ? `反映完了: 成功 ${success}件 / 失敗 ${failedCount}件`
        : `反映完了: 成功 ${success}件 / 失敗 0件`
    );
    if (orderEls.trackingResult) {
      orderEls.trackingResult.innerHTML = `
        <div class="${failedCount ? 'smallorder-alert' : 'smallorder-ok'}">Shopify反映完了: 成功 ${success}件 / 失敗 ${failedCount}件</div>
        <div class="smallorder-line">反映時刻: ${escapeHtml(operationTimeText())}</div>
      `;
    }
    toast(`Shopify反映: 成功 ${success}件 / 失敗 ${failedCount}件`);
  } catch (error) {
    setTrackingStatus('error', `反映エラー: ${error.message}`);
    setOrderTrackingBusy(false);
    toast(error.message);
  }
}

async function previewSmallorder() {
  try {
    const payload = smallorderPayload();
    orderState.smallorderPreview = await withLoading(`${smallorderTargetLabel(payload.target)}を確認中です...`, () => api('/api/smallorder-preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));
    renderSmallorderPreview();
    toast(`${smallorderTargetLabel(payload.target)}を確認しました`);
  } catch (error) {
    orderState.smallorderPreview = null;
    renderSmallorderPreview();
    if (orderEls.smallorderResult) {
      orderEls.smallorderResult.innerHTML = `<div class="smallorder-alert">${escapeHtml(error.message)}</div>`;
    }
    toast(error.message);
  }
}

async function downloadSmallorder() {
  try {
    const payload = smallorderPayload();
    const preview = orderState.smallorderPreview || {};
    const count = Number(preview.matchedCount || 0);
    const quantity = Number(preview.totalQuantity || 0);
    if (!confirmAction('BANRI発注Excelを出力しますか？', [
      `${smallorderTargetLabel(payload.target)}：${count}件 / 数量 ${quantity}点を出力します。`,
      '氏名・住所・電話番号などの顧客情報を含みます。'
    ])) return;
    await withLoading('BANRI発注Excelを作成中です...', async () => {
      const res = await fetch('/api/smallorder-xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Excelを作成できませんでした');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `banri_order_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    orderState.smallorderPreview = null;
    renderSmallorderPreview();
    await loadOrders({ silent: true });
    toast(payload.target === 'ordered'
      ? '発注済みのBANRI Excelを再出力しました'
      : 'BANRI発注Excelを作成しました');
  } catch (error) {
    if (orderEls.smallorderResult) {
      orderEls.smallorderResult.innerHTML = `<div class="smallorder-alert">${escapeHtml(error.message)}</div>`;
    }
    toast(error.message);
  }
}

async function refreshDeliveryStatus() {
  try {
    setOrderTrackingBusy(true);
    setTrackingStatus('busy', '佐川配送状況を確認中...');
    if (orderEls.trackingResult) {
      orderEls.trackingResult.innerHTML = '<div class="smallorder-line">佐川の配送状況を確認しています。完了すると更新件数を表示します。</div>';
    }
    const result = await withLoading('佐川急便の配送状況を確認中です...', () => api('/api/sagawa-tracking/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    orderState.orders = result.orders || orderState.orders;
    renderOrders();
    const checked = Number(result.checked || 0);
    const updated = Number(result.updated || 0);
    const failed = (result.results || []).filter(item => !item.ok).length;
    const statusText = failed
      ? `佐川確認完了: 更新 ${updated}件 / 確認 ${checked}件 / 失敗 ${failed}件`
      : updated
        ? `佐川確認完了: 更新 ${updated}件 / 確認 ${checked}件`
        : `佐川確認完了: 変更なし / 確認 ${checked}件`;
    setTrackingStatus(failed ? 'error' : 'done', statusText);
    if (orderEls.trackingResult) {
      const failedRows = (result.results || []).filter(item => !item.ok).slice(0, 3);
      orderEls.trackingResult.innerHTML = `
        <div class="${failed ? 'smallorder-alert' : (updated ? 'smallorder-ok' : 'smallorder-line')}">${escapeHtml(updated ? `配送状況を台帳へ更新しました: ${updated}件` : '確認済み。今回更新する配送状況はありません。')}</div>
        <div class="smallorder-line">確認結果: 確認 ${checked}件 / 更新 ${updated}件 / 失敗 ${failed}件 / 確認時刻 ${escapeHtml(operationTimeText())}</div>
        ${failedRows.map(item => `<div class="smallorder-alert">${escapeHtml(item.orderName || '')} / ${escapeHtml(item.trackingNumber || '')} / ${escapeHtml(item.error || '確認失敗')}</div>`).join('')}
      `;
    }
    setOrderTrackingBusy(false);
    toast(updated ? `配送状況を更新しました: 更新 ${updated}件` : '配送状況を確認しました: 変更なし');
  } catch (error) {
    setTrackingStatus('error', `佐川確認エラー: ${error.message}`);
    if (orderEls.trackingResult) {
      orderEls.trackingResult.innerHTML = `<div class="smallorder-alert">佐川配送状況を確認できませんでした: ${escapeHtml(error.message)}</div>`;
    }
    setOrderTrackingBusy(false);
    toast(error.message);
  }
}

async function saveOrderRow(id, updates, options = {}) {
  const row = orderState.orders.find(item => item.id === id);
  const manualBillingFields = ['manualProductCostJpy', 'manualDomesticShippingJpy', 'manualWorkFeeJpy', 'manualInternationalShippingJpy', 'manualOtherFeeJpy'];
  const updatesManualBilling = manualBillingFields.some(key => Object.prototype.hasOwnProperty.call(updates, key));
  const clearManualFields = manualBillingFields.filter(key => Object.prototype.hasOwnProperty.call(updates, key) && String(updates[key] || '').trim() === '');
  const optimistic = options.optimistic !== false;
  const previousValues = {};
  if (row) {
    Object.keys(updates || {}).forEach(key => {
      previousValues[key] = row[key];
    });
  }
  if (row && optimistic) {
    Object.assign(row, updates);
    clearManualFields.forEach(key => delete row[key]);
    renderOrders();
  }
  let result;
  try {
    result = await withLoading('変更を保存中です...', () => api(`/api/shopify-orders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }));
  } catch (error) {
    if (row && optimistic) {
      Object.assign(row, previousValues);
      renderOrders();
    }
    throw error;
  }
  if (row && result?.order) {
    Object.assign(row, result.order);
    clearManualFields.forEach(key => delete row[key]);
    if (updatesManualBilling) {
      await loadOrders({ silent: true });
      return;
    }
    renderOrders();
  } else if (row && !optimistic) {
    Object.assign(row, updates);
    renderOrders();
  }
}

async function exportOrdersCsv() {
  try {
    const rows = filteredOrders();
    if (!rows.length) return toast('出力する注文データがありません');
    if (!confirmAction('表示中の注文CSVを出力しますか？', [
      `${rows.length}行をCSV出力します。`,
      '氏名・住所・電話番号などの顧客情報を含みます。'
    ])) return;
    await withLoading('注文CSVを作成中です...', async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const orderLineCounts = orderLineCountMap(rows);
      const header = ['注文', '同梱', '同梱注文', '日付', '注文者', '発送先', '郵便番号', '住所', '電話番号', '管理番号', 'SKU', '数量', '売上', '粗利', '粗利率', '原価合計', '商品原価', '国内送料', '作業/手数料', '国際送料', 'その他費用', '決済', '入金後日数', 'ステータス', '追跡番号', '配送状況', '追跡後日数', 'メモ'];
      const body = rows.map(row => [
        row.orderName,
        hasCoShipment(row, orderLineCounts) ? 'あり' : 'なし',
        (row.deliveryGroupOrderNames || []).join(' / '),
        formatDate(row.createdAt),
        row.billingName || row.customerName,
        row.shippingName || row.customerName,
        row.shippingZip || row.billingZip,
        row.shippingAddress || row.billingAddress,
        row.shippingPhone || row.billingPhone,
        row.productNo,
        row.sku,
        row.quantity,
        row.lineTotal || row.total || 0,
        hasGrossProfitValue(row) ? grossProfitValue(row) : '',
        hasGrossProfitValue(row) ? percent(grossMarginValue(row)) : '',
        hasGrossProfitValue(row) ? Number(row.billingCostJpy || 0) : '',
        hasGrossProfitValue(row) ? Number(row.billingProductCostJpy || 0) : '',
        hasGrossProfitValue(row) ? Number(row.billingDomesticShippingJpy || 0) : '',
        hasGrossProfitValue(row) ? Number(row.billingWorkFeeJpy || 0) : '',
        hasGrossProfitValue(row) ? Number(row.billingInternationalShippingJpy || 0) : '',
        hasGrossProfitValue(row) ? Number(row.billingOtherFeeJpy || 0) : '',
        row.financialStatusJa || row.financialStatus,
        isPaidAgeClosed(row) ? '済' : paidAgeDays(row),
        displayPurchaseStatus(row),
        trackingNumberForRow(row),
        deliveryStatusForRow(row),
        isDeliveredOrder(row) ? '済' : trackingAgeDays(row),
        row.note,
      ]);
      const csv = [header, ...body].map(line => line.map(csvCell).join(',')).join('\n');
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shopify_orders_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    toast('CSVを出力しました');
  } catch (error) {
    toast(error.message);
  }
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function toast(message) {
  orderEls.toast.textContent = message;
  orderEls.toast.classList.add('visible');
  setTimeout(() => orderEls.toast.classList.remove('visible'), 2200);
}

function toggleOrderRules(open) {
  if (!orderEls.rulesModal) return;
  orderEls.rulesModal.classList.toggle('hidden', !open);
  document.body.classList.toggle('modal-open', Boolean(open));
}

function bindOrderEvents() {
  document.getElementById('btnReloadOrders').addEventListener('click', loadOrders);
  orderEls.btnRules?.addEventListener('click', () => toggleOrderRules(true));
  orderEls.rulesModal?.addEventListener('click', event => {
    if (event.target.closest('[data-close-rules]')) toggleOrderRules(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && orderEls.rulesModal && !orderEls.rulesModal.classList.contains('hidden')) {
      toggleOrderRules(false);
    }
  });
  orderEls.btnApply.addEventListener('click', applyOrders);
  orderEls.btnFetchShopify?.addEventListener('click', previewShopifyOrders);
  orderEls.btnRefreshDeliveryStatus?.addEventListener('click', refreshDeliveryStatus);
  orderEls.btnClearFilters?.addEventListener('click', () => {
    orderState.query = '';
    orderState.month = '';
    orderState.groupOnly = false;
    if (orderEls.search) orderEls.search.value = '';
    if (orderEls.monthFilter) orderEls.monthFilter.value = '';
    renderOrders();
    toast('検索条件を解除しました');
  });
  orderEls.btnPreviewSmallorder?.addEventListener('click', previewSmallorder);
  orderEls.btnDownloadSmallorder?.addEventListener('click', downloadSmallorder);
  orderEls.btnPreviewBilling?.addEventListener('click', previewOrderBilling);
  orderEls.btnApplyBilling?.addEventListener('click', applyOrderBilling);
  orderEls.btnLoadTracking?.addEventListener('click', loadOrderShopifyTrackingCandidates);
  orderEls.btnSyncTracking?.addEventListener('click', syncOrderShopifyTracking);
  orderEls.billingFile?.addEventListener('change', resetOrderBillingUploadState);
  orderEls.btnClearSelection?.addEventListener('click', () => {
    orderState.selectedOrderIds.clear();
    resetSmallorderPreviewForSelection();
    renderOrders();
  });
  orderEls.selectAll?.addEventListener('change', event => {
    const visibleIds = filteredOrders().map(row => String(row.id || '')).filter(Boolean);
    if (event.target.checked) {
      visibleIds.forEach(id => orderState.selectedOrderIds.add(id));
    } else {
      visibleIds.forEach(id => orderState.selectedOrderIds.delete(id));
    }
    resetSmallorderPreviewForSelection();
    renderOrders();
  });
  orderEls.smallorderTarget?.addEventListener('change', event => {
    orderState.smallorderTarget = event.target.value || 'unordered';
    orderState.smallorderPreview = null;
    renderSmallorderPreview();
  });
  orderEls.fetchLimit?.addEventListener('change', event => {
    orderState.fetchLimit = Number(event.target.value || 100);
    if (orderState.pendingSource === 'shopify') {
      orderState.pendingSource = '';
      orderState.preview = null;
      renderPreview();
      setOrderUploadState('idle', '件数変更済み');
    }
  });
  document.getElementById('btnExportOrders').addEventListener('click', exportOrdersCsv);
  orderEls.file.addEventListener('change', () => {
    orderState.pendingCsv = '';
    orderState.pendingSource = '';
    orderState.preview = null;
    orderEls.importResult.textContent = 'CSVを読み取っています。';
    resetOrderUploadState();
    renderPreview();
    previewOrders();
  });
  orderEls.search.addEventListener('input', event => {
    orderState.query = event.target.value;
    renderOrders();
  });
  orderEls.monthFilter.addEventListener('change', event => {
    orderState.month = event.target.value;
    renderOrders();
  });
  orderEls.sort.addEventListener('change', event => {
    orderState.sort = event.target.value;
    if (orderState.sort !== 'table') {
      orderState.tableSort = { key: '', direction: 'asc' };
    }
    renderOrders();
  });
  document.querySelectorAll('[data-order-sort]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.orderSort || '';
      const current = orderState.tableSort || { key: '', direction: 'asc' };
      const direction = current.key === key && current.direction === 'asc' ? 'desc' : 'asc';
      orderState.tableSort = { key, direction };
      orderState.sort = 'table';
      if (orderEls.sort) orderEls.sort.value = 'table';
      renderOrders();
    });
  });
  orderEls.statDeliveryGroups.addEventListener('click', () => {
    orderState.groupOnly = !orderState.groupOnly;
    renderOrders();
  });
  orderEls.rows.addEventListener('change', async event => {
    const checkbox = event.target.closest('.order-row-check');
    if (checkbox) {
      setOrderSelectionFromCheckbox(checkbox);
      return;
    }
    const input = event.target.closest('.order-edit');
    if (!input) return;
    const id = String(input.dataset.orderId || '');
    const field = input.dataset.field;
    const nextValue = input.value;
    if (field === 'purchaseStatus') {
      const previousValue = input.dataset.current || '';
      if (previousValue === nextValue) return;
      input.disabled = true;
      input.title = 'ステータスを保存中です...';
      try {
        await saveOrderRow(id, { [field]: nextValue }, { optimistic: false });
        const label = previousValue ? `${previousValue} → ${nextValue}` : nextValue;
        toast(`ステータスを保存しました: ${label}`);
      } catch (error) {
        input.value = previousValue;
        toast(`ステータスを保存できませんでした: ${error.message}`);
      } finally {
        if (input.isConnected) {
          input.disabled = false;
          input.title = '注文ステータスを変更します。失注・返品は返金集計にも反映されます';
        }
      }
      return;
    }
    saveOrderRow(id, { [field]: nextValue })
      .then(() => toast('保存しました'))
      .catch(error => toast(error.message));
  });
  orderEls.rows.addEventListener('click', event => {
    const checkbox = event.target.closest('.order-row-check');
    if (checkbox) {
      setOrderSelectionFromCheckbox(checkbox);
      return;
    }
    const button = event.target.closest('.order-profit-toggle');
    if (!button) return;
    const id = String(button.dataset.orderId || '');
    if (!id) return;
    if (orderState.expandedBillingIds.has(id)) {
      orderState.expandedBillingIds.delete(id);
    } else {
      orderState.expandedBillingIds.add(id);
    }
    renderOrders();
  });
}

bindOrderEvents();
renderPreview();
renderSmallorderPreview();
resetOrderUploadState();
resetOrderBillingUploadState();
renderOrderTrackingPreview();
loadOrders().catch(error => toast(error.message));
