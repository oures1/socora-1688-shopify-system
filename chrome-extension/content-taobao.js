// content-taobao.js - Taobao / Tmall商品ページ専用スクレイパー

(function () {
  'use strict';

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'source_page_info') {
      sendResponse({ success: true, data: getSourcePageInfo() });
      return true;
    }
    if (request.action === 'scrape_taobao') {
      scrapeProduct().then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
  });

  function getSourcePageInfo() {
    return {
      url: window.location.href,
      title: document.title || '',
      site: detectSite(),
      itemId: extractItemId(),
      ts: Date.now(),
    };
  }

  function publishSourcePageInfo() {
    try {
      chrome.runtime.sendMessage({ action: 'sourcePageSeen', data: getSourcePageInfo() }, () => {
        void chrome.runtime.lastError;
      });
    } catch(e) {}
  }

  [250, 1200, 3000].forEach(delay => setTimeout(publishSourcePageInfo, delay));
  setInterval(publishSourcePageInfo, 15000);

  const VARIANT_SPECS = [
    { label: '颜色', type: 'COLOR', re: /^(主要颜色|主要顏色|颜色|顏色|颜色分类|颜色分類)$/ },
    { label: '尺码', type: 'SIZE', re: /^(尺码|尺碼|尺寸|规格|規格|SIZE)$/i },
  ];
  const SIZE_BASE_SOURCE = '(XXXS|XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|6XL|7XL|8XL|均码|均碼|[\\d.]+码|[\\d.]+碼)';
  const BAD_TITLE_RE = /淘宝网首页|已买到的宝贝|我的淘宝|购物车|收藏夹|免费开店|千牛卖家中心|帮助中心|用户评价|参数信息|图文详情|本店推荐|看了又看|搜索|搜本店|客服|进店|商品图片下载|评价\s*[・:：]?\s*\d/i;
  const BAD_OPTION_RE = /用户评价|参数信息|图文详情|本店推荐|看了又看|商品评价|热门推荐|搭配组货|数量|购买|加入购物车|领券购买|收藏|客服|进店|搜索|价格|优惠|券后|到手价|预估|预计|发货|退货|信用卡支付|袖型|收口袖|防晒工艺|涂层型|衣门襟|拉链|版型|宽松型|款式细节|连帽|工艺|面料|材质|其他|是否商场同款|适用对象|青少年|参数|属性/i;
  const BAD_COLOR_OPTION_RE = /原创|刺绣|复古|短袖|长袖|T恤|衬衫|外套|裤|裙|女|男|宽松|百搭|高级感|结束|倒计时|优惠|券后|立减|包邮|发货|退货|广东|广州|青岛|杭州|浙江|福建|省|市|至|已售|评价|好评|加购|客服|进店|搜索|小时|分钟|信用卡|支付|保障|服务|数量|购买/i;
  const COLOR_KEYWORD_RE = /(象牙白|米白|乳白|奶白|本白|白色|黑色|灰色|深灰色|浅灰色|蓝灰色|蓝灰|冰川灰|火山灰|烟灰|藏青色|藏青|深蓝色|深蓝|浅蓝色|浅蓝|蓝色|紫色|红色|绿色|军绿色|军绿|橄榄绿|深橄榄绿|森林绿|青柠绿|杏色|卡其色|咖啡色|棕色|驼色|黄色|粉色|玫粉色|玫粉|橙色|落日橙|曜石黑|烟墨|砂白|米色|水洗蓝|雾蓝|湖蓝|天蓝|浅紫|深紫|酒红|砖红|墨绿|浅绿|荧光绿|色|黑|白|灰|蓝|藍|绿|綠|紫|红|紅|黄|黃|粉|棕|咖|橙|青|藏|杏|米|卡其|军|軍|象牙|曜石|橄榄|森林|砂)/i;

  async function scrapeProduct() {
    const dataScript = findDataScript();
    return {
      success: true,
      data: {
        title: extractTitle(dataScript),
        prices: extractPrice(dataScript),
        variants: extractVariants(),
        skuStocks: extractSkuStocks(),
        skus: extractSkuRows(),
        attributes: {},
        paramText: extractParamText(),
        sizeTables: extractTablesText(),
        detailText: extractDetailText(),
        pageText: extractRelevantPageText(),
        url: window.location.href,
        site: detectSite(),
        itemId: extractItemId(),
      }
    };
  }

  function findDataScript() {
    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '');
    return scripts.find(s => /sku|Sku|itemTitle|rawTitle|price/i.test(s) && s.length > 1000) ||
      scripts.reduce((a, b) => a.length > b.length ? a : b, '');
  }

  function extractTitle(dataScript) {
    const scriptTitleRe = /"(?:itemTitle|rawTitle|auctionTitle|mainTitle|productTitle|shortTitle)"\s*:\s*"([^"]{5,300})"/g;
    for (const match of String(dataScript || '').matchAll(scriptTitleRe)) {
      const text = cleanupTitle(decodeUnicode(match[1]));
      if (isLikelyProductTitle(text)) return text;
    }
    const selectors = [
      'h1',
      '[class*="ItemTitle"]',
      '[class*="item-title"]',
      '[class*="main-title"]',
      '[class*="MainTitle"]',
      '[class*="Title"] h1',
      '[class*="title"] h1',
      '[class*="title"]',
    ];
    const candidates = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const text = cleanupTitle(el?.textContent || '');
        if (!isLikelyProductTitle(text)) return;
        const rect = getRect(el);
        candidates.push({ text, score: scoreTitleCandidate(text, rect) });
      });
      if (candidates.length > 0) break;
    }
    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0]) return candidates[0].text;
    const fallbackTitle = cleanupTitle(document.title.replace(/\s*[-|–—].*$/, ''));
    return isLikelyProductTitle(fallbackTitle) ? fallbackTitle : '';
  }

  function cleanupTitle(value) {
    return normalizeInlineText(decodeHtml(value || ''))
      .replace(/淘宝网|天猫|tmall|taobao/ig, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isLikelyProductTitle(text) {
    const value = normalizeInlineText(text || '');
    if (value.length < 8 || value.length > 180) return false;
    if (BAD_TITLE_RE.test(value)) return false;
    if (/[¥￥]\s*\d/.test(value)) return false;
    if (/^\d+[+人件]*$/.test(value)) return false;
    return /[\u4e00-\u9fffA-Za-z]/.test(value);
  }

  function scoreTitleCandidate(text, rect) {
    let score = Math.min(text.length, 90);
    if (rect && rect.top >= 0 && rect.top <= 900) score += 80;
    if (rect && rect.left > 250) score += 20;
    if (/[\u4e00-\u9fff]/.test(text)) score += 20;
    return score;
  }

  function extractPrice(dataScript) {
    const prices = [];
    const add = (value, qty = '', priority = 50) => {
      const p = parseFloat(String(value || '').replace(/[^\d.]/g, ''));
      if (!Number.isFinite(p) || p <= 0 || p >= 2000) return;
      const price = p.toFixed(2);
      if (!prices.some(item => item.price === price && item.qty === qty)) {
        prices.push({ price, qty, priority });
      }
    };

    const visibleText = normalizeText(document.body?.innerText || '', 24000).replace(/\n+/g, ' ');
    [
      { re: /券后\s*[¥￥]\s*([1-9]\d{0,3}(?:\s*\.\s*\d{1,2})?)/g, qty: '券后', priority: 1 },
      { re: /到手价\s*[¥￥]\s*([1-9]\d{0,3}(?:\s*\.\s*\d{1,2})?)/g, qty: '到手价', priority: 2 },
      { re: /优惠前\s*[¥￥]\s*([1-9]\d{0,3}(?:\s*\.\s*\d{1,2})?)/g, qty: '优惠前', priority: 8 },
      { re: /[¥￥]\s*([1-9]\d{0,3}(?:\s*\.\s*\d{1,2})?)\s*(?:1件|1\s*件|1件起|1件起批|1件价格)/g, qty: '1件', priority: 10 },
      { re: /(?:价格|促销价|售价)[^\d¥￥]{0,20}[¥￥]\s*([1-9]\d{0,3}(?:\s*\.\s*\d{1,2})?)/g, qty: '表示価格', priority: 20 },
    ].forEach(({ re, qty, priority }) => {
      [...visibleText.matchAll(re)].forEach(match => add(match[1], qty, priority));
    });

    for (const sel of ['[class*="Price"]','[class*="price"]','[class*="money"]','[class*="Money"]']) {
      document.querySelectorAll(sel).forEach(el => {
        const text = normalizeInlineText(el.textContent || '');
        if (text.length <= 60) add(text, '表示価格', 30);
      });
    }

    [...String(dataScript || '').matchAll(/"(?:price|salePrice|couponPrice|originPrice|promotionPrice)"\s*:\s*"?([1-9]\d{0,3}(?:\.[\d]{1,2})?)"?/g)]
      .forEach(match => add(match[1], 'データ内価格', 70));

    return prices.sort((a, b) => (a.priority - b.priority) || (parseFloat(b.price) - parseFloat(a.price)));
  }

  function extractVariants() {
    return VARIANT_SPECS.map(spec => {
      const labelEl = findVariantLabelElement(spec.re);
      const options = labelEl ? collectOptionsNearLabel(labelEl, spec.type) : [];
      const images = {};
      options.forEach(option => {
        if (option.imageUrl) images[option.name] = option.imageUrl;
      });
      return {
        label: spec.label,
        values: options.map(option => option.name),
        zeroStock: options.filter(option => option.outOfStock).map(option => option.name),
        images,
      };
    }).filter(variant => variant.values.length > 0);
  }

  function findVariantLabelElement(labelRe) {
    const elements = Array.from(document.querySelectorAll('span,div,label,p'));
    return elements.find(el => {
      if (!isVisible(el)) return false;
      const directText = normalizeInlineText(Array.from(el.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent || '')
        .join(' ')) || normalizeInlineText(el.textContent || '');
      return directText.length <= 10 && labelRe.test(directText);
    }) || null;
  }

  function collectOptionsNearLabel(labelEl, type) {
    const labelRect = getRect(labelEl);
    if (!labelRect) return [];
    const nextLabelTop = findNextVariantLabelTop(labelRect.top);
    const candidates = Array.from(document.querySelectorAll('button,li,a,span,div,[role="button"],[class*="sku"],[class*="Sku"],[class*="value"],[class*="Value"],[class*="prop"],[class*="Prop"],[class*="item"],[class*="Item"]'));
    const result = [];
    const seen = new Map();
    candidates
      .map(el => ({ el, rect: getRect(el) }))
      .filter(item => isNearVariantLabel(item.el, item.rect, labelRect, nextLabelTop, type))
      .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left))
      .forEach(({ el }) => {
        const option = extractDomOption(el, type);
        if (!option) return;
        const existing = seen.get(option.name);
        if (existing) {
          if (!existing.imageUrl && option.imageUrl) existing.imageUrl = option.imageUrl;
          existing.outOfStock = existing.outOfStock || option.outOfStock;
          return;
        }
        seen.set(option.name, option);
        result.push(option);
      });
    return result.slice(0, type === 'SIZE' ? 30 : 80);
  }

  function findNextVariantLabelTop(currentTop) {
    const tops = [];
    for (const spec of VARIANT_SPECS) {
      const el = findVariantLabelElement(spec.re);
      const rect = el ? getRect(el) : null;
      if (rect && rect.top > currentTop + 12) tops.push(rect.top);
    }
    return tops.length ? Math.min(...tops) : null;
  }

  function isNearVariantLabel(el, rect, labelRect, nextLabelTop, type) {
    if (!rect || !isVisible(el)) return false;
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.top < labelRect.top - 24) return false;
    const maxDistance = type === 'SIZE' ? 300 : 640;
    const bottomLimit = nextLabelTop ? Math.min(nextLabelTop - 8, labelRect.top + maxDistance) : labelRect.top + maxDistance;
    if (rect.top > bottomLimit) return false;
    const labelRightGuard = labelRect.width < 180 ? labelRect.right - 4 : labelRect.left - 4;
    if (rect.right < labelRightGuard) return false;
    const rawText = optionRawText(el, type);
    if (!rawText || rawText.length > 120) return false;
    const lineCount = (el.innerText || el.textContent || '').split('\n').map(line => line.trim()).filter(Boolean).length;
    if (lineCount > 3) return false;
    const nestedOptions = el.querySelectorAll('button,[role="button"],li,img,[class*="sku"],[class*="Sku"]').length;
    if (!/^(BUTTON|LI|A)$/i.test(el.tagName) && nestedOptions > 2) return false;
    const text = cleanDomOptionText(rawText, type);
    if (!isLikelyOptionName(text, type)) return false;
    if (type === 'SIZE' && rect.top > labelRect.top + 260) return false;
    if (type === 'COLOR') {
      const hasImage = !!el.querySelector('img');
      const hasColorHint = isColorLikeName(text) || /(现货|現貨|预售|預售|入荷|stock)/i.test(text);
      if (!hasImage && !hasColorHint) return false;
    }
    return true;
  }

  function extractDomOption(el, type) {
    const rawText = optionRawText(el, type);
    const name = cleanDomOptionText(rawText, type);
    if (!isLikelyOptionName(name, type)) return null;
    const img = el.querySelector('img');
    const imageUrl = normalizeImageUrl(img?.currentSrc || img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || img?.getAttribute('data-ks-lazyload') || '');
    const stateText = `${el.className || ''} ${el.getAttribute('aria-disabled') || ''} ${el.getAttribute('disabled') || ''} ${rawText}`;
    const outOfStock = /disabled|disable|sold|out|unavailable|库存不足|缺货|售罄|无货|在庫なし/i.test(stateText);
    return { name, imageUrl, outOfStock };
  }

  function optionRawText(el, type = '') {
    if (type === 'COLOR') {
      const visibleColor = pickColorOptionText([
        el.getAttribute('title'),
        el.getAttribute('aria-label'),
        el.innerText || el.textContent || '',
      ]);
      if (visibleColor) return visibleColor;
      const imageColor = pickColorOptionText([
        el.querySelector('img')?.alt,
        el.querySelector('img')?.title,
      ]);
      return imageColor || '';
    }
    const parts = [
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
      el.innerText || el.textContent || '',
      el.querySelector('img')?.alt,
      el.querySelector('img')?.title,
    ];
    const text = uniqueParts(parts).join(' ');
    if (type === 'SIZE') return trimSizeOptionText(text);
    return text;
  }

  function cleanDomOptionText(text, type) {
    const normalized = normalizeInlineText(text || '')
      .replace(/全网低价|全網低價|近期热销|近期熱銷|热销|熱銷|促销|促銷|低价|低價|已选|已選|库存不足|缺货|售罄|无货|有货|在庫なし|拍三免一|按原价计算差价|万人加购|万\+人加购|千人加购|千人加購/g, '')
      .trim();
    if (type === 'SIZE') {
      const detailed = normalizeSizeOptionName(normalized);
      if (detailed) return detailed;
      const parts = uniqueParts(normalized.split(/\s+/));
      const size = parts.map(part => normalizeSizeOptionName(part)).find(part => isLikelyOptionName(part, 'SIZE'));
      return size || '';
    }
    const color = cleanColorName(normalized);
    return isLikelyOptionName(color, 'COLOR') ? color : '';
  }

  function trimColorOptionText(text) {
    return colorCandidateFromText(text) || '';
  }

  function trimSizeOptionText(text) {
    const normalized = normalizeInlineText(text || '');
    return normalizeSizeOptionName(normalized) || normalized;
  }

  function cleanSizeWithDetail(text) {
    return normalizeSizeOptionName(text);
  }

  function normalizeSizeOptionName(text) {
    const normalized = normalizeInlineText(text || '')
      .replace(/[「"“『」"”』]/g, ' ')
      .replace(/^[\s()（）]+|[\s()（）]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return '';
    const baseOnly = normalized.match(new RegExp(`^${SIZE_BASE_SOURCE}$`, 'i'));
    if (baseOnly) return formatSizeBase(baseOnly[1]);
    const m = normalized.match(new RegExp(`^${SIZE_BASE_SOURCE}\\s*[「"'“”『(（]?\\s*(.{1,70}?)\\s*[」"'”』)）]*$`, 'i'));
    if (!m) return '';
    const base = formatSizeBase(m[1]);
    const detail = normalizeInlineText(m[2] || '')
      .replace(/^[\s()（）]+|[\s()（）]+$/g, '')
      .replace(/[()（）]/g, '')
      .trim();
    if (!detail || BAD_OPTION_RE.test(detail) || /[¥￥]/.test(detail)) return base;
    if (detail.toUpperCase() === base.toUpperCase()) return base;
    if (!/[\dA-Za-z]/.test(detail)) return base;
    return `${base}（${detail}）`;
  }

  function formatSizeBase(value) {
    const text = String(value || '').trim();
    if (/^[A-Za-z0-9.]+(?:码|碼)?$/i.test(text)) return text.toUpperCase();
    return text;
  }

  function cleanColorName(text) {
    return normalizeInlineText(text || '')
      .replace(/[「"“『].*?[」"”』]/g, '')
      .replace(/[（(](?:现货|現貨|预售|預售|在庫あり|在庫なし|stock)[）)]/ig, '')
      .replace(/\b(?:现货|現貨|预售|預售|在庫あり|在庫なし|stock)\b/ig, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pickColorOptionText(values) {
    for (const value of uniqueWholeParts(values)) {
      const color = colorCandidateFromText(value);
      if (color && isColorLikeName(color)) return color;
    }
    return '';
  }

  function colorCandidateFromText(value) {
    const raw = normalizeInlineText(value || '')
      .replace(/全网低价|全網低價|近期热销|近期熱銷|热销|熱銷|促销|促銷|低价|低價|已选|已選|库存不足|缺货|售罄|无货|有货|在庫なし|拍三免一|按原价计算差价|万人加购|万\+人加购|千人加购|千人加購/g, '')
      .trim();
    if (!raw) return '';
    const beforeDetail = cleanColorName(raw.split(/[「"'“”『(（]/)[0] || raw);
    if (isColorLikeName(beforeDetail)) return beforeDetail;
    const cleaned = cleanColorName(raw);
    if (isColorLikeName(cleaned)) return cleaned;
    return '';
  }

  function isColorLikeName(value) {
    const text = normalizeInlineText(value || '');
    if (!text || text.length > 24) return false;
    if (BAD_COLOR_OPTION_RE.test(text)) return false;
    if (/颜色|顏色|尺码|尺碼|尺寸|数量|數量|购买|購買|购物车|購物車|收藏|客服|¥|￥|\d+\s*人|\d+\s*件|\d{1,2}\s*月|\d{1,2}\s*点|结束|至/.test(text)) return false;
    return COLOR_KEYWORD_RE.test(text);
  }

  function isLikelyOptionName(name, type) {
    const text = String(name || '').trim();
    if (!text || text.length > 60) return false;
    if (BAD_OPTION_RE.test(text)) return false;
    if (/颜色|顏色|尺码|尺碼|尺寸|数量|數量|购买|購買|购物车|購物車|收藏|客服|¥|￥|\d+\s*人|\d+\s*件/.test(text)) return false;
    if (type === 'SIZE') {
      return new RegExp(`^${SIZE_BASE_SOURCE}(?:（[^）]{2,70}）)?$`, 'i').test(text);
    }
    if (type === 'COLOR') return isColorLikeName(text);
    if (/^(XXXS|XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL)$/i.test(text)) return false;
    return /[\u4e00-\u9fffA-Za-z]/.test(text);
  }

  function uniqueParts(values) {
    const seen = new Set();
    return values.flatMap(value => String(value || '').split(/\s+/))
      .map(value => normalizeInlineText(value))
      .filter(Boolean)
      .filter(value => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function uniqueWholeParts(values) {
    const seen = new Set();
    return values
      .map(value => normalizeInlineText(value || ''))
      .filter(Boolean)
      .filter(value => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function isVisible(el) {
    const rect = getRect(el);
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0;
  }

  function getRect(el) {
    try {
      const rect = el?.getBoundingClientRect?.();
      if (!rect) return null;
      return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    } catch(e) {
      return null;
    }
  }

  function extractSkuStocks() {
    const sizeVariant = extractVariants().find(v => v.label === '尺码');
    if (!sizeVariant) return [];
    return sizeVariant.values.map(size => ({
      spec: size,
      parts: [size],
      price: '',
      stock: sizeVariant.zeroStock.includes(size) ? '0' : '',
      stockNumber: sizeVariant.zeroStock.includes(size) ? 0 : null,
      outOfStock: sizeVariant.zeroStock.includes(size),
    }));
  }

  function extractSkuRows() {
    return extractSkuStocks().slice(0, 300).map(row => ({
      spec: row.spec,
      price: String(row.price || '').trim(),
      stock: String(row.stock ?? '').trim(),
      outOfStock: row.outOfStock,
    })).filter(row => row.spec || row.price || row.stock);
  }

  function extractParamText() {
    for (const sel of ['[class*="attribute"]','[class*="Attribute"]','[class*="params"]','[class*="Params"]','[class*="spec"]']) {
      const el = document.querySelector(sel);
      if (el) {
        const text = normalizeText(el.innerText || '', 12000);
        if (text.length > 30) return text;
      }
    }
    return '';
  }

  function extractTablesText() {
    const blocks = [];
    document.querySelectorAll('table').forEach((table, idx) => {
      const rows = Array.from(table.querySelectorAll('tr')).map(tr => {
        return Array.from(tr.querySelectorAll('th,td'))
          .map(td => normalizeInlineText(td.innerText || td.textContent || ''))
          .filter(Boolean)
          .join(' | ');
      }).filter(Boolean);
      if (rows.length > 0) blocks.push(`表${idx + 1}\n${rows.join('\n')}`);
    });

    const keyword = /(尺码|尺碼|尺寸|规格|胸围|衣长|肩宽|腰围|臀围|裤长|袖长|下摆|CM|cm)/;
    ['[class*="size"]','[class*="Size"]','[class*="table"]','[class*="Table"]','[class*="detail"]','[class*="Detail"]']
      .forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const text = normalizeText(el.innerText || el.textContent || '', 8000);
          if (text.length > 30 && keyword.test(text) && text.split('\n').length >= 2) blocks.push(text);
        });
      });
    return uniqueBlocks(blocks).slice(0, 20);
  }

  function extractDetailText() {
    const blocks = [];
    ['#description','[id*="detail"]','[id*="description"]','[class*="detail"]','[class*="Detail"]','[class*="desc"]','[class*="Desc"]']
      .forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const text = normalizeText(el.innerText || el.textContent || '', 16000);
          if (text.length > 50) blocks.push(text);
        });
      });
    return uniqueBlocks(blocks).slice(0, 8).join('\n\n---\n\n').slice(0, 30000);
  }

  function extractRelevantPageText() {
    return normalizeText(document.body?.innerText || '', 40000);
  }

  function detectSite() {
    if (/tmall\.com/i.test(location.hostname)) return 'tmall';
    return 'taobao';
  }

  function extractItemId() {
    try {
      const url = new URL(location.href);
      return url.searchParams.get('id') || url.searchParams.get('itemId') || url.searchParams.get('skuId') || '';
    } catch(e) {
      return '';
    }
  }

  function normalizeImageUrl(value) {
    if (!value) return '';
    const text = String(value).trim();
    if (!text) return '';
    const decoded = decodeUnicode(text)
      .replace(/\\\//g, '/')
      .replace(/^url\(["']?|["']?\)$/g, '')
      .trim();
    if (decoded.startsWith('//')) return 'https:' + decoded;
    if (/^https?:\/\//i.test(decoded)) return decoded;
    try { return new URL(decoded, location.href).href; } catch(e) { return ''; }
  }

  function uniqueBlocks(blocks) {
    const seen = new Set();
    return blocks.map(b => normalizeText(b, 20000)).filter(text => {
      if (!text || text.length < 10) return false;
      const key = text.slice(0, 500);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeText(text, maxLen = 20000) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, maxLen);
  }

  function normalizeInlineText(text) {
    return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function decodeHtml(str) {
    const el = document.createElement('textarea');
    el.innerHTML = String(str || '');
    return el.value;
  }

  function decodeUnicode(str) {
    try { return String(str || '').replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); }
    catch(e) { return str; }
  }
})();
