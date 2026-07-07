const els = {
  rows: document.getElementById('inventoryRows'),
  toast: document.getElementById('toast'),
  reload: document.getElementById('btnInventoryReload'),
  export: document.getElementById('btnInventoryExport'),
  bulkApply: document.getElementById('btnInventoryBulkApply'),
  statusRefresh: document.getElementById('btnInventoryStatusRefresh'),
  storeSafety: document.getElementById('storeSafetyBanner'),
  targetCount: document.getElementById('summaryTargetCount'),
  checkedCount: document.getElementById('summaryCheckedCount'),
  availableCount: document.getElementById('summaryAvailableCount'),
  outCount: document.getElementById('summaryOutCount'),
  errorCount: document.getElementById('summaryErrorCount'),
  unappliedCount: document.getElementById('summaryUnappliedCount'),
  overdueApplyCount: document.getElementById('summaryOverdueApplyCount'),
  shopifyApplyAlert: document.getElementById('shopifyApplyAlert'),
};

const STALE_CHECK_DAYS = 14;
const APPLIED_STALE_DAYS = 60;
const SHOPIFY_STATUS_STALE_DAYS = 7;
const SHOPIFY_APPLY_DEADLINE_HOURS = 24;
let currentStoreHealth = null;
let currentShopifyConnection = null;
const inventoryState = {
  targets: [],
  sortKey: 'productNo',
  sortDir: 'desc',
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

function normalizeImageUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`;
  return url;
}

function imageDisplayUrl(value) {
  const url = normalizeImageUrl(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const shouldProxy = host === 'alicdn.com' || host.endsWith('.alicdn.com');
    return shouldProxy ? `/api/image-proxy?url=${encodeURIComponent(url)}` : url;
  } catch (_) {
    return url;
  }
}

function renderVariantColorImage(group = {}) {
  const rawImageUrl = normalizeImageUrl(group.imageUrl || group.image || group.colorImageUrl || group.colorImage);
  const imageUrl = imageDisplayUrl(rawImageUrl);
  const label = group.color || group.originalColor || 'カラー';
  const title = rawImageUrl ? `${label}の画像` : `${label}の画像URLが未保存です`;
  return `
    <span class="inventory-variant-thumb ${imageUrl ? '' : 'is-missing'}" title="${escapeHtml(title)}">
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.inventory-variant-thumb').classList.add('is-broken'); this.remove();">` : ''}
      <span class="inventory-variant-thumb-fallback">${imageUrl ? '表示失敗' : '画像なし'}</span>
    </span>
  `;
}

function safeId(value) {
  return String(value || 'item').replace(/[^a-zA-Z0-9_-]/g, '-');
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '通信に失敗しました');
  return data;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('ja-JP') : String(value);
}

function formatDateTime(value) {
  if (!value) return '未確認';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${min}`;
}

function formatAppliedDate(value) {
  return value ? formatDateTime(value) : '-';
}

function isOlderThanDays(value, days) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > days * 24 * 60 * 60 * 1000;
}

function elapsedDays(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function dateTimeMs(value) {
  if (!value) return null;
  const date = new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function elapsedHours(value) {
  const ms = dateTimeMs(value);
  if (ms === null) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / (60 * 60 * 1000)));
}

function formatElapsedHours(hours) {
  if (hours === null || hours === undefined) return '-';
  if (hours < 1) return '1時間未満';
  if (hours < 24) return `${hours}時間`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days}日${rest}時間` : `${days}日`;
}

function appliedAgeInfo(value) {
  const days = elapsedDays(value);
  if (days === null) return { days: null, label: '未反映', tone: 'neutral' };
  return {
    days,
    label: `${days}日`,
    tone: days >= APPLIED_STALE_DAYS ? 'warn' : 'ok',
  };
}

function productNoValue(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function inventoryTone(status) {
  if (status === 'available') return 'ok';
  if (status === 'partial') return 'warn';
  if (status === 'out' || status === 'error' || status === 'protected' || status === 'link_broken') return 'danger';
  return 'warn';
}

function shopifyTone(item = {}) {
  const status = resolvedShopifyStatus(item);
  if (status === 'active') return 'ok';
  if (status === 'archived' || status === 'draft' || status === 'stopped' || status === 'missing') return 'danger';
  return 'warn';
}

function resolvedShopifyStatus(item = {}) {
  const syncText = [
    item.shopifySync?.status,
    item.shopifySync?.lastSummary,
    item.shopifyStatusLabel,
  ].filter(Boolean).join(' ');
  if (/アーカイブ|ARCHIVED/i.test(syncText)) return 'archived';
  if (/下書き|DRAFT/i.test(syncText)) return 'draft';
  if (/未存在|見つかりません|NOT_FOUND|DELETED|MISSING/i.test(syncText)) return 'missing';
  if (item.registrationStage === 'archived') return 'archived';
  if (item.status === 'stopped') return 'stopped';
  return item.shopifyStatus || '';
}

function shopifyDisplayInfo(item = {}) {
  const status = resolvedShopifyStatus(item);
  const checkedAt = item.shopifyStatusCheckedAt || item.shopifySync?.lastCheckedAt || '';
  const checkedText = checkedAt ? `最終確認: ${formatDateTime(checkedAt)}` : '最終確認なし';
  const stale = checkedAt && isOlderThanDays(checkedAt, SHOPIFY_STATUS_STALE_DAYS);
  const staleNote = stale ? ' / 再確認推奨' : '';
  const byStatus = {
    active: { label: '公開中', tone: 'ok', title: `Shopifyでアクティブです / ${checkedText}${staleNote}` },
    archived: { label: 'アーカイブ済み', tone: 'danger', title: `Shopifyでアーカイブ済みです / ${checkedText}${staleNote}` },
    draft: { label: '下書き', tone: 'danger', title: `Shopifyで下書きです / ${checkedText}${staleNote}` },
    missing: { label: 'Shopify未存在', tone: 'danger', title: `Shopifyで商品が見つかりません / ${checkedText}${staleNote}` },
    stopped: { label: '停止中', tone: 'danger', title: `このシステム側で停止中です / ${checkedText}${staleNote}` },
  };
  if (byStatus[status]) return byStatus[status];
  if (item.shopifyStatusLabel && checkedAt) {
    return { label: item.shopifyStatusLabel, tone: stale ? 'warn' : shopifyTone(item), title: `最後に確認したShopify状態です / ${checkedText}${staleNote}` };
  }
  if (currentShopifyConnection && !currentShopifyConnection.configured) {
    return { label: '状態未確認', tone: 'warn', title: 'Shopify API未設定のため、まだShopify状態を取得できていません' };
  }
  return { label: '状態未確認', tone: 'warn', title: 'Shopify状態をまだ確認していません' };
}

function isShopifyStatusReadyForInventoryApply(item = {}) {
  const info = shopifyDisplayInfo(item);
  return info.label === '公開中' && info.tone === 'ok';
}

function latestInfo(item = {}) {
  const latest = item.latestCheck || item.lastInventoryCheck || {};
  const stale = Boolean(latest.checkedAt) && (latest.stale || isOlderThanDays(latest.checkedAt, STALE_CHECK_DAYS));
  const tone = stale ? 'warn' : inventoryTone(latest.status || '');
  const rawLabel = latest.statusLabel || (latest.status ? latest.status : '未確認');
  const label = stale ? '要確認' : (rawLabel === '在庫未確認' ? '未確認' : rawLabel);
  const canApply = !stale
    && !currentStoreHealth?.stale
    && currentShopifyConnection?.configured !== false
    && latest.checkedAt
    && latest.knownRows > 0
    && isShopifyStatusReadyForInventoryApply(item)
    && !['error', 'protected', 'unknown', 'link_broken'].includes(latest.status);
  return { latest, stale, tone, label, canApply };
}

function shopifyApplyInfo(item = {}, info = latestInfo(item)) {
  const latest = info.latest || {};
  const checkedAt = latest.checkedAt || '';
  const appliedAt = latest.shopifyAppliedAt || item.shopifySync?.appliedAt || '';
  const checkedMs = dateTimeMs(checkedAt);
  const appliedMs = dateTimeMs(appliedAt);
  const checkedRows = Number(latest.knownRows || 0);
  const hasCheckedInventory = Boolean(
    checkedMs
    && checkedRows > 0
    && !info.stale
    && !['error', 'protected', 'unknown', 'link_broken'].includes(latest.status)
  );
  const needsApply = Boolean(hasCheckedInventory && (!appliedMs || checkedMs > appliedMs + 1000));
  const pendingHours = needsApply ? elapsedHours(checkedAt) : null;
  const overdue = needsApply && pendingHours !== null && pendingHours >= SHOPIFY_APPLY_DEADLINE_HOURS;
  return {
    appliedAt,
    checkedAt,
    needsApply,
    overdue,
    pendingHours,
    pendingLabel: formatElapsedHours(pendingHours),
  };
}

function shopifyApplySummary(targets = []) {
  const pending = targets
    .map(item => ({ item, info: latestInfo(item) }))
    .map(entry => ({ ...entry, apply: shopifyApplyInfo(entry.item, entry.info) }))
    .filter(entry => entry.apply.needsApply);
  return {
    pending,
    pendingCount: pending.length,
    overdueCount: pending.filter(entry => entry.apply.overdue).length,
  };
}

function shopifyApplyBlockedMessage() {
  if (currentStoreHealth?.stale) {
    return '古いローカル復元データを表示しているため、この画面ではShopify反映を止めています。本番データに戻してから反映してください。';
  }
  if (currentShopifyConnection?.configured === false) {
    return 'この環境はShopify接続が未設定のため、ここでは反映できません。本番の接続済み画面で反映してください。';
  }
  return '';
}

function shopifyApplyDisabledTitle(item = {}, info = latestInfo(item)) {
  const latest = info.latest || {};
  const blocked = shopifyApplyBlockedMessage();
  if (blocked) return blocked;
  if (!latest.checkedAt) return '先にChrome拡張で在庫確認を保存してください';
  if (info.stale) return '最終確認から2週間以上経過しているため、再確認してから反映してください';
  if (!latest.knownRows) return 'SKUごとの在庫が取得できていないため反映できません';
  if (!isShopifyStatusReadyForInventoryApply(item)) return 'Shopifyで公開中と確認できた商品のみ反映できます';
  if (['error', 'protected', 'unknown', 'link_broken'].includes(latest.status)) return '在庫取得に問題があるため反映できません';
  return '反映できません';
}

function renderSummary(summary = {}) {
  els.targetCount.textContent = formatNumber(summary.targetCount || 0);
  els.checkedCount.textContent = formatNumber(summary.checkedCount || 0);
  els.availableCount.textContent = formatNumber(summary.availableCount || 0);
  els.outCount.textContent = formatNumber(summary.outCount || 0);
  els.errorCount.textContent = formatNumber(summary.errorCount || 0);
}

function renderShopifyApplySummary(targets = []) {
  const summary = shopifyApplySummary(targets);
  if (els.unappliedCount) els.unappliedCount.textContent = formatNumber(summary.pendingCount);
  if (els.overdueApplyCount) els.overdueApplyCount.textContent = formatNumber(summary.overdueCount);
  if (!els.shopifyApplyAlert) return;
  if (!summary.pendingCount) {
    els.shopifyApplyAlert.className = 'shopify-apply-alert ok';
    els.shopifyApplyAlert.innerHTML = `
      <strong>Shopify未反映はありません</strong>
      <span>在庫確認済みの商品は、すべてShopify反映済みです。</span>
    `;
    return;
  }
  const isDanger = summary.overdueCount > 0;
  const oldest = [...summary.pending].sort((a, b) => (b.apply.pendingHours || 0) - (a.apply.pendingHours || 0))[0];
  const examples = summary.pending.slice(0, 5).map(entry => {
    const item = entry.item;
    return `${item.productNo || '-'} ${item.title || ''}（${entry.apply.pendingLabel}）`;
  }).join(' / ');
  const headline = isDanger
    ? `Shopify未反映が${formatNumber(summary.pendingCount)}件あります。24時間超えが${formatNumber(summary.overdueCount)}件あります。`
    : `Shopify未反映が${formatNumber(summary.pendingCount)}件あります。24時間以内に反映してください。`;
  const oldestText = oldest ? `最長未反映: ${escapeHtml(oldest.item.productNo || '-')} / ${escapeHtml(oldest.apply.pendingLabel)}` : '';
  const blockedMessage = shopifyApplyBlockedMessage();
  const nextAction = blockedMessage
    || (isDanger
      ? '反映忘れ防止のため、先に「一括Shopify反映」または各行の「反映」を実行してください。'
      : '在庫チェックだけ完了し、Shopifyにはまだ在庫が反映されていない商品があります。');
  els.shopifyApplyAlert.className = `shopify-apply-alert ${isDanger ? 'danger' : 'warn'}`;
  els.shopifyApplyAlert.innerHTML = `
    <div>
      <strong>${escapeHtml(headline)}</strong>
      <span>${escapeHtml(nextAction)}</span>
      ${oldestText ? `<span>${oldestText}</span>` : ''}
    </div>
    <div class="shopify-apply-examples">${escapeHtml(examples)}</div>
  `;
}

function renderStoreSafety(health) {
  if (!els.storeSafety) return;
  if (!health || (!health.isLocalCopy && !health.stale)) {
    els.storeSafety.className = 'store-safety-banner hidden';
    els.storeSafety.innerHTML = '';
    return;
  }
  const isDanger = Boolean(health.stale);
  const maxProduct = health.maxProductNo ? `S${String(health.maxProductNo).padStart(4, '0')}` : '-';
  const maxOrder = health.maxOrderNo ? `#${health.maxOrderNo}` : '-';
  const reasonHtml = isDanger && Array.isArray(health.reasons) && health.reasons.length
    ? `<span class="store-safety-reason">${escapeHtml(health.reasons.join(' / '))}</span>`
    : '';
  els.storeSafety.className = `store-safety-banner ${isDanger ? 'danger' : 'warn'}`;
  els.storeSafety.innerHTML = `
    <div>
      <strong>${isDanger ? '古いローカル保存を検知しました' : 'ローカル復元データを表示中'}</strong>
      <span>${isDanger ? '保存・Shopify反映などの変更操作を停止しています。' : 'これは本番DBではありません。本番との差がないか確認しながら使ってください。'}</span>
      ${reasonHtml}
    </div>
    <div class="store-safety-facts">
      <span>保存元: ${escapeHtml(health.sourceLabel || health.backend || '-')}</span>
      <span>商品: ${formatNumber(health.productCount || 0)}件 / 最新 ${escapeHtml(maxProduct)}</span>
      <span>注文: ${formatNumber(health.orderCount || 0)}件 / 最新 ${escapeHtml(maxOrder)}</span>
    </div>
  `;
}

function setMutationAvailability(health) {
  const blocked = Boolean(health?.stale);
  [els.bulkApply, els.statusRefresh].forEach(button => {
    if (!button) return;
    button.disabled = blocked;
    button.title = blocked ? '古いローカル保存を読んでいるため変更操作を停止しています' : '';
  });
}

function pill(label, tone = 'warn') {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

function renderProductNoCell(item) {
  return `<td class="inventory-no-cell"><strong>${escapeHtml(item.productNo || '-')}</strong></td>`;
}

function renderProductCell(item) {
  const sellingUrl = item.sellingUrl || item.shopifyUrl || '';
  const title = item.title || item.productNo || '商品名未設定';
  const titleHtml = sellingUrl
    ? `<a class="inventory-title-link" href="${escapeHtml(sellingUrl)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>`
    : `<span class="inventory-title-text">${escapeHtml(title)}</span>`;
  return `
    <td class="inventory-product-cell">
      <div class="inventory-product-line">
        <span class="inventory-title-row">${titleHtml}</span>
      </div>
    </td>
  `;
}

function renderStockButton(item, info, detailId) {
  const latest = info.latest || {};
  const skuCount = latest.knownRows || item.skuCount || 0;
  return `
    <td>
      <button class="inventory-stock-toggle ${info.tone}" type="button" data-detail-id="${escapeHtml(detailId)}" aria-expanded="false">
        <span class="inventory-stock-total"><em>総在庫</em><strong>${formatNumber(latest.totalStock)}</strong></span>
        <span class="inventory-stock-sku">SKU ${formatNumber(skuCount)}</span>
        <small>詳細</small>
      </button>
    </td>
  `;
}

function mainInventoryLabel(info) {
  const latest = info.latest || {};
  if (info.stale) return '要確認';
  if (!latest.checkedAt) return '未確認';
  if (latest.status === 'available') return '在庫あり';
  if (latest.status === 'partial') return '一部在庫切れ';
  if (latest.status === 'out') return '在庫なし';
  if (latest.status === 'link_broken') return 'リンク切れ';
  if (latest.status === 'protected') return '取得制限';
  if (latest.status === 'error') return '取得失敗';
  return info.label || '要確認';
}

function renderCondition(label, tone = 'neutral') {
  return `<span class="inventory-condition ${tone}">${escapeHtml(label)}</span>`;
}

function renderStateCell(item, info) {
  return `
    <td class="inventory-status-cell">
      <strong class="inventory-status-main ${info.tone}">${escapeHtml(mainInventoryLabel(info))}</strong>
    </td>
  `;
}

function cleanProductMemo(value) {
  const memo = String(value || '').trim();
  if (!memo) return '';
  if (/^Chrome拡張機能で取得/.test(memo)) return '';
  return memo;
}

function renderShopifyCell(item) {
  const info = shopifyDisplayInfo(item);
  return `<td class="inventory-shopify-cell" title="${escapeHtml(info.title)}"><div class="inventory-condition-row">${renderCondition(info.label, info.tone)}</div></td>`;
}

function renderCheckCell(item, info) {
  const latest = info.latest || {};
  const checks = [];
  if (info.stale) {
    checks.push(renderCondition('2週間超', 'warn'));
  } else if (latest.checkedAt) {
    checks.push(renderCondition('確認済み', 'ok'));
  }
  if (item.linkStatus === 'broken') checks.push(renderCondition('リンク切れ', 'danger'));
  if (item.shopifySync?.lastError) checks.push(renderCondition('Shopifyエラー', 'danger'));
  return `<td class="inventory-check-cell">${checks.length ? checks.join('') : '<span class="muted">-</span>'}</td>`;
}

function variantStockLabel(size) {
  if (size.stockQuantity === null || size.stockQuantity === undefined || size.stockQuantity === '') return '未確認';
  const number = Number(size.stockQuantity);
  if (!Number.isFinite(number)) return String(size.stockQuantity);
  return number <= 0 ? '在庫なし' : `在庫 ${formatNumber(number)}`;
}

function variantStockTone(size) {
  if (size.stockQuantity === null || size.stockQuantity === undefined || size.stockQuantity === '') return 'neutral';
  return Number(size.stockQuantity || 0) <= 0 ? 'danger' : 'ok';
}

function renderVariantDetails(item) {
  const groups = Array.isArray(item.variants) ? item.variants : [];
  if (!groups.length) {
    return '<div class="inventory-detail-empty">カラー・サイズ情報がありません。</div>';
  }
  return `
    <div class="inventory-detail-panel">
      <div class="inventory-detail-head">
        <strong>カラー・サイズ在庫</strong>
        <span>SKUごとの保存済み在庫を表示します。</span>
      </div>
      <div class="inventory-variant-groups">
        ${groups.map(group => `
          <div class="inventory-variant-group">
            <div class="inventory-variant-color">
              ${renderVariantColorImage(group)}
              <div>
                <strong>${escapeHtml(group.color || 'カラー未設定')}</strong>
                ${group.originalColor && group.originalColor !== group.color ? `<span>${escapeHtml(group.originalColor)}</span>` : ''}
              </div>
            </div>
            <div class="inventory-size-grid">
              ${(group.sizes || []).map(size => `
                <div class="inventory-size-chip ${variantStockTone(size)}">
                  <strong>${escapeHtml(size.size || 'ONE')}</strong>
                  <span>${escapeHtml(size.sku || 'SKUなし')}</span>
                  <em>${escapeHtml(variantStockLabel(size))}</em>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderMemoCell(item) {
  const memo = cleanProductMemo(item.memo);
  const productId = item.id || '';
  return `
    <td class="inventory-user-memo-cell">
      <div class="inventory-memo-editor">
        <input
          class="inventory-note-input"
          type="text"
          value="${escapeHtml(memo)}"
          data-product-id="${escapeHtml(productId)}"
          data-original="${escapeHtml(memo)}"
          maxlength="80"
        >
        <button class="ghost compact-button btn-save-memo" type="button" data-product-id="${escapeHtml(productId)}">保存</button>
      </div>
    </td>
  `;
}

function renderLinkCell(sourceUrl, adminUrl) {
  const source = sourceUrl
    ? `<a class="table-link-button" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">仕入れ元</a>`
    : '<span class="inventory-missing-link">仕入れ元なし</span>';
  const admin = adminUrl
    ? `<a class="table-link-button secondary" href="${escapeHtml(adminUrl)}" target="_blank" rel="noopener">管理画面</a>`
    : '<span class="inventory-missing-link">管理なし</span>';
  return `<td><div class="inventory-link-group">${source}${admin}</div></td>`;
}

function renderAppliedDateCell(applyInfo) {
  if (applyInfo.needsApply) {
    return `<td class="inventory-applied-date-cell"><span class="inventory-apply-state ${applyInfo.overdue ? 'danger' : 'warn'}">未反映</span></td>`;
  }
  return `<td class="inventory-applied-date-cell">${escapeHtml(formatAppliedDate(applyInfo.appliedAt))}</td>`;
}

function renderAppliedAgeCell(applyInfo) {
  if (applyInfo.needsApply) {
    const label = `未反映 ${applyInfo.pendingLabel}`;
    return `<td class="inventory-applied-age-cell"><span class="inventory-age ${applyInfo.overdue ? 'danger' : 'warn'}">${escapeHtml(label)}</span></td>`;
  }
  if (!applyInfo.checkedAt && !applyInfo.appliedAt) {
    return '<td class="inventory-applied-age-cell"><span class="inventory-age neutral">未確認</span></td>';
  }
  const age = appliedAgeInfo(applyInfo.appliedAt);
  return `<td class="inventory-applied-age-cell"><span class="inventory-age ${age.tone}">${escapeHtml(age.label)}</span></td>`;
}

function targetSortValue(item, key) {
  const info = latestInfo(item);
  const latest = info.latest || {};
  const apply = shopifyApplyInfo(item, info);
  if (key === 'productNo') return productNoValue(item.productNo);
  if (key === 'title') return String(item.title || '');
  if (key === 'inventory') return { danger: 0, warn: 1, ok: 2 }[info.tone] ?? 1;
  if (key === 'shopify') return String(item.shopifyStatusLabel || '');
  if (key === 'check') return latest.checkedAt ? new Date(latest.checkedAt).getTime() : 0;
  if (key === 'stock') return Number(latest.totalStock || 0);
  if (key === 'checkedAt') return latest.checkedAt ? new Date(latest.checkedAt).getTime() : 0;
  if (key === 'appliedAt') return apply.appliedAt ? new Date(apply.appliedAt).getTime() : 0;
  if (key === 'appliedDays') {
    if (apply.overdue) return -2;
    if (apply.needsApply) return -1;
    return elapsedDays(apply.appliedAt) ?? 99999;
  }
  return String(item.productNo || '');
}

function sortedTargets() {
  const { sortKey, sortDir } = inventoryState;
  const direction = sortDir === 'asc' ? 1 : -1;
  return [...inventoryState.targets].sort((a, b) => {
    const av = targetSortValue(a, sortKey);
    const bv = targetSortValue(b, sortKey);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
    return String(av).localeCompare(String(bv), 'ja') * direction;
  });
}

function updateSortHeaders() {
  document.querySelectorAll('.sort-header').forEach(button => {
    const active = button.dataset.sort === inventoryState.sortKey;
    button.classList.toggle('active', active);
    button.dataset.dir = active ? inventoryState.sortDir : '';
  });
}

function renderRows(targets = []) {
  if (!targets.length) {
    els.rows.innerHTML = '<tr><td colspan="12" class="muted">対象商品がありません。</td></tr>';
    return;
  }
  els.rows.innerHTML = targets.map(item => {
    const info = latestInfo(item);
    const latest = info.latest || {};
    const detailId = `inventory-detail-${safeId(item.productNo || item.id)}`;
    const sourceUrl = item.sourceUrl || '';
    const adminUrl = item.shopifyAdminUrl || '';
    const applyInfo = shopifyApplyInfo(item, info);
    const rowTone = applyInfo.overdue || info.tone === 'danger'
      ? 'danger'
      : (applyInfo.needsApply || info.tone === 'warn' ? 'warn' : 'ok');
    const applyButtonClass = applyInfo.overdue ? 'danger' : (applyInfo.needsApply ? 'warn' : '');
    const applyTitle = info.canApply ? 'Shopifyへ在庫を反映します' : shopifyApplyDisabledTitle(item, info);
    return `
      <tr class="inventory-row ${rowTone}">
        ${renderProductNoCell(item)}
        ${renderProductCell(item)}
        ${renderShopifyCell(item)}
        ${renderStateCell(item, info)}
        ${renderCheckCell(item, info)}
        ${renderStockButton(item, info, detailId)}
        <td>${escapeHtml(formatDateTime(latest.checkedAt))}</td>
        ${renderLinkCell(sourceUrl, adminUrl)}
        ${renderAppliedDateCell(applyInfo)}
        ${renderAppliedAgeCell(applyInfo)}
        ${renderMemoCell(item)}
        <td><button class="ghost compact-button btn-apply-inventory ${applyButtonClass}" data-product-no="${escapeHtml(item.productNo || '')}" title="${escapeHtml(applyTitle)}" ${info.canApply ? '' : 'disabled'}>反映</button></td>
      </tr>
      <tr id="${escapeHtml(detailId)}" class="inventory-detail-row hidden">
        <td colspan="12">${renderVariantDetails(item)}</td>
      </tr>
    `;
  }).join('');
  updateSortHeaders();
}

async function loadInventory() {
  els.rows.innerHTML = '<tr><td colspan="12" class="muted">読み込み中...</td></tr>';
  const [health, data] = await Promise.all([
    api('/api/health').catch(() => null),
    api('/api/inventory-checks'),
  ]);
  currentStoreHealth = health?.storeHealth || null;
  currentShopifyConnection = data.shopifyConnection || null;
  renderStoreSafety(currentStoreHealth);
  setMutationAvailability(currentStoreHealth);
  renderSummary(data.summary || {});
  inventoryState.targets = data.targets || [];
  renderShopifyApplySummary(inventoryState.targets);
  renderRows(sortedTargets());
}

async function saveInventoryMemo(input, button) {
  const productId = input?.dataset.productId || button?.dataset.productId || '';
  if (!productId || !input) {
    showToast('メモを保存する商品が見つかりません');
    return;
  }
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '保存中';
  try {
    const memo = input.value.trim();
    await api(`/api/products/${encodeURIComponent(productId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo }),
    });
    input.dataset.original = memo;
    input.classList.remove('is-dirty');
    button.textContent = '保存済み';
    showToast('メモを保存しました');
    setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
    }, 800);
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
    button.textContent = original;
  }
}

async function applyInventoryToShopify(productNo, button) {
  if (!productNo) return;
  const ok = window.confirm(`${productNo} の確認済み在庫をShopifyへ反映します。よろしいですか？`);
  if (!ok) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '反映中';
  try {
    const data = await api('/api/inventory-checks/shopify-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productNo }),
    });
    showToast(`Shopify反映完了: ${productNo} / SKU ${formatNumber(data.inventory?.updated || 0)}`);
    await loadInventory();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function applyBulkInventoryToShopify(button) {
  const applyableCount = document.querySelectorAll('.btn-apply-inventory:not(:disabled)').length;
  if (!applyableCount) {
    showToast('一括反映できる確認済み在庫がありません');
    return;
  }
  const ok = window.confirm(`${formatNumber(applyableCount)}件の確認済み在庫をShopifyへ一括反映します。よろしいですか？`);
  if (!ok) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '一括反映中';
  try {
    const data = await api('/api/inventory-checks/shopify-apply-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    showToast(`一括反映完了: 成功 ${formatNumber(data.successCount || 0)}件 / 失敗 ${formatNumber(data.failedCount || 0)}件`);
    await loadInventory();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function refreshShopifyStatuses(button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '状態更新中';
  try {
    const data = await api('/api/inventory-checks/shopify-status-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (data.failedCount) {
      showToast(`一括確認に失敗: ${formatNumber(data.failedCount)}件。Shopify接続設定を確認してください。`);
    } else {
      showToast(`Shopify状態を保存しました: ${formatNumber(data.successCount || 0)}件 / アーカイブ ${formatNumber(data.archivedCount || 0)}件`);
    }
    await loadInventory();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function downloadInventoryExcel() {
  window.location.href = '/api/inventory-checks/export';
}

document.addEventListener('DOMContentLoaded', () => {
  els.reload.addEventListener('click', () => {
    loadInventory().then(() => showToast('更新しました')).catch(error => showToast(error.message));
  });
  els.export.addEventListener('click', downloadInventoryExcel);
  els.bulkApply.addEventListener('click', () => applyBulkInventoryToShopify(els.bulkApply));
  els.statusRefresh.addEventListener('click', () => refreshShopifyStatuses(els.statusRefresh));
  document.querySelector('.inventory-table')?.addEventListener('click', event => {
    const header = event.target.closest('.sort-header');
    if (!header) return;
    const key = header.dataset.sort || 'productNo';
    if (inventoryState.sortKey === key) {
      inventoryState.sortDir = inventoryState.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      inventoryState.sortKey = key;
      inventoryState.sortDir = key === 'productNo' ? 'desc' : 'asc';
    }
    renderRows(sortedTargets());
  });
  els.rows.addEventListener('click', event => {
    const memoButton = event.target.closest('.btn-save-memo');
    if (memoButton) {
      const editor = memoButton.closest('.inventory-memo-editor');
      const input = editor?.querySelector('.inventory-note-input');
      saveInventoryMemo(input, memoButton);
      return;
    }
    const toggle = event.target.closest('.inventory-stock-toggle');
    if (toggle) {
      const detail = document.getElementById(toggle.dataset.detailId || '');
      if (!detail) return;
      const nextExpanded = detail.classList.contains('hidden');
      detail.classList.toggle('hidden', !nextExpanded);
      toggle.setAttribute('aria-expanded', String(nextExpanded));
      return;
    }
    const button = event.target.closest('.btn-apply-inventory');
    if (!button) return;
    applyInventoryToShopify(button.dataset.productNo || '', button);
  });
  els.rows.addEventListener('input', event => {
    const input = event.target.closest('.inventory-note-input');
    if (!input) return;
    input.classList.toggle('is-dirty', input.value.trim() !== (input.dataset.original || '').trim());
  });
  els.rows.addEventListener('keydown', event => {
    const input = event.target.closest('.inventory-note-input');
    if (!input || event.key !== 'Enter') return;
    const editor = input.closest('.inventory-memo-editor');
    const button = editor?.querySelector('.btn-save-memo');
    if (!button) return;
    event.preventDefault();
    saveInventoryMemo(input, button);
  });
  loadInventory().catch(error => {
    els.rows.innerHTML = `<tr><td colspan="12" class="muted">${escapeHtml(error.message)}</td></tr>`;
  });
});
