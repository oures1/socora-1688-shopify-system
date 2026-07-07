// content.js - 1688商品ページ専用スクレイパー

(function () {
  'use strict';

  try {
    if (window.top !== window.self) return;
  } catch(e) {
    return;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'source_page_info') {
      sendResponse({ success: true, data: getSourcePageInfo() });
      return true;
    }
    if (request.action === 'scrape_1688') {
      scrapeProduct().then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
  });

  function getSourcePageInfo() {
    return {
      url: window.location.href,
      title: document.title || '',
      site: '1688',
      itemId: extract1688ItemId(),
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

  const VARIANT_LABELS = {
    '颜色分类': 'COLOR', '颜色': 'COLOR',
    '尺码': 'SIZE',      '尺寸': 'SIZE',
  };
  const DOM_VARIANT_SPECS = [
    { label: '颜色', type: 'COLOR', re: /^(颜色|顏色|颜色分类|颜色分類)$/ },
    { label: '尺码', type: 'SIZE', re: /^(尺码|尺碼|尺寸|规格|規格)$/ },
  ];
  const SIZE_BASE_SOURCE = '(XXXS|XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|6XL|7XL|8XL|均码|均碼|[\\d.]+码|[\\d.]+碼)';
  const DOM_BAD_OPTION_RE = /成交趋势|商品评价|商品属性|包装信息|商品详情|热门推荐|搭配组货|数量|购买|加采购车|购物车|收藏|客服|商品|店铺|搜索|价格|优惠|发货|退货|信用卡|库存|起批|起订|起购|包邮|运费|参数/i;
  const COLOR_WORD_RE = /黑|白|灰|蓝|藍|绿|綠|紫|红|紅|黄|黃|柠|檸|檬|粉|棕|咖|橙|青|藏|杏|米|卡其|军|軍|象牙|银|銀|金|褐|茶|藕|玫|酒|橄|芥|冰|梅|船|暗|雾|霧|墨|玄|夜|雨|奶|油|樱|櫻|桜/i;
  const STYLE_WORD_RE = /薄款|厚款|加厚|常规|常規|短款|长款|長款|短裤|短褲|长裤|長褲|三防|科技|防晒|防曬|防水|款|版|型/i;
  const COLOR_BAD_VALUE_RE = /面料|材质|材質|成分|锦氨|錦氨|经编|經編|冰感|凉感|涼感|冷感|防晒|防曬|原纱|原紗|涤纶|滌綸|氨纶|氨綸|尼龙|尼龍|聚酯|棉|丝|絲|纱|紗|布|款|版|型|长袖|長袖|短袖|裤|褲|裙|衣|外套|上衣/i;
  const BAD_TITLE_RE = /window\.contextPath|contextPath|AppFrame|Shopify|admin\.shopify|このページの準備|有限公司|有限责任公司|股份有限公司|服饰公司|贸易公司|供应链|供應鏈|工厂|工廠|厂家|廠家|店铺|店舖|旗舰店|官方店|专营店|专卖店|批发店|档口|商行|企业店|1688采购助手|找工厂|找厂|找店|客服|关注|搜索|首页|采购车|我的订单/i;
  const PRODUCT_TITLE_HINT_RE = /男|女|情侣|童|夏|春|秋|冬|款|新款|薄|厚|宽松|宽鬆|休闲|运动|户外|防晒|防曬|防水|速干|速乾|透气|透氣|凉感|涼感|冷感|连帽|連帽|拉链|拉鏈|夹克|外套|防晒衣|防曬衣|冲锋衣|衬衫|襯衫|T恤|裤|褲|短裤|短褲|长裤|長褲|裙|背心|卫衣|衛衣|上衣|帽|包|鞋/i;

  function findDataScript() {
    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '');
    const itemId = extract1688ItemId();
    const visibleTitle = extractVisibleTitle();
    const candidates = scripts
      .filter(text => text && (text.includes('"skuProps"') || text.includes('"subject"') || text.includes('"skuMap"')))
      .map((text, index) => ({ text, index, score: scoreDataScript(text, index, itemId, visibleTitle) }))
      .sort((a, b) => (b.score - a.score) || (b.text.length - a.text.length));
    return candidates[0]?.text ||
      scripts.find(s => s.includes('"skuProps"') && s.includes('"subject"')) ||
      scripts.find(s => s.includes('"skuProps"')) ||
      scripts.find(s => s.includes('"subject"')) ||
      scripts.reduce((a, b) => a.length > b.length ? a : b, '');
  }

  function scoreDataScript(text, index, itemId, visibleTitle) {
    let score = 0;
    if (text.includes('"skuProps"')) score += 30;
    if (text.includes('"skuMapOriginal"') || text.includes('"skuMap"')) score += 20;
    if (text.includes('"subject"')) score += 12;
    if (itemId && text.includes(itemId)) score += 80;
    const subjects = extractScriptSubjects(text);
    if (visibleTitle && subjects.some(subject => titlesLikelySame(subject, visibleTitle))) score += 120;
    if (visibleTitle && text.includes(visibleTitle.slice(0, Math.min(16, visibleTitle.length)))) score += 60;
    score -= Math.min(index, 30) * 0.2;
    return score;
  }

  function extractScriptSubjects(text) {
    return [...String(text || '').matchAll(/"subject"\s*:\s*"([^"]{5,300})"/g)]
      .map(match => decodeUnicode(match[1]))
      .filter(Boolean)
      .slice(0, 30);
  }

  function titleKey(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '')
      .toLowerCase();
  }

  function titlesLikelySame(a, b) {
    const ak = titleKey(a);
    const bk = titleKey(b);
    if (!ak || !bk) return false;
    if (ak === bk || ak.includes(bk) || bk.includes(ak)) return true;
    const shortA = ak.slice(0, 18);
    const shortB = bk.slice(0, 18);
    return Boolean(shortA.length >= 10 && shortB.length >= 10 && (shortA.includes(shortB.slice(0, 10)) || shortB.includes(shortA.slice(0, 10))));
  }

  function extractArray(str, keyName) {
    const text = String(str || '');
    const re = new RegExp(`(?:"${keyName}"|${keyName})\\s*:\\s*\\[`, 'g');
    const match = re.exec(text);
    if (!match) return null;
    let depth = 0, start = -1;
    for (let i = match.index + match[0].length - 1; i < text.length; i++) {
      if (text[i] === '[') { if (depth === 0) start = i; depth++; }
      else if (text[i] === ']') { depth--; if (depth === 0 && start >= 0) return text.slice(start, i + 1); }
    }
    return null;
  }

  async function scrapeProduct() {
    try {
      const dataScript = findDataScript();
      const titleCandidates = collectProductTitleCandidates(dataScript);
      const variants = extractVariants(dataScript);
      const skuStocks = extractSkuStocks(dataScript, variants);
      return {
        success: true,
        data: {
          title:      pickBestProductTitle(titleCandidates),
          documentTitle: document.title || '',
          titleCandidates: titleCandidates
            .map(candidate => ({
              text: normalizeTitleCandidate(candidate.text || ''),
              source: candidate.source || '',
              weight: Number(candidate.weight || 0),
            }))
            .filter(candidate => candidate.text)
            .slice(0, 80),
          prices:     extractPrice(dataScript),
          variants,
          skuStocks,
          skus:       extractSkuRows(dataScript, variants),
          attributes: {},
          paramText:  extractParamText(),
          sizeTables: extractTablesText(),
          detailText: extractDetailText(),
          pageText:   extractRelevantPageText(),
          url:        window.location.href,
          site:       '1688',
          itemId:     extract1688ItemId(),
        }
      };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }

  function extractVisibleTitle() {
    return pickBestProductTitle(collectVisibleTitleCandidates());
  }

  function collectProductTitleCandidates(dataScript) {
    return [
      ...collectTitleNearPriceCandidates(),
      ...collectVisibleTitleCandidates(),
      ...collectScriptTitleCandidates(dataScript),
      { text: document.title, source: 'document', weight: 35 },
    ];
  }

  function extractTitle(dataScript) {
    return pickBestProductTitle(collectProductTitleCandidates(dataScript));
  }

  function collectTitleNearPriceCandidates() {
    const priceRects = Array.from(document.querySelectorAll('span,div,p,strong,b'))
      .map(el => ({ el, text: normalizeInlineText(el.innerText || el.textContent || ''), rect: getRect(el) }))
      .filter(({ el, text, rect }) => rect && isVisible(el) && /[¥￥]\s*\d{2,4}(?:\.\d{1,2})?/.test(text))
      .slice(0, 12);
    if (!priceRects.length) return [];

    const nodes = Array.from(document.querySelectorAll('h1,h2,h3,div,span,p,strong,b,[class*="title"],[class*="Title"]'));
    const candidates = [];
    const seen = new Set();
    nodes.forEach(el => {
      const rect = getRect(el);
      if (!rect || !isVisible(el)) return;
      const text = normalizeTitleCandidate(el.innerText || el.textContent || '');
      if (!text || isBadProductTitleCandidate(text)) return;
      if (!PRODUCT_TITLE_HINT_RE.test(text)) return;
      if (text.length < 10 || text.length > 150) return;

      let bestScore = 0;
      priceRects.forEach(price => {
        const verticalDistance = Math.abs(rect.bottom - price.rect.top);
        const aboveOrSameBlock = rect.top <= price.rect.top + 12 && rect.bottom >= price.rect.top - 220;
        const horizontalOverlap = Math.max(0, Math.min(rect.right, price.rect.right + 420) - Math.max(rect.left, price.rect.left - 120));
        const overlapRatio = horizontalOverlap / Math.max(1, Math.min(rect.width, price.rect.width + 420));
        if (aboveOrSameBlock && overlapRatio > 0.25) {
          bestScore = Math.max(bestScore, 220 - Math.min(verticalDistance, 180) + overlapRatio * 60);
        }
      });
      if (bestScore <= 0) return;
      const key = titleKey(text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      candidates.push({ text, source: 'near-price', weight: bestScore });
    });
    return candidates;
  }

  function collectVisibleTitleCandidates() {
    const selectors = [
      'h1',
      '.module-od-title .title-text',
      '[class*="offer-title"]',
      '[class*="OfferTitle"]',
      '[class*="product-title"]',
      '[class*="ProductTitle"]',
      '[class*="title-text"]',
      '[class*="TitleText"]',
      '[class*="title"]',
    ];
    const candidates = [];
    const seen = new Set();
    selectors.forEach((sel, selectorIndex) => {
      document.querySelectorAll(sel).forEach(el => {
        const text = normalizeTitleCandidate(el?.textContent || '');
        const key = titleKey(text);
        if (!key || seen.has(key)) return;
        seen.add(key);
        candidates.push({
          text,
          source: sel,
          weight: Math.max(0, 80 - selectorIndex * 4),
        });
      });
    });

    document.querySelectorAll('meta[property="og:title"],meta[name="title"]').forEach(meta => {
      const text = normalizeTitleCandidate(meta.getAttribute('content') || '');
      const key = titleKey(text);
      if (key && !seen.has(key)) {
        seen.add(key);
        candidates.push({ text, source: 'meta', weight: 40 });
      }
    });

    normalizeText(document.body?.innerText || '', 12000)
      .split('\n')
      .slice(0, 180)
      .forEach((line, index) => {
        const text = normalizeTitleCandidate(line);
        const key = titleKey(text);
        if (!key || seen.has(key)) return;
        seen.add(key);
        candidates.push({ text, source: 'body-line', weight: Math.max(0, 34 - index * 0.08) });
      });

    const docTitle = normalizeTitleCandidate(document.title);
    if (docTitle && !seen.has(titleKey(docTitle))) candidates.push({ text: docTitle, source: 'document', weight: 10 });
    return candidates;
  }

  function collectScriptTitleCandidates(dataScript) {
    const text = String(dataScript || '');
    const keys = ['subject', 'offerTitle', 'productTitle', 'title'];
    const candidates = [];
    const seen = new Set();
    keys.forEach((key, keyIndex) => {
      const re = new RegExp(`"${key}"\\s*:\\s*"([^"]{5,300})"`, 'g');
      [...text.matchAll(re)].forEach(match => {
        const value = normalizeTitleCandidate(match[1]);
        const candidateKey = titleKey(value);
        if (!candidateKey || seen.has(candidateKey)) return;
        seen.add(candidateKey);
        candidates.push({ text: value, source: `script:${key}`, weight: 70 - keyIndex * 8 });
      });
    });
    return candidates;
  }

  function normalizeTitleCandidate(value) {
    let text = normalizeInlineText(decodeHtml(decodeUnicode(value || '')))
      .replace(/\\\//g, '/')
      .replace(/^【?1688[^】]*】?\s*/i, '')
      .replace(/\s*[-|–—_]\s*(?:1688|阿里巴巴|Alibaba|淘宝|Taobao).*$/i, '')
      .replace(/\s*-\s*批发.*$/i, '')
      .replace(/^(商品名称|商品名|标题|標題|名称|名稱)\s*[:：]\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 180) text = text.slice(0, 180).trim();
    return text;
  }

  function isBadProductTitleCandidate(value) {
    const text = normalizeTitleCandidate(value);
    if (!text || text.length < 6 || text.length > 180) return true;
    if (/https?:\/\//i.test(text) || /[¥￥]\s*\d/.test(text)) return true;
    if (BAD_TITLE_RE.test(text)) return true;
    const compact = text.replace(/\s+/g, '');
    if (/^(颜色|顏色|尺码|尺碼|尺寸|规格|規格|价格|库存|运费|销量|商品)$/.test(compact)) return true;
    if (/^\d+(?:\.\d+)?$/.test(compact)) return true;
    return false;
  }

  function scoreProductTitleCandidate(candidate) {
    const text = normalizeTitleCandidate(candidate?.text || '');
    if (isBadProductTitleCandidate(text)) return -9999;
    let score = Number(candidate?.weight || 0);
    const len = text.length;
    if (len >= 12 && len <= 90) score += 30;
    else if (len >= 8 && len <= 130) score += 18;
    if (PRODUCT_TITLE_HINT_RE.test(text)) score += 55;
    if (/[\u4e00-\u9fff]{6,}/.test(text)) score += 18;
    if (/【[^】]+】/.test(text)) score += 4;
    if (/^(?:[A-Za-z0-9\s]+)$/.test(text)) score -= 22;
    if (/色|黑|白|灰|蓝|绿|紫|粉|黄|黃|橙|咖|卡其|奶|油|樱|櫻|桜/.test(text) && len < 12) score -= 18;
    return score;
  }

  function pickBestProductTitle(candidates) {
    const ranked = (candidates || [])
      .map(candidate => ({ ...candidate, text: normalizeTitleCandidate(candidate?.text || '') }))
      .filter(candidate => candidate.text)
      .map(candidate => ({ ...candidate, score: scoreProductTitleCandidate(candidate) }))
      .filter(candidate => candidate.score > -1000)
      .sort((a, b) => (b.score - a.score) || (b.text.length - a.text.length));
    return ranked[0]?.text || '';
  }

  function extract1688ItemId() {
    try {
      const url = new URL(location.href);
      const offerId = url.searchParams.get('offerId');
      if (offerId) return offerId;
    } catch(e) {}
    return (window.location.href.match(/\/offer\/(\d+)/) || [])[1] || '';
  }

  function extractVariants(dataScript) {
    const domVariants = extractDomVariantsFallback();
    const skuPropsRaw = extractArray(dataScript, 'skuProps');
    if (!skuPropsRaw) return domVariants;

    let skuProps;
    try { skuProps = JSON.parse(skuPropsRaw); }
    catch(e) { return domVariants; }

    const skuEntries = extractSkuStocks(dataScript);

    const variants = [];
    const seenLabel = new Set();
    const variantProps = skuProps.filter(prop => VARIANT_LABELS[prop.prop || '']);

    for (const prop of skuProps) {
      const label = prop.prop || prop.name || prop.label || prop.propertyName || '';
      const type = VARIANT_LABELS[label];
      if (!type || seenLabel.has(label)) continue;
      seenLabel.add(label);

      const values = [];
      const zeroStock = [];
      const images = {};

      for (const v of (prop.value || prop.values || prop.options || [])) {
        const rawName = v.name || v.value || v.title || v.text || v.displayName || v.propValueName || '';
        const rawCleanName = type === 'COLOR'
          ? cleanColorVariantName(rawName)
          : cleanSkuPropName(rawName, { preserveParenthetical: type === 'SIZE' });
        const name = type === 'SIZE' ? (normalizeDomSizeOptionName(rawCleanName) || rawCleanName) : rawCleanName;
        const shortName = type === 'SIZE'
          ? (normalizeDomSizeOptionName(rawName) || cleanSkuPropName(rawName))
          : cleanColorVariantName(rawName);
        if (!shortName || shortName.length > 40) continue;
        if (!values.includes(name)) values.push(name);
        const imageUrl = normalizeImageUrl(v.imageUrl || v.image || v.imgUrl || v.imageUrlMap || v.previewImage || v.originalImage || '');
        if (imageUrl) images[name] = imageUrl;
      }

      const propIndex = variantProps.findIndex(p => p === prop);
      const expectedRelatedCount = variantProps.reduce((total, current, idx) => {
        if (idx === propIndex) return total;
        return total * Math.max(1, getSkuPropValues(current).length);
      }, 1);
      values.forEach(value => {
        const related = skuEntries.filter(entry => entry.parts?.[propIndex] === value);
        if (related.length >= expectedRelatedCount && related.every(entry => entry.outOfStock) && !zeroStock.includes(value)) {
          zeroStock.push(value);
        }
      });

      if (values.length > 0) variants.push({ label, values, zeroStock, images });
    }
    if (!variants.length) return domVariants;
    const merged = mergeDomVariantImages(variants);
    return reconcileVariantsWithVisibleColors(reconcileVariantsWithDom(merged, domVariants), domVariants);
  }

  function variantTypeOf(label) {
    const text = String(label || '').trim();
    return VARIANT_LABELS[text] || DOM_VARIANT_SPECS.find(spec => spec.re.test(text))?.type || '';
  }

  function valueKey(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[\s\-_()（）【】\[\]{}"'“”]/g, '')
      .toLowerCase();
  }

  function valuesOverlapRatio(left = [], right = []) {
    const a = left.map(valueKey).filter(Boolean);
    const b = right.map(valueKey).filter(Boolean);
    if (!a.length || !b.length) return 0;
    const overlap = a.filter(av => b.some(bv => av === bv || av.includes(bv) || bv.includes(av))).length;
    return overlap / Math.min(a.length, b.length);
  }

  function shouldPreferDomVariant(scriptVariant, domVariant, type) {
    if (!domVariant?.values?.length) return false;
    if (!scriptVariant?.values?.length) return true;
    const overlap = valuesOverlapRatio(scriptVariant.values, domVariant.values);
    if (type === 'COLOR') {
      if (domVariant.values.length >= 2 && overlap < 0.5) return true;
      const domImageCount = Object.keys(domVariant.images || {}).length;
      if (domImageCount >= 2 && overlap < 0.75) return true;
    }
    if (type === 'SIZE' && domVariant.values.length >= 2 && overlap < 0.4) return true;
    return false;
  }

  function reconcileVariantsWithDom(scriptVariants, domVariants) {
    if (!domVariants?.length) return scriptVariants;
    const result = [...scriptVariants];
    domVariants.forEach(domVariant => {
      const type = variantTypeOf(domVariant.label);
      if (!type) return;
      const index = result.findIndex(variant => variantTypeOf(variant.label) === type);
      if (index < 0) {
        result.push(domVariant);
        return;
      }
      if (shouldPreferDomVariant(result[index], domVariant, type)) {
        result[index] = domVariant;
      }
    });
    return result;
  }

  function reconcileVariantsWithVisibleColors(variants, domVariants = []) {
    const visibleColor = extractVisibleColorVariant(domVariants);
    if (!visibleColor.values.length) return variants;
    const result = [...variants];
    const index = result.findIndex(variant => variantTypeOf(variant.label) === 'COLOR');
    if (index < 0) {
      result.unshift(visibleColor);
      return result;
    }
    const current = result[index];
    const overlap = valuesOverlapRatio(current.values || [], visibleColor.values);
    const suspicious = (current.values || []).some(value => looksLikeMixedStyleColor(value));
    const visibleHasMoreChoices = visibleColor.values.length >= Math.max(3, (current.values || []).length + 2);
    const shouldReplace = visibleColor.values.length >= 2 && (
      visibleColor.source === 'visible_swatch' ||
      visibleHasMoreChoices ||
      !(current.values || []).length ||
      overlap < 0.55 ||
      suspicious
    );
    if (!shouldReplace) {
      result[index] = mergeColorVariantImages(current, visibleColor);
      return result;
    }
    result[index] = {
      ...current,
      label: current.label || visibleColor.label,
      values: visibleColor.values,
      zeroStock: [],
      images: {
        ...(current.images || {}),
        ...(visibleColor.images || {}),
      },
    };
    return result;
  }

  function mergeColorVariantImages(current, visibleColor) {
    const images = { ...(current.images || {}) };
    Object.entries(visibleColor.images || {}).forEach(([visibleName, imageUrl]) => {
      const existing = (current.values || []).find(value => namesLikelySame(value, visibleName));
      images[existing || visibleName] = images[existing || visibleName] || imageUrl;
    });
    return { ...current, images };
  }

  function extractVisibleColorVariant(domVariants = []) {
    const attrValues = extractAttributeColorValues();
    const swatchValues = extractVisibleColorSwatchValues();
    const domColor = (domVariants || []).find(variant => variantTypeOf(variant.label) === 'COLOR');
    const domValues = (domColor?.values || []).filter(isStrictColorName);
    const values = swatchValues.length >= 2 ? swatchValues : (attrValues.length >= 2 ? attrValues : domValues);
    const source = swatchValues.length >= 2 ? 'visible_swatch' : (attrValues.length >= 2 ? 'attribute_color' : 'dom_color');
    const images = {};
    const imageSources = {
      ...(domColor?.images || {}),
      ...extractDomColorImages(),
    };
    values.forEach((value, index) => {
      const matchedKey = Object.keys(imageSources).find(key => namesLikelySame(key, value));
      if (matchedKey) images[value] = imageSources[matchedKey];
      else {
        const orderedKey = Object.keys(imageSources)[index];
        if (orderedKey && Object.keys(imageSources).length === values.length) images[value] = imageSources[orderedKey];
      }
    });
    return {
      label: '颜色',
      values: uniqueParts(values).slice(0, 80),
      zeroStock: [],
      images,
      source,
    };
  }

  function extractVisibleColorSwatchValues() {
    const labelEl = findDomVariantLabel(/^(颜色|顏色|颜色分类|颜色分類)$/);
    const labelRect = labelEl ? getRect(labelEl) : null;
    const nextLabelTop = labelRect ? (findNextDomVariantLabelTop(labelRect.top) || (labelRect.top + 300)) : null;
    const candidates = Array.from(document.querySelectorAll('button,li,a,div,[role="button"],[class*="sku"],[class*="Sku"],[class*="value"],[class*="Value"],[class*="prop"],[class*="Prop"],[class*="offer"],[class*="Offer"]'));
    const values = [];
    const seen = new Set();

    candidates
      .map(el => ({ el, rect: getRect(el) }))
      .filter(({ el, rect }) => {
        if (!rect || !isVisible(el)) return false;
        if (labelRect) {
          if (rect.top < labelRect.top - 28 || rect.top > nextLabelTop - 6) return false;
          if (rect.right < labelRect.right - 8) return false;
        }
        if (rect.width < 18 || rect.height < 18 || rect.width > 260 || rect.height > 90) return false;
        const text = normalizeInlineText(el.innerText || el.textContent || '');
        const lineCount = String(el.innerText || el.textContent || '').split('\n').map(line => line.trim()).filter(Boolean).length;
        if (lineCount > 3 || text.length > 90 || DOM_BAD_OPTION_RE.test(text)) return false;
        const hasImage = Boolean(el.querySelector('img'));
        const hasExactColorText = /【[^】]{1,24}】/.test(text) || /高品|高質|品质|品質/.test(text);
        const hasColorHint = COLOR_WORD_RE.test(text) || COLOR_WORD_RE.test(el.getAttribute('title') || '') || COLOR_WORD_RE.test(el.getAttribute('aria-label') || '');
        if (labelRect) return Boolean(hasImage || hasExactColorText || hasColorHint);
        return Boolean(hasImage && hasColorHint);
      })
      .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left))
      .forEach(({ el }) => {
        const value = extractExactColorOptionName(el);
        if (!value || !isStrictColorName(value)) return;
        const key = valueKey(stripColorQualityText(value) || value);
        if (seen.has(key)) return;
        seen.add(key);
        values.push(value);
      });

    if (values.length >= 2) return values.slice(0, 80);
    return extractVisibleColorSwatchValuesFromImages(labelRect, nextLabelTop).slice(0, 80);
  }

  function extractVisibleColorSwatchValuesFromImages(labelRect = null, nextLabelTop = null) {
    const values = [];
    const seen = new Set();
    Array.from(document.querySelectorAll('img')).forEach(img => {
      if (!isVisible(img)) return;
      const imgRect = getRect(img);
      if (!imgRect) return;
      let el = img.parentElement;
      for (let depth = 0; el && depth < 7; depth += 1, el = el.parentElement) {
        const rect = getRect(el);
        if (!rect || !isVisible(el)) continue;
        if (labelRect) {
          const bottomLimit = nextLabelTop || (labelRect.top + 300);
          if (rect.top < labelRect.top - 28 || rect.top > bottomLimit - 6) continue;
          if (rect.right < labelRect.right - 8) continue;
        }
        if (rect.width < 28 || rect.height < 22 || rect.width > 300 || rect.height > 110) continue;
        const value = extractExactColorOptionName(el);
        if (!value || !isStrictColorName(value)) continue;
        if (labelRect && !/【[^】]{1,24}】|高品|高質|品质|品質/.test(value)) continue;
        const key = valueKey(stripColorQualityText(value) || value);
        if (seen.has(key)) continue;
        seen.add(key);
        values.push(value);
        break;
      }
    });
    return values;
  }

  function extractExactColorOptionName(el) {
    const sources = [
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
      el.querySelector('img')?.alt,
      el.querySelector('img')?.title,
      directTextOf(el),
      el.innerText || el.textContent || '',
    ];
    for (const source of sources) {
      const value = cleanExactColorText(source);
      if (value && isStrictColorName(value)) return value;
    }
    return '';
  }

  function directTextOf(el) {
    return normalizeInlineText(Array.from(el.childNodes || [])
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || '')
      .join(' '));
  }

  function cleanExactColorText(value) {
    let text = normalizeInlineText(decodeHtml(decodeUnicode(value || '')));
    if (!text || text.length > 120) return '';
    if (text.includes('\n')) return '';
    text = text
      .replace(/^(颜色|顏色|颜色分类|颜色分類)\s*[:：]?\s*/g, '')
      .replace(/全网低价|全網低價|近期热销|近期熱銷|热销|熱銷|促销|促銷|低价|低價|已选|已選|库存不足|缺货|售罄|无货|有货|在庫なし/g, '')
      .replace(/^[\s:：,，、]+|[\s:：,，、]+$/g, '')
      .trim();
    const token = extractColorTokenFromText(text);
    if (token) return token;
    const exact = text.match(/([\u4e00-\u9fffA-Za-z0-9]{1,32})\s*(【[^】]{1,24}】)/);
    if (exact) return normalizeInlineText(`${exact[1]}${exact[2]}`);
    const marker = text.match(/([\u4e00-\u9fffA-Za-z0-9]{1,32})/);
    return normalizeInlineText(marker?.[1] || text);
  }

  function stripColorQualityText(value) {
    return String(value || '').replace(/【[^】]*】/g, '').trim();
  }

  function extractAttributeColorValues() {
    const found = [];
    const addValueText = text => {
      splitColorValueText(text).forEach(value => {
        if (!found.includes(value)) found.push(value);
      });
    };

    document.querySelectorAll('tr').forEach(row => {
      const cells = Array.from(row.querySelectorAll('th,td')).map(cell => normalizeInlineText(cell.innerText || cell.textContent || ''));
      cells.forEach((cell, index) => {
        if (/^(颜色|顏色|颜色分类|颜色分類)$/.test(cell)) addValueText(cells[index + 1] || '');
      });
    });

    document.querySelectorAll('li,div,p,span').forEach(el => {
      const text = normalizeInlineText(el.innerText || el.textContent || '');
      if (!text || text.length > 260) return;
      const match = text.match(/(?:^|\s)(颜色|顏色|颜色分类|颜色分類)\s*[:：]?\s*([^\n]{4,220})$/);
      if (match) addValueText(match[2]);
    });

    return found.filter(isStrictColorName).slice(0, 80);
  }

  function splitColorValueText(text) {
    return uniqueParts(String(text || '')
      .split(/[,，、;；|｜\n\r]+/)
      .map(value => cleanColorVariantName(value))
      .map(value => normalizeInlineText(value))
      .filter(value => value && value.length <= 50 && !DOM_BAD_OPTION_RE.test(value)));
  }

  function extractDomVariantsFallback() {
    return DOM_VARIANT_SPECS.map(spec => {
      const labelEl = findDomVariantLabel(spec.re);
      const options = labelEl ? collectDomOptionsNearLabel(labelEl, spec.type) : [];
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

  function findDomVariantLabel(labelRe) {
    return Array.from(document.querySelectorAll('span,div,label,p'))
      .filter(isVisible)
      .find(el => {
        const directText = normalizeInlineText(Array.from(el.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent || '')
          .join(' ')) || normalizeInlineText(el.textContent || '');
        const labelText = directText.replace(/[：:]\s*$/, '');
        return labelText.length <= 12 && labelRe.test(labelText);
      }) || null;
  }

  function collectDomOptionsNearLabel(labelEl, type) {
    const labelRect = getRect(labelEl);
    if (!labelRect) return [];
    const nextLabelTop = findNextDomVariantLabelTop(labelRect.top);
    const candidates = Array.from(document.querySelectorAll('button,li,a,span,div,[role="button"],[class*="sku"],[class*="Sku"],[class*="value"],[class*="Value"],[class*="prop"],[class*="Prop"],[class*="item"],[class*="Item"]'));
    const result = [];
    const seen = new Map();
    candidates
      .map(el => ({ el, rect: getRect(el) }))
      .filter(item => isNearDomVariantLabel(item.el, item.rect, labelRect, nextLabelTop, type))
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
    return result.slice(0, type === 'SIZE' ? 40 : 80);
  }

  function findNextDomVariantLabelTop(currentTop) {
    const tops = [];
    for (const spec of DOM_VARIANT_SPECS) {
      const el = findDomVariantLabel(spec.re);
      const rect = el ? getRect(el) : null;
      if (rect && rect.top > currentTop + 12) tops.push(rect.top);
    }
    return tops.length ? Math.min(...tops) : null;
  }

  function isNearDomVariantLabel(el, rect, labelRect, nextLabelTop, type) {
    if (!rect || !isVisible(el)) return false;
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.top < labelRect.top - 28) return false;
    const maxDistance = type === 'SIZE' ? 520 : 520;
    const bottomLimit = nextLabelTop ? Math.min(nextLabelTop - 8, labelRect.top + maxDistance) : labelRect.top + maxDistance;
    if (rect.top > bottomLimit) return false;
    const labelRightGuard = labelRect.width < 180 ? labelRect.right - 4 : labelRect.left - 4;
    if (rect.right < labelRightGuard) return false;
    const rawText = domOptionRawText(el, type);
    if (!rawText || rawText.length > 140) return false;
    const lineCount = (el.innerText || el.textContent || '').split('\n').map(line => line.trim()).filter(Boolean).length;
    if (lineCount > 4) return false;
    const nestedOptions = el.querySelectorAll('button,[role="button"],li,img,[class*="sku"],[class*="Sku"]').length;
    if (!/^(BUTTON|LI|A)$/i.test(el.tagName) && nestedOptions > 2) return false;
    const text = cleanDomOptionName(rawText, type);
    if (!isLikelyDomOptionName(text, type)) return false;
    if (type === 'COLOR') {
      const hasImage = !!el.querySelector('img');
      const hasColorHint = /(色|黑|白|灰|蓝|藍|绿|綠|紫|红|紅|黄|黃|柠|檸|檬|粉|棕|咖|橙|青|藏|杏|米|卡其|军|軍|象牙|奶|油|樱|櫻|桜)/i.test(text);
      if (!hasImage && !hasColorHint) return false;
    }
    return true;
  }

  function extractDomOption(el, type) {
    const rawText = domOptionRawText(el, type);
    const name = cleanDomOptionName(rawText, type);
    if (!isLikelyDomOptionName(name, type)) return null;
    const img = el.querySelector('img');
    const imageUrl = normalizeImageUrl(img?.currentSrc || img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || img?.getAttribute('data-ks-lazyload') || '');
    const stateText = `${el.className || ''} ${el.getAttribute('aria-disabled') || ''} ${el.getAttribute('disabled') || ''} ${rawText}`;
    const outOfStock = /disabled|disable|sold|out|unavailable|库存不足|缺货|售罄|无货|在庫なし/i.test(stateText);
    return { name, imageUrl, outOfStock };
  }

  function domOptionRawText(el, type = '') {
    const text = uniqueParts([
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
      el.innerText || el.textContent || '',
      el.querySelector('img')?.alt,
      el.querySelector('img')?.title,
    ]).join(' ');
    if (type === 'SIZE') return trimDomSizeOptionText(text);
    if (type === 'COLOR') return trimDomColorOptionText(text);
    return text;
  }

  function cleanDomOptionName(value, type) {
    const text = normalizeInlineText(value || '')
      .replace(/全网低价|全網低價|近期热销|近期熱銷|热销|熱銷|促销|促銷|低价|低價|已选|已選|库存不足|缺货|售罄|无货|有货|在庫なし/g, '')
      .trim();
    if (type === 'SIZE') {
      const detailed = normalizeDomSizeOptionName(text);
      if (detailed) return detailed;
      const size = uniqueParts(text.split(/\s+/))
        .map(part => normalizeDomSizeOptionName(part))
        .find(part => isLikelyDomOptionName(part, 'SIZE'));
      return size || '';
    }
    if (type === 'COLOR') return trimDomColorOptionText(text);
    return normalizeInlineText(text)
      .replace(/[「"“『].*?[」"”』]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function trimDomColorOptionText(text) {
    const normalized = normalizeInlineText(text || '');
    const token = extractColorTokenFromText(normalized);
    if (token) return token;
    const marker = normalized.match(/([^\s「」"'“”『』()（）]{1,30}(?:色|粉|绿|綠|黄|黃|柠檬|檸檬|灰|白|黑|蓝|藍|紫|红|紅|卡其))(?:\s|$|[「"'“”『』(（])/);
    if (marker) return marker[1];
    return normalized;
  }

  function extractColorTokenFromText(text) {
    const normalized = normalizeInlineText(text || '')
      .replace(/^[\s:：,，、]+|[\s:：,，、]+$/g, '')
      .trim();
    if (!normalized) return '';
    const candidates = [
      normalized,
      ...normalized.split(/[\s,，、;；|｜/／\n\r]+/),
    ]
      .map(value => normalizeInlineText(value)
        .replace(/[「"“『」"”』]/g, '')
        .replace(/^[\s()（）【】]+|[\s()（）【】]+$/g, '')
        .trim())
      .filter(Boolean);

    return candidates.find(value => value.length <= 16 && COLOR_WORD_RE.test(value) && !COLOR_BAD_VALUE_RE.test(value)) || '';
  }

  function trimDomSizeOptionText(text) {
    const normalized = normalizeInlineText(text || '');
    return normalizeDomSizeOptionName(normalized) || normalized;
  }

  function cleanDomSizeWithDetail(text) {
    return normalizeDomSizeOptionName(text);
  }

  function normalizeDomSizeOptionName(text) {
    const normalized = normalizeInlineText(text || '')
      .replace(/[「"“『」"”』]/g, ' ')
      .replace(/^[\s()（）]+|[\s()（）]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return '';
    const baseOnly = normalized.match(new RegExp(`^${SIZE_BASE_SOURCE}$`, 'i'));
    if (baseOnly) return formatDomSizeBase(baseOnly[1]);
    const m = normalized.match(new RegExp(`^${SIZE_BASE_SOURCE}\\s*[「"'“”『(（]?\\s*(.{1,70}?)\\s*[」"'”』)）]*$`, 'i'));
    if (!m) return '';
    const base = formatDomSizeBase(m[1]);
    const detail = normalizeInlineText(m[2] || '')
      .replace(/^[\s()（）]+|[\s()（）]+$/g, '')
      .replace(/[()（）]/g, '')
      .trim();
    if (!detail || DOM_BAD_OPTION_RE.test(detail) || /[¥￥]/.test(detail)) return base;
    if (detail.toUpperCase() === base.toUpperCase()) return base;
    if (!/[\dA-Za-z]/.test(detail)) return base;
    return `${base}（${detail}）`;
  }

  function formatDomSizeBase(value) {
    const text = String(value || '').trim();
    if (/^[A-Za-z0-9.]+(?:码|碼)?$/i.test(text)) return text.toUpperCase();
    return text;
  }

  function isLikelyDomOptionName(name, type) {
    const text = String(name || '').trim();
    if (!text || text.length > 70) return false;
    if (DOM_BAD_OPTION_RE.test(text)) return false;
    if (/颜色|顏色|尺码|尺碼|尺寸|数量|數量|购买|購買|购物车|購物車|收藏|客服|¥|￥|\d+\s*人|\d+\s*件/.test(text)) return false;
    if (type === 'SIZE') {
      return new RegExp(`^${SIZE_BASE_SOURCE}(?:（[^）]{2,70}）)?$`, 'i').test(text);
    }
    if (type === 'COLOR' && COLOR_BAD_VALUE_RE.test(text)) return false;
    if (/^(XXXS|XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL)$/i.test(text)) return false;
    return /[\u4e00-\u9fffA-Za-z]/.test(text);
  }

  function mergeDomVariantImages(variants) {
    const colorVariant = variants.find(v => VARIANT_LABELS[v.label || ''] === 'COLOR');
    if (!colorVariant) return variants;

    const domImages = extractDomColorImages();
    Object.entries(domImages).forEach(([domName, imageUrl]) => {
      const match = colorVariant.values.find(value => namesLikelySame(value, domName));
      if (match && !colorVariant.images[match]) colorVariant.images[match] = imageUrl;
    });
    return variants;
  }

  function extractDomColorImages() {
    const result = {};
    const roots = Array.from(document.querySelectorAll('div,section,ul,li'))
      .filter(el => /颜色|顏色/.test(el.innerText || el.textContent || '') && el.querySelectorAll('img').length > 0)
      .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)
      .slice(0, 5);
    const scope = roots.length ? roots : [document.body];

    scope.forEach(root => {
      root.querySelectorAll('img').forEach(img => {
        const imageUrl = normalizeImageUrl(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '');
        if (!imageUrl) return;
        const name = findOptionNameNearImage(img);
        if (name && !result[name]) result[name] = imageUrl;
      });
    });
    return result;
  }

  function findOptionNameNearImage(img) {
    const candidates = [img.alt, img.title, img.getAttribute('aria-label')];
    let el = img.parentElement;
    for (let depth = 0; el && depth < 5; depth += 1, el = el.parentElement) {
      candidates.push(el.getAttribute('title'), el.getAttribute('aria-label'), el.innerText || el.textContent || '');
    }

    return candidates.map(text => cleanSkuPropName(normalizeInlineText(text || '')))
      .find(isLikelyColorName) || '';
  }

  function isLikelyColorName(name) {
    const text = String(name || '').trim();
    if (!text || text.length > 60) return false;
    if (/颜色|顏色|尺码|尺寸|库存|起批|起订|起購|起购|包邮|¥|￥|\d+\s*件/.test(text)) return false;
    if (COLOR_BAD_VALUE_RE.test(text)) return false;
    if (/^(S|M|L|XL|XXL|XXXL|XS|2XL|3XL|4XL|5XL)$/i.test(text)) return false;
    if (/^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL)\s*[【（(]/i.test(text)) return false;
    return /[\u4e00-\u9fffA-Za-z]/.test(text);
  }

  function isStrictColorName(name) {
    const text = stripColorQualityText(String(name || '').trim());
    return Boolean(isLikelyColorName(text) && COLOR_WORD_RE.test(text) && !COLOR_BAD_VALUE_RE.test(text));
  }

  function optionNameKey(value) {
    return String(value || '')
      .replace(/^[A-Za-z]{1,12}\d{2,}[A-Za-z0-9_-]*(?=[\u4e00-\u9fff])/, '')
      .replace(/[\s\-_()（）【】\[\]{}]/g, '')
      .toLowerCase();
  }

  function namesLikelySame(a, b) {
    const ak = optionNameKey(a);
    const bk = optionNameKey(b);
    return Boolean(ak && bk && (ak === bk || ak.includes(bk) || bk.includes(ak)));
  }

  function cleanSkuPropName(value, options = {}) {
    const raw = decodeHtml(decodeUnicode(value || '')).trim();
    const parenCn = raw.match(/[（(]([^）)]*[\u4e00-\u9fff][^）)]*)[）)]/);
    const withoutParen = raw.replace(/[（(（][^）)）]*[）)）]/g, '').trim();
    if (options.preserveParenthetical && parenCn?.[1]) {
      const normalized = `${withoutParen || raw.replace(/[（(（].*$/, '').trim()}（${parenCn[1].trim()}）`;
      return normalized.trim() || raw;
    }
    if (/[\u3040-\u30ff]/.test(withoutParen) && parenCn?.[1]) return parenCn[1].trim();
    return withoutParen || parenCn?.[1]?.trim() || raw;
  }

  function cleanColorVariantName(value) {
    const text = cleanSkuPropName(value)
      .replace(/^[\s:：,，、]+|[\s:：,，、]+$/g, '')
      .trim();
    if (!text) return '';
    if (/^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL)\s*[【（(]/i.test(text)) return '';
    const parts = text.split(/[-－—–_／/|｜]+/).map(part => normalizeInlineText(part)).filter(Boolean);
    if (parts.length >= 2 && parts.some(part => STYLE_WORD_RE.test(part))) {
      const colorPart = parts.find(part => COLOR_WORD_RE.test(part) && !STYLE_WORD_RE.test(part));
      if (colorPart) return colorPart;
    }
    return text;
  }

  function looksLikeMixedStyleColor(value) {
    const text = String(value || '').trim();
    return Boolean(text && COLOR_WORD_RE.test(text) && STYLE_WORD_RE.test(text));
  }

  function getSkuPropValues(prop) {
    const type = VARIANT_LABELS[prop.prop || ''];
    return (prop.value || [])
      .map(v => cleanSkuPropName(v.name || '', { preserveParenthetical: type === 'SIZE' }))
      .filter(Boolean);
  }

  function normalizeImageUrl(value) {
    if (!value) return '';
    if (typeof value === 'object') {
      const candidates = [];
      const collect = (obj, depth = 0) => {
        if (!obj || depth > 3) return;
        if (typeof obj === 'string') {
          candidates.push(obj);
          return;
        }
        if (Array.isArray(obj)) {
          obj.forEach(item => collect(item, depth + 1));
          return;
        }
        Object.values(obj).forEach(item => collect(item, depth + 1));
      };
      collect(value);
      const found = candidates.find(text => /(?:alicdn|\.jpg|\.jpeg|\.png|\.webp|\.gif)/i.test(text)) || candidates[0] || '';
      return normalizeImageUrl(found);
    }
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

    const unitPattern = '(?:件|条|條|个|個|只|双|雙|枚|张|張|套|款|包|片|本|支|组|組)';
    const pricePattern = '([1-9]\\d{0,3}(?:\\s*\\.\\s*\\d{1,2})?)';
    const onePieceOrder = `1\\s*${unitPattern}\\s*(?:起批|起订|起訂|起購|起购)`;

    [
      { pattern: new RegExp(`[¥￥]\\s*${pricePattern}\\s*(?:元)?\\s*(${onePieceOrder})`, 'g'), priceIndex: 1, qtyIndex: 2, priority: 1 },
      { pattern: new RegExp(`(${onePieceOrder})[^¥￥]{0,80}[¥￥]\\s*${pricePattern}`, 'g'), priceIndex: 2, qtyIndex: 1, priority: 1 },
      { pattern: new RegExp(`(1\\s*${unitPattern}\\s*(?:价格|價|价|包邮|包郵))[^¥￥]{0,80}[¥￥]\\s*${pricePattern}`, 'g'), priceIndex: 2, qtyIndex: 1, priority: 9 },
    ].forEach(({ pattern, priceIndex, qtyIndex, priority }) => {
      [...visibleText.matchAll(pattern)].forEach(match => {
        const price = match[priceIndex];
        const qty = match[qtyIndex] || '';
        add(price, qty.replace(/\s+/g, ''), priority);
      });
    });

    [...visibleText.matchAll(new RegExp(`[¥￥]\\s*${pricePattern}\\s*(?:元)?\\s*(?:≥|>=|大于等于)\\s*(\\d+)\\s*${unitPattern}`, 'g'))]
      .forEach(match => add(match[1], `≥${match[2]}件`, 12 + Number(match[2] || 0)));

    for (const sel of ['[class*="price-number"]','[class*="priceNumber"]','[class*="minPrice"]','[class*="price"]','[class*="Price"]']) {
      document.querySelectorAll(sel).forEach(el => {
        const text = normalizeInlineText(el.textContent || '');
        if (text.length <= 40) add(text, '表示価格', 30);
      });
    }

    [...String(dataScript || '').matchAll(/"(?:price|startPrice|minPrice|priceMin|quotePrice|salePrice|discountPrice|offerPrice)"\s*:\s*"?([\d]+(?:\.[\d]{1,2})?)"?/g)]
      .forEach(match => add(match[1], 'データ内価格', 70));

    return prices.sort((a, b) => (a.priority - b.priority) || (parseFloat(b.price) - parseFloat(a.price)));
  }

  function extractParamText() {
    for (const sel of ['[class*="attribute"]','[class*="Attribute"]','[class*="spec"]','.detail-info-main']) {
      const el = document.querySelector(sel);
      if (el) {
        const t = normalizeText(el.innerText || '', 12000);
        if (t.length > 30) return t;
      }
    }
    return '';
  }

  function extractSkuRows(dataScript, expectedVariants = null) {
    return extractSkuStocks(dataScript, expectedVariants).slice(0, 300).map(row => {
      return {
        spec: row.spec,
        price: String(row.price || '').trim(),
        stock: String(row.stock ?? '').trim(),
        outOfStock: row.outOfStock,
      };
    }).filter(row => row.spec || row.price || row.stock);
  }

  function extractSkuStocks(dataScript, expectedVariants = null) {
    const skuMapRaw = extractArray(dataScript, 'skuMapOriginal') || extractArray(dataScript, 'skuMap');
    if (!skuMapRaw) return [];
    let skuMap = [];
    try { skuMap = JSON.parse(skuMapRaw); } catch(e) { return []; }
    if (!Array.isArray(skuMap)) return [];

    const rows = skuMap.slice(0, 500).map(row => {
      const spec = normalizeSpec(row.specAttrs || row.specAttrsForShow || row.name || '');
      const price = row.price || row.discountPrice || row.priceDisplay || row.salePrice || row.offerPrice || '';
      const stockRaw = row.canBookCount ?? row.stock ?? row.inventory ?? row.quantity ??
        row.availableStock ?? row.amountOnSale ?? row.inventoryQuantity ?? row.stockNum ?? row.skuStock ?? '';
      const stock = normalizeStock(stockRaw);
      return {
        spec,
        parts: spec.split('>').map(part => cleanSkuPropName(part)).filter(Boolean),
        price: String(price || '').trim(),
        stock: String(stockRaw ?? '').trim(),
        stockNumber: stock,
        outOfStock: stock === 0,
      };
    }).filter(row => row.spec || row.price || row.stock);
    return skuStocksConflictWithExpectedVariants(rows, expectedVariants) ? [] : rows;
  }

  function skuStocksConflictWithExpectedVariants(rows, expectedVariants) {
    if (!Array.isArray(rows) || !rows.length || !Array.isArray(expectedVariants) || !expectedVariants.length) return false;
    const meaningfulVariants = expectedVariants.filter(variant => (variant.values || []).length >= 2);
    if (!meaningfulVariants.length) return false;
    const rowParts = rows.flatMap(row => row.parts || []).map(valueKey).filter(Boolean);
    if (!rowParts.length) return false;
    const mismatched = meaningfulVariants.filter(variant => {
      const values = (variant.values || []).map(valueKey).filter(Boolean);
      if (!values.length) return false;
      return values.every(value => !rowParts.some(part => part === value || part.includes(value) || value.includes(part)));
    });
    return mismatched.length >= Math.ceil(meaningfulVariants.length / 2);
  }

  function normalizeSpec(value) {
    return decodeHtml(decodeUnicode(value || ''))
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&')
      .trim();
  }

  function normalizeStock(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (/库存不足|缺货|售罄|无货|在庫なし|out/i.test(text)) return 0;
    const match = text.match(/-?\d+/);
    if (!match) return null;
    const stock = Number(match[0]);
    return Number.isFinite(stock) ? stock : null;
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

    const keyword = /(尺码|尺寸|规格|胸围|衣长|肩宽|腰围|臀围|裤长|袖长|下摆|CM|cm)/;
    const selectors = [
      '[class*="size"]',
      '[class*="Size"]',
      '[class*="table"]',
      '[class*="Table"]',
      '[class*="spec"]',
      '[class*="Spec"]',
      '[class*="detail"]',
      '[class*="Detail"]',
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const text = normalizeText(el.innerText || el.textContent || '', 8000);
        if (text.length > 30 && keyword.test(text) && text.split('\n').length >= 2) {
          blocks.push(text);
        }
      });
    });

    return uniqueBlocks(blocks).slice(0, 20);
  }

  function extractDetailText() {
    const blocks = [];
    const selectors = [
      '#detailContent',
      '#desc-lazyload-container',
      '[id*="detail"]',
      '[id*="description"]',
      '[class*="detail"]',
      '[class*="Detail"]',
      '[class*="desc"]',
      '[class*="Desc"]',
      '[class*="description"]',
      '[class*="Description"]',
    ];

    selectors.forEach(sel => {
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
    try { return str.replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); }
    catch(e) { return str; }
  }
})();
