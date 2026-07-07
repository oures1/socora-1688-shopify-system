// sidepanel.js

let config = {};
let scrapedData = null;
let selectedCollections = new Set();
let tags = [];  // デフォルト空
let variantState = [];
let currentTab = null;
let activeToolMode = 'register';
let inventoryTargets = [];
let inventoryTargetIndex = 0;
let activeInventoryTarget = null;
let confirmedInventoryTargetNo = '';
let mismatchedInventoryTargetNo = '';
let autoShopifySelectionPending = false;
const IS_EXTENSION = Boolean(globalThis.chrome?.runtime?.id);
const DEFAULT_CNY_RATE = 24;
const DEFAULT_SHIPPING_CNY = 38;
const DEFAULT_FEE_CNY = 6;
const SOURCE_AVAILABLE_STOCK_QTY = 100;
const SOURCE_OUT_OF_STOCK_QTY = 0;
const DEFAULT_ADMIN_APP_URL = 'https://socora-order-admin.onrender.com';
const DEFAULT_STOREFRONT_PRODUCT_BASE = 'https://socora-online.com/products';
const LAST_INPUTS_KEY = 'lastInputsSocora1688ToShopify';
const REGISTER_LOG_KEY = 'registerLogSocora1688ToShopify';
const SHOPIFY_CANDIDATES_KEY = 'shopifyCandidatesSocora1688ToShopify';
const DEFAULT_PRODUCT_TYPES = ['ボトムス', 'トップス', 'アウター', 'セットアップ', 'ワンピース', 'シューズ', 'バッグ', 'アクセサリー', 'インナー', 'ルームウェア', 'スポーツ', 'その他'];
const STATUS_OPTIONS = [
  { value: 'active', label: '公開（すぐに販売開始）' },
  { value: 'draft', label: '下書き（非公開）' },
];

async function sendTabMessageCompat(tabId, message, options) {
  if (!Number.isInteger(tabId)) {
    throw new Error('1688ページのタブIDを取得できませんでした。対象商品の1688ページを開き直してください。');
  }
  try {
    return await chrome.tabs.sendMessage(tabId, message, options);
  } catch (error) {
    const msg = String(error?.message || error || '');
    const canRetryWithoutOptions = options && (
      msg.includes('No matching signature') ||
      msg.includes('Invalid invocation') ||
      msg.includes('unexpected property')
    );
    if (!canRetryWithoutOptions) throw error;
    return chrome.tabs.sendMessage(tabId, message);
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}
const DEFAULT_VENDORS = ['socora'];
const COLOR_MASTER = [
  { code: '01', name: 'ホワイト', hex: '#ffffff', aliases: ['白', '白色', 'white'] },
  { code: '02', name: 'オフホワイト', hex: '#f7f5ee', aliases: ['米白', '米白色', 'offwhite', 'オフ白'] },
  { code: '03', name: 'アイボリーホワイト', hex: '#f4ead8', aliases: ['象牙白', 'ivorywhite'] },
  { code: '04', name: 'アイボリー', hex: '#f1eadb', aliases: ['象牙色', 'ivory'] },
  { code: '05', name: 'キナリ', hex: '#f4ead8', aliases: ['生成り', 'きなり'] },
  { code: '06', name: 'クリーム', hex: '#f3e6c5', aliases: ['奶油白', '奶油黄', '奶油黄色', '奶油黃', '奶油黃色', '奶白', '奶白色', 'クリームホワイト', 'cream'] },
  { code: '07', name: 'エクリュ', hex: '#eee4d1', aliases: ['ecru'] },
  { code: '08', name: 'ライトベージュ', hex: '#eadcc5', aliases: ['浅米色', 'lightbeige'] },
  { code: '09', name: 'ベージュ', hex: '#d7c4a3', aliases: ['米色', '杏色', 'beige', 'アプリコット'] },
  { code: '10', name: 'サンド', hex: '#d8c7a7', aliases: ['砂色', 'sand'] },
  { code: '11', name: 'グレージュ', hex: '#b8ada0', aliases: ['greige'] },
  { code: '12', name: 'トープ', hex: '#9a8878', aliases: ['taupe'] },
  { code: '13', name: 'サテン', hex: '#d8d2c4', aliases: ['satin'] },
  { code: '14', name: 'イエロー', hex: '#e6c84b', aliases: ['黄', '黄色', '柠檬', '柠檬黄', '柠檬黄色', '檸檬', '檸檬黄', '檸檬黃色', 'レモン', 'レモンイエロー', 'yellow', 'lemon', 'lemonyellow'] },
  { code: '15', name: 'マスタード', hex: '#c49a2c', aliases: ['姜黄', '姜黄色', 'mustard'] },
  { code: '16', name: 'ゴールド', hex: '#d4af37', aliases: ['金', '金色', 'gold'] },
  { code: '17', name: 'オレンジ', hex: '#d97732', aliases: ['橙', '橙色', 'orange'] },
  { code: '18', name: 'ディープオレンジ', hex: '#b65a2e', aliases: ['深橙', '深橙色', 'deeporange'] },
  { code: '19', name: 'テラコッタ', hex: '#b96845', aliases: ['砖橙', '砖橙色', '砖红', '砖红色', 'terracotta'] },
  { code: '20', name: 'コーラル', hex: '#e07a68', aliases: ['珊瑚色', 'coral'] },
  { code: '21', name: 'キャメル', hex: '#b08352', aliases: ['驼色', 'camel'] },
  { code: '22', name: 'ブラウン', hex: '#7a5638', aliases: ['棕', '棕色', '咖色', '咖啡色', 'brown', 'コーヒーブラウン'] },
  { code: '23', name: 'モカ', hex: '#8b6f5d', aliases: ['摩卡', 'mocha'] },
  { code: '24', name: 'ダークブラウン', hex: '#4b3327', aliases: ['深咖', '深咖色', '深棕', '深棕色', 'darkbrown'] },
  { code: '25', name: 'レッド', hex: '#b63835', aliases: ['红', '红色', '赤', 'red'] },
  { code: '26', name: 'ワイン', hex: '#6d2436', aliases: ['酒红', '酒红色', 'wine'] },
  { code: '27', name: 'ワインレッド', hex: '#6d2436', aliases: ['酒紅', '酒紅色', 'winered'] },
  { code: '28', name: 'ボルドー', hex: '#6e2632', aliases: ['バーガンディ', 'burgundy', 'bordeaux'] },
  { code: '29', name: 'ローズ', hex: '#c95f7f', aliases: ['玫红', '玫红色', 'ローズレッド', 'rose'] },
  { code: '30', name: 'ダスティピンク', hex: '#c995a5', aliases: ['雾粉', '雾粉色', '冰梅粉', '冰梅粉色', 'ミストピンク', 'dustypink'] },
  { code: '31', name: 'ピンク', hex: '#d6a6bb', aliases: ['粉', '粉色', '粉红', '粉红色', 'pink'] },
  { code: '32', name: 'ライトピンク', hex: '#efc8d4', aliases: ['浅粉', '浅粉色', '樱花粉', '樱花粉色', '樱粉', '櫻花粉', '櫻花粉色', '櫻粉', '桜花粉', '桜花粉色', '桜粉', 'lightpink'] },
  { code: '33', name: 'パープルピンク', hex: '#c995c3', aliases: ['紫粉', 'purplepink'] },
  { code: '34', name: 'ライラック', hex: '#c7a8d7', aliases: ['丁香紫', 'lilac'] },
  { code: '35', name: 'ラベンダー', hex: '#bca7d8', aliases: ['薰衣草', 'lavender'] },
  { code: '36', name: 'パープル', hex: '#8b7ab8', aliases: ['紫', '紫色', '秘境紫', '秘境紫色', 'purple'] },
  { code: '37', name: 'スカイブルー', hex: '#9bc7df', aliases: ['天蓝', '天蓝色', 'skyblue'] },
  { code: '38', name: 'サックス', hex: '#a9cfe5', aliases: ['sax', 'サックスブルー'] },
  { code: '39', name: 'ライトブルー', hex: '#a9c8de', aliases: ['浅蓝', '浅蓝色', 'lightblue'] },
  { code: '40', name: 'ブルー', hex: '#4f79a8', aliases: ['蓝', '蓝色', '青色', 'blue'] },
  { code: '41', name: 'デニムブルー', hex: '#55708f', aliases: ['复古蓝', '牛仔蓝', 'denimblue'] },
  { code: '42', name: 'ターコイズ', hex: '#39a7a5', aliases: ['青', '青色', 'ティール', 'turquoise', 'teal'] },
  { code: '43', name: 'ダークネイビー', hex: '#101b33', aliases: ['深藏青', '墨蓝', '墨蓝色', 'darknavy'] },
  { code: '44', name: 'ネイビー', hex: '#1f2d4a', aliases: ['藏青', '藏青色', '深蓝', '深蓝色', '船长蓝', '船长蓝色', '船長藍', '船長藍色', 'ネイビーブルー', 'navy'] },
  { code: '45', name: 'ミント', hex: '#b8d8c1', aliases: ['薄荷', '薄荷绿', '薄荷绿色', 'mint'] },
  { code: '46', name: 'セージ', hex: '#a2ad92', aliases: ['sage'] },
  { code: '47', name: 'ライトグリーン', hex: '#a7b887', aliases: ['浅绿', '浅绿色', '青柠绿', '青柠绿色', 'lightgreen'] },
  { code: '48', name: 'グリーン', hex: '#4f7d4a', aliases: ['绿', '绿色', '墨绿色', 'green'] },
  { code: '49', name: 'オリーブ', hex: '#70805b', aliases: ['橄榄', '橄榄绿', '橄榄绿色', 'olive'] },
  { code: '50', name: 'カーキ', hex: '#7c8764', aliases: ['卡其', '卡其色', '卡其绿', '卡其绿色', 'khaki'] },
  { code: '51', name: 'ダークグリーン', hex: '#3f5138', aliases: ['深绿', '深绿色', '暗绿', '暗绿色', '军绿', '军绿色', 'darkgreen', 'オリーブグリーン'] },
  { code: '52', name: 'シルバー', hex: '#c8c8c8', aliases: ['银', '银色', 'silver'] },
  { code: '53', name: 'ライトグレー', hex: '#d6d2cf', aliases: ['浅灰', '浅灰色', 'lightgray', 'lightgrey'] },
  { code: '54', name: 'アッシュグレー', hex: '#b7b9b6', aliases: ['麻灰', '麻灰色', 'ashgray', 'ashgrey'] },
  { code: '55', name: 'グレー', hex: '#a8a8a8', aliases: ['灰', '灰色', '露灰', '露灰色', '芥岚灰', '芥岚灰色', '芥嵐灰', '芥嵐灰色', '暴雨灰', '暴雨灰色', 'gray', 'grey'] },
  { code: '56', name: 'ダークグレー', hex: '#55585a', aliases: ['深灰', '深灰色', 'darkgray', 'darkgrey'] },
  { code: '57', name: 'チャコールグレー', hex: '#3f3f3f', aliases: ['炭灰', '炭灰色', 'charcoalgray'] },
  { code: '58', name: 'チャコール', hex: '#3a3a3a', aliases: ['木炭色', 'charcoal'] },
  { code: '59', name: 'スミクロ', hex: '#1f1f1f', aliases: ['墨黑', '墨色', 'スミ黒'] },
  { code: '60', name: 'ブラック', hex: '#111111', aliases: ['黑', '黑色', '暗夜黑', '暗夜黑色', '星耀黑', '曜石黑', 'オブシディアンブラック', 'スモークブラック', 'black'] },
  { code: '61', name: '迷彩', hex: '#6f7650', aliases: ['迷彩色', 'カモフラ', 'camouflage'] },
  { code: '62', name: 'ストライプ', hex: '#d9d9d9', aliases: ['条纹', '條紋', 'stripe'] },
  { code: '63', name: 'ボーダー', hex: '#111111', aliases: ['横条纹', 'ボーダー柄', 'border'] },
];

function supportedProductUrlScore(url) {
  const text = String(url || '');
  if (/https?:\/\/(?:item\.taobao\.com\/item|detail\.tmall\.com\/item)/i.test(text)) return 100;
  if (/https?:\/\/detail\.1688\.com\/offer\//i.test(text)) return 100;
  if (/https?:\/\/detail\.1688\.com(?:\/|$)/i.test(text) && /(?:\/offer\/|[?&]offerId=|\d{8,})/i.test(text)) return 95;
  if (/https?:\/\/[^/]+\.1688\.com\//i.test(text) && /(?:\/offer\/|[?&]offerId=|\d{8,})/i.test(text)) return 70;
  return 0;
}

function isSupportedProductUrl(url) {
  return supportedProductUrlScore(url) > 0;
}

function productTabTitleScore(title) {
  const text = String(title || '');
  if (!/(1688|阿里巴巴|Taobao|淘宝|天猫)/i.test(text)) return 0;
  if (!/(男|女|情侣|童|夏|春|秋|冬|款|新款|薄|厚|户外|防晒|防曬|防水|透气|透氣|连帽|連帽|拉链|拉鏈|夹克|外套|上衣|裤|褲|T恤|衬衫|襯衫)/i.test(text)) return 0;
  return 60;
}

function supportedProductTabScore(tab) {
  const urlScore = supportedProductUrlScore(tab?.url);
  if (urlScore > 0) return urlScore;
  const url = String(tab?.url || '');
  if (/https?:\/\/[^/]+\.1688\.com(?:\/|$)/i.test(url)) return productTabTitleScore(tab?.title);
  return 0;
}

function isSupportedProductTab(tab) {
  return supportedProductTabScore(tab) > 0;
}

function bestProductTab(tabs) {
  return (tabs || [])
    .map(tab => ({ tab, score: supportedProductTabScore(tab) }))
    .filter(item => item.score > 0)
    .sort((a, b) => (b.score - a.score) || ((b.tab?.active ? 1 : 0) - (a.tab?.active ? 1 : 0)) || ((b.tab?.lastAccessed || 0) - (a.tab?.lastAccessed || 0)))[0]?.tab || null;
}

function getSourceSiteName(url) {
  const text = String(url || '');
  if (/taobao\.com/i.test(text)) return 'Taobao';
  if (/tmall\.com/i.test(text)) return 'Tmall';
  return '1688';
}

function getSourceSiteId(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('taobao')) return 'taobao';
  if (text.includes('tmall')) return 'tmall';
  return '1688';
}

function getSourceSiteLabel(value) {
  const id = getSourceSiteId(value);
  if (id === 'taobao') return 'Taobao';
  if (id === 'tmall') return 'Tmall';
  return '1688';
}

function getProductSourceConfig(url) {
  const site = getSourceSiteId(url);
  if (site === 'taobao' || site === 'tmall') {
    return { site, label: getSourceSiteLabel(site), action: 'scrape_taobao', script: 'content-taobao.js' };
  }
  return { site: '1688', label: '1688', action: 'scrape_1688', script: 'content.js' };
}

function currentSourceSiteId() {
  return getSourceSiteId(scrapedData?.site || scrapedData?.url || '');
}

function currentSourceSiteLabel() {
  return getSourceSiteLabel(scrapedData?.site || scrapedData?.url || '');
}

function shippingWeightFromCny(value) {
  const shipping = Number(value || DEFAULT_SHIPPING_CNY);
  if (shipping === 46) return 1;
  if (shipping === 54) return 1.5;
  return 0.5;
}

// ===================== 初期化 =====================
document.addEventListener('DOMContentLoaded', async () => {
  // まず即座にUI確定（エラーが起きてもUIが固まらないように）
  document.getElementById('currentUrl').textContent = '1688またはTaobaoの商品ページを開いてください';
  document.getElementById('btnScrape').disabled = false; // ボタンは最初から有効
  setHeaderStatus(IS_EXTENSION ? '' : 'プレビュー');
  setupCustomSelects();

  // 設定読み込み（エラーでも続行）
  try { config = await getConfig(); } catch(e) { config = {}; }
  syncRateInputFromConfig();

  // タブ検索（失敗しても続行）
  try {
    const tab = await findProductTab();
    if (tab) {
      currentTab = tab;
      document.getElementById('currentUrl').textContent = tab.url;
    }
  } catch(e) {
    // タブ取得失敗は無視して続行
  }

  // ステータス表示を更新
  updateStatusButton();

  // イベント登録
  document.getElementById('btnModeRegister')?.addEventListener('click', () => setToolMode('register'));
  document.getElementById('btnModeInventory')?.addEventListener('click', () => setToolMode('inventory'));
  document.getElementById('btnScrape').addEventListener('click', async () => {
    if (!IS_EXTENSION) {
      loadPreviewProduct();
      return;
    }
    // クリック時に常に最新の商品タブを探す
    const freshTab = await findProductTab();
    if (!freshTab) {
      showAlert('err', '1688またはTaobaoの商品ページが見つかりません。先に商品ページを開いてください。');
      return;
    }
    currentTab = freshTab;
    document.getElementById('currentUrl').textContent = freshTab.url;
    startScraping(freshTab);
  });
  document.getElementById('inventoryTargetSearch')?.addEventListener('input', event => renderInventoryTargetOptions(event.target.value));
  document.getElementById('inventoryTargetOptions')?.addEventListener('click', event => {
    const button = event.target.closest('[data-target-index]');
    if (!button) return;
    selectInventoryTarget(Number(button.dataset.targetIndex));
  });
  document.getElementById('inventoryTargetList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-inventory-action]');
    if (!button) return;
    const index = Number(button.dataset.inventoryIndex);
    if (!Number.isFinite(index)) return;
    if (button.dataset.inventoryAction === 'open') openInventoryTargetAt(index);
    if (button.dataset.inventoryAction === 'save') checkCurrentInventoryPage();
    if (button.dataset.inventoryAction === 'shopify') openShopifyTargetAt(index);
    if (button.dataset.inventoryAction === 'next') showNextInventoryTarget();
  });
  if (IS_EXTENSION && chrome?.tabs?.onActivated && chrome?.tabs?.onUpdated) {
    const refreshInventoryTargetFromTab = () => {
      if (activeToolMode === 'inventory') updateInventoryCurrentUrl();
    };
    chrome.tabs.onActivated.addListener(refreshInventoryTargetFromTab);
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (activeToolMode === 'inventory' && (changeInfo.status === 'complete' || changeInfo.url)) {
        updateInventoryCurrentUrl();
      }
    });
  }
  document.getElementById('btnBulkDownload').addEventListener('click', bulkDownload);
  document.getElementById('btnRegister').addEventListener('click', () => registerProduct());
  document.getElementById('btnConfirmRegister')?.addEventListener('click', () => registerProduct());
  document.getElementById('btnBackToEdit')?.addEventListener('click', () => showPanel('productPanel'));
  document.getElementById('btnRegisterAnother').addEventListener('click', resetToStart);
  document.getElementById('btnReset').addEventListener('click', resetToStart);
  document.getElementById('btnSyncShopifyCandidates')?.addEventListener('click', () => syncShopifyCandidates(true));
  document.getElementById('btnReloadCollections')?.addEventListener('click', () => syncShopifyCandidates(true));
  document.getElementById('btnReloadTags')?.addEventListener('click', () => syncShopifyCandidates(true));
  document.getElementById('collectionSearch')?.addEventListener('input', renderCollectionOptions);
  document.getElementById('shopifyTagSearch')?.addEventListener('input', renderShopifyTagOptions);
  document.addEventListener('click', event => {
    if (!event.target.closest('.variant-color-field')) closeColorMenus();
    if (!event.target.closest('.custom-select')) closeCustomSelectMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeCustomSelectMenus();
  });
  document.getElementById('btnRefreshCombinedSource')?.addEventListener('click', renderCombinedSourceTools);
  document.getElementById('btnCopyCombinedSource')?.addEventListener('click', () => copyCombinedSourceText('combinedSourceText'));
  document.getElementById('btnDownloadCombinedSource')?.addEventListener('click', () => downloadCombinedSourceText('combinedSourceText'));
  document.getElementById('btnCopySuccessCombinedSource')?.addEventListener('click', () => copyCombinedSourceText('successCombinedSourceText'));
  document.getElementById('btnDownloadSuccessCombinedSource')?.addEventListener('click', () => downloadCombinedSourceText('successCombinedSourceText'));
  document.getElementById('btnCopyConfirmCombinedSource')?.addEventListener('click', () => copyCombinedSourceText('confirmCombinedSourceText'));
  document.getElementById('btnDownloadConfirmCombinedSource')?.addEventListener('click', () => downloadCombinedSourceText('confirmCombinedSourceText'));
  document.getElementById('btnApplyLastInputs')?.addEventListener('click', applyLastInputs);
  document.querySelectorAll('[data-tag-set]').forEach(button => {
    button.addEventListener('click', () => applyTagSet(button.dataset.tagSet));
  });
  document.getElementById('fCostCny').addEventListener('input', calculatePrice);
  document.getElementById('fCnyRate')?.addEventListener('input', handleRateChange);
  setupShippingOptions();
  setupLastInputAutosave();
  document.getElementById('fFee')?.addEventListener('input', calculatePrice);
  document.getElementById('fFee')?.addEventListener('change', calculatePrice);
  document.getElementById('fPriceJpy')?.addEventListener('input', calculateProfit);
  document.getElementById('fPriceJpy')?.addEventListener('change', calculateProfit);
  document.getElementById('fStatus').addEventListener('change', updateStatusButton);

  // タグ入力
  document.getElementById('tagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().replace(/,$/, '');
      if (val) { addTag(val); e.target.value = ''; }
    }
  });

  // コレクション・タグ読み込み（configロード後に実行）
  getConfig().then(async cfg => {
    config = cfg;
    syncRateInputFromConfig();
    await loadShopifyCandidateCache();
    if (config.storeSlug) {
      syncShopifyCandidates(false).catch(() => {
        loadCollections();
        loadShopifyTags();
        loadProductTypeVendorOptions();
      });
    } else {
      ['collectionOptions','shopifyTagChips'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<span style="color:#e03a3a;font-size:11px">ストア情報を確認してください</span>';
      });
    }
  });

  if (!IS_EXTENSION) {
    loadPreviewProduct();
    setToolMode('register');
  } else {
    chooseInitialToolMode();
  }
});

function updateStatusButton() {
  const status = document.getElementById('fStatus').value;
  const btn = document.getElementById('btnRegister');
  btn.textContent = status === 'active' ? 'Shopifyへ直接登録（公開）' : 'Shopifyへ直接登録（下書き）';
}

function setHeaderStatus(text) {
  const el = document.getElementById('headerStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('visible', Boolean(text));
}

function setupCustomSelects() {
  renderStatusOptions();
  renderProductTypeOptions();
  document.querySelectorAll('.custom-select-button').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const root = button.closest('.custom-select');
      const id = root?.dataset.customSelect;
      if (id) toggleCustomSelectMenu(id);
    });
  });
}

function customSelectParts(id) {
  const input = document.getElementById(id);
  const root = document.querySelector(`.custom-select[data-custom-select="${id}"]`);
  const button = root?.querySelector('.custom-select-button');
  const menu = root?.querySelector('.custom-select-menu');
  return { input, root, button, menu };
}

function normalizeSelectOption(option) {
  if (typeof option === 'string') return { value: option, label: option };
  return {
    value: String(option?.value || '').trim(),
    label: String(option?.label || option?.value || '').trim(),
  };
}

function getCustomSelectOptions(id) {
  if (id === 'fStatus') return STATUS_OPTIONS.map(normalizeSelectOption);
  if (id === 'fProductType') {
    return mergeUniqueValues(DEFAULT_PRODUCT_TYPES, shopifyProductTypes).map(value => ({ value, label: value }));
  }
  return [];
}

function renderStatusOptions() {
  renderCustomSelectOptions('fStatus', STATUS_OPTIONS);
}

function renderCustomSelectOptions(id, rawOptions = []) {
  const { input, button, menu } = customSelectParts(id);
  if (!input || !button || !menu) return;
  const options = rawOptions.map(normalizeSelectOption).filter(option => option.value);
  const current = input.value || options[0]?.value || '';
  const values = mergeUniqueValues(options.map(option => option.value), [current]);
  const normalizedOptions = values.map(value => options.find(option => option.value === value) || { value, label: value });
  if (!input.value && current) input.value = current;
  menu.innerHTML = '';
  normalizedOptions.forEach(option => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'custom-select-option';
    item.dataset.value = option.value;
    item.textContent = option.label;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', option.value === input.value ? 'true' : 'false');
    item.addEventListener('click', event => {
      event.stopPropagation();
      setCustomSelectValue(id, option.value);
      closeCustomSelectMenus();
    });
    menu.appendChild(item);
  });
  syncCustomSelectDisplay(id);
}

function syncCustomSelectDisplay(id) {
  const { input, button, menu } = customSelectParts(id);
  if (!input || !button) return;
  const option = getCustomSelectOptions(id).find(item => item.value === input.value);
  button.textContent = option?.label || input.value || '';
  menu?.querySelectorAll('.custom-select-option').forEach(item => {
    const selected = item.dataset.value === input.value;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}

function setCustomSelectValue(id, value, options = {}) {
  const { input } = customSelectParts(id);
  if (!input || value === undefined || value === null || value === '') return;
  input.value = String(value);
  if (id === 'fProductType') {
    shopifyProductTypes = mergeUniqueValues(DEFAULT_PRODUCT_TYPES, shopifyProductTypes, [input.value]);
    renderProductTypeOptions();
  } else {
    syncCustomSelectDisplay(id);
  }
  if (!options.silent) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function toggleCustomSelectMenu(id) {
  const { root, button, menu } = customSelectParts(id);
  if (!root || !button || !menu) return;
  const willOpen = menu.hidden;
  closeCustomSelectMenus();
  if (!willOpen) return;
  root.classList.add('open');
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  const selected = menu.querySelector('.custom-select-option.selected');
  if (selected) selected.scrollIntoView({ block: 'nearest' });
}

function closeCustomSelectMenus() {
  document.querySelectorAll('.custom-select').forEach(root => {
    const button = root.querySelector('.custom-select-button');
    const menu = root.querySelector('.custom-select-menu');
    root.classList.remove('open');
    if (menu) menu.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  });
}

// ===================== 管理番号の採番 =====================
const PRODUCT_NO_COUNTER_KEY = 'productNoCounterSocora1688S_v1';
const PRODUCT_NO_START = 1;
const PRODUCT_NO_SEED = PRODUCT_NO_START - 1;

function formatProductNo(number) {
  return 'S' + String(number).padStart(4, '0');
}

async function getNextProductNo() {
  if (!IS_EXTENSION) return formatProductNo(PRODUCT_NO_START);
  const serverNo = await fetchNextProductNoFromAdminApp();
  if (serverNo) return serverNo;
  return new Promise(resolve => {
    chrome.storage.local.get([PRODUCT_NO_COUNTER_KEY], data => {
      const current = Math.max(Number(data[PRODUCT_NO_COUNTER_KEY] || 0), PRODUCT_NO_SEED);
      const next = current + 1;
      chrome.storage.local.set({ [PRODUCT_NO_COUNTER_KEY]: next }, () => resolve(formatProductNo(next)));
    });
  });
}

async function getSuggestedProductNo() {
  if (!IS_EXTENSION) return formatProductNo(PRODUCT_NO_START);
  const serverNo = await fetchNextProductNoFromAdminApp();
  if (serverNo) return serverNo;
  return new Promise(resolve => {
    chrome.storage.local.get([PRODUCT_NO_COUNTER_KEY], data => {
      const current = Math.max(Number(data[PRODUCT_NO_COUNTER_KEY] || 0), PRODUCT_NO_SEED);
      resolve(formatProductNo(current + 1));
    });
  });
}

async function reserveProductNo(productNo) {
  if (!IS_EXTENSION) return;
  const match = String(productNo || '').trim().match(/^s(\d+)$/i);
  if (!match) return;
  const number = parseInt(match[1], 10);
  if (!Number.isFinite(number)) return;
  await reserveProductNoOnAdminApp(productNo);
  return new Promise(resolve => {
    chrome.storage.local.get([PRODUCT_NO_COUNTER_KEY], data => {
      const current = Math.max(Number(data[PRODUCT_NO_COUNTER_KEY] || 0), PRODUCT_NO_SEED);
      if (number > current) chrome.storage.local.set({ [PRODUCT_NO_COUNTER_KEY]: number }, resolve);
      else resolve();
    });
  });
}

async function fetchNextProductNoFromAdminApp() {
  try {
    const res = await fetch(`${getAdminAppUrl()}/api/next-product-no`, { credentials: 'include' });
    if (!res.ok) return '';
    const data = await res.json();
    return data.productNo || '';
  } catch(e) {
    return '';
  }
}

async function reserveProductNoOnAdminApp(productNo) {
  try {
    await fetch(`${getAdminAppUrl()}/api/reserve-product-no`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productNo }),
    });
  } catch(e) {}
}

function buildShopifyHandle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function syncRateInputFromConfig() {
  const input = document.getElementById('fCnyRate');
  if (!input) return;
  input.value = config.cnyRate || DEFAULT_CNY_RATE;
}

function getCnyRate() {
  return parseFloat(document.getElementById('fCnyRate')?.value) || config.cnyRate || DEFAULT_CNY_RATE;
}

function handleRateChange() {
  config.cnyRate = getCnyRate();
  if (IS_EXTENSION) {
    chrome.storage.local.set({ cnyRate: config.cnyRate });
  }
  calculatePrice();
}

function setupShippingOptions() {
  const input = document.getElementById('fShipping');
  const buttons = [...document.querySelectorAll('#shippingOptions .shipping-option')];
  if (!input || buttons.length === 0) return;

  const setActive = button => {
    input.value = button.dataset.shipping || String(DEFAULT_SHIPPING_CNY);
    buttons.forEach(btn => btn.classList.toggle('active', btn === button));
  };

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      setActive(button);
      calculatePrice();
      saveLastInputs();
    });
  });

  const initial = buttons.find(button => button.dataset.shipping === input.value) || buttons[0];
  if (initial) setActive(initial);
}

function storageGet(key, fallback) {
  if (!IS_EXTENSION) {
    try {
      const raw = localStorage.getItem(key);
      return Promise.resolve(raw ? JSON.parse(raw) : fallback);
    } catch(e) {
      return Promise.resolve(fallback);
    }
  }
  return new Promise(resolve => {
    chrome.storage.local.get([key], data => resolve(data[key] ?? fallback));
  });
}

function storageSet(key, value) {
  if (!IS_EXTENSION) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
    return Promise.resolve();
  }
  return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
}

function setupLastInputAutosave() {
  ['fStatus', 'fProductType', 'fVendor', 'fInventory', 'fCnyRate', 'fFee', 'fPriceJpy', 'fComparePriceJpy'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('input', saveLastInputs);
    el?.addEventListener('change', saveLastInputs);
  });
  document.getElementById('openAfterRegister')?.addEventListener('change', saveLastInputs);
  renderRegisterLog();
}

function collectLastInputs() {
  return {
    status: document.getElementById('fStatus')?.value || '',
    productType: document.getElementById('fProductType')?.value || '',
    vendor: document.getElementById('fVendor')?.value || '',
    inventory: document.getElementById('fInventory')?.value || '',
    cnyRate: document.getElementById('fCnyRate')?.value || '',
    fee: String(DEFAULT_FEE_CNY),
    shipping: document.getElementById('fShipping')?.value || '',
    openAfterRegister: document.getElementById('openAfterRegister')?.checked ?? true,
    tags: [...tags],
  };
}

function saveLastInputs() {
  return storageSet(LAST_INPUTS_KEY, collectLastInputs());
}

async function applyLastInputs() {
  const data = await storageGet(LAST_INPUTS_KEY, null);
  if (!data) {
    showAlert('warn', '前回設定はまだありません');
    return;
  }

  setValueIfExists('fStatus', data.status);
  setValueIfExists('fProductType', data.productType);
  setValueIfExists('fVendor', data.vendor);
  setValueIfExists('fInventory', data.inventory);
  setValueIfExists('fCnyRate', data.cnyRate);
  setValueIfExists('fFee', DEFAULT_FEE_CNY);
  setShippingValue(data.shipping || DEFAULT_SHIPPING_CNY);
  const openAfter = document.getElementById('openAfterRegister');
  if (openAfter) openAfter.checked = data.openAfterRegister !== false;
  if (Array.isArray(data.tags)) {
    tags = [...new Set(data.tags.filter(Boolean))];
    renderTags();
  }
  updateStatusButton();
  calculatePrice();
  showAlert('ok', '前回設定を反映しました');
  setTimeout(() => { document.getElementById('alert').className = 'alert'; }, 2500);
}

function setValueIfExists(id, value) {
  const el = document.getElementById(id);
  if (!el || value === undefined || value === null || value === '') return;
  if (id === 'fStatus' || id === 'fProductType') {
    setCustomSelectValue(id, value, { silent: true });
    return;
  }
  el.value = value;
}

function setShippingValue(value) {
  const input = document.getElementById('fShipping');
  const buttons = [...document.querySelectorAll('#shippingOptions .shipping-option')];
  if (!input) return;
  input.value = String(value || DEFAULT_SHIPPING_CNY);
  buttons.forEach(button => {
    button.classList.toggle('active', button.dataset.shipping === input.value);
  });
}

// ===================== 商品タブを探す =====================
async function findProductTab() {
  if (!IS_EXTENSION) return null;
  // 1. lastFocusedWindow（メインブラウザウィンドウのアクティブタブ）
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const activeProductTab = bestProductTab(tabs);
    if (activeProductTab) return activeProductTab;
    const activeDetectedTab = await findProductTabByContentScript(tabs);
    if (activeDetectedTab) return activeDetectedTab;
  } catch(e) {}

  // 2. 全タブから商品ページを検索
  try {
    const allTabs = await chrome.tabs.query({});
    const found = bestProductTab(allTabs);
    if (found) return found;
    const detected = await findProductTabByContentScript(allTabs);
    if (detected) return detected;
  } catch(e) {}

  try {
    const rememberedTab = await getRememberedSourceProductTab();
    if (rememberedTab) return rememberedTab;
  } catch(e) {}

  return null;
}

async function findActiveSourceTab() {
  if (!IS_EXTENSION) return null;
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const active = (tabs || []).find(tab => isSourceSiteUrl(tab?.url));
    if (active) return active;
    return await findProductTabByContentScript(tabs);
  } catch(e) {
    try {
      return await getRememberedSourceProductTab({ allowUnsupported: true });
    } catch(fallbackErr) {
      return null;
    }
  }
}

async function findProductTabByContentScript(tabs) {
  if (!IS_EXTENSION) return null;
  const candidates = (tabs || []).filter(tab => tab?.id);
  for (const tab of candidates) {
    try {
      const response = await sendTabMessageCompat(tab.id, { action: 'source_page_info' }, { frameId: 0 });
      const data = response?.data || {};
      if (!response?.success || !isSupportedProductUrl(data.url)) continue;
      return {
        ...tab,
        url: data.url,
        title: data.title || tab.title || '',
        sourcePageInfo: data,
      };
    } catch(e) {}
  }
  return null;
}

async function getRememberedSourceProductTab(options = {}) {
  if (!IS_EXTENSION) return null;
  const response = await chrome.runtime.sendMessage({ action: 'getLastSourcePageInfo' });
  const data = response?.data || null;
  if (!response?.success || !data?.url) return null;
  if (!options.allowUnsupported && !isSupportedProductUrl(data.url)) return null;
  let tab = null;
  if (data.tabId !== undefined && data.tabId !== null) {
    try { tab = await chrome.tabs.get(data.tabId); } catch(e) { tab = null; }
  }
  return {
    ...(tab || {}),
    id: data.tabId ?? tab?.id,
    windowId: data.windowId ?? tab?.windowId,
    url: data.url,
    title: data.title || tab?.title || '',
    sourcePageInfo: data,
  };
}

async function resolveMessageableSourceTab(tab) {
  if (Number.isInteger(tab?.id)) return tab;
  const urls = currentInventorySourceUrls(null, tab);
  try {
    const allTabs = await chrome.tabs.query({});
    const matched = (allTabs || []).find(candidate => (
      Number.isInteger(candidate?.id) &&
      urls.some(url => sourceUrlsAreSame(candidate?.url, url))
    ));
    if (matched) {
      return {
        ...matched,
        url: tab?.url || matched.url,
        title: tab?.title || matched.title || '',
        sourcePageInfo: tab?.sourcePageInfo,
      };
    }
  } catch(e) {}
  try {
    const active = await findActiveSourceTab();
    if (Number.isInteger(active?.id)) return active;
  } catch(e) {}
  throw new Error('1688ページへ接続できませんでした。対象商品の「1688ページを開く」から開き直して、ページ読み込み後にもう一度保存してください。');
}

function isSourceSiteUrl(url) {
  return /(?:1688\.com|taobao\.com|tmall\.com)/i.test(String(url || ''));
}

function isLikelyBrokenSourcePage(tab) {
  if (!tab || !isSourceSiteUrl(tab.url)) return false;
  if (isSupportedProductTab(tab)) return false;
  const text = `${tab.title || ''} ${tab.url || ''}`;
  return /(404|not\s*found|未找到|找不到|抱歉|不存在|已下架|失效)/i.test(text)
    || Boolean(activeInventoryTarget && sourceUrlsMatchTarget(activeInventoryTarget, [tab.url]));
}

// ===================== 設定取得 =====================
function getConfig() {
  if (!IS_EXTENSION) {
    return Promise.resolve({
      storeSlug: 'y9wpse-tn',
      markupRate: 300,
      cnyRate: DEFAULT_CNY_RATE,
      adminAppUrl: DEFAULT_ADMIN_APP_URL,
      storefrontProductBase: DEFAULT_STOREFRONT_PRODUCT_BASE,
    });
  }
  return new Promise(resolve => {
    chrome.storage.local.get(['storeSlug', 'markupRate', 'cnyRate', 'adminAppUrl', 'storefrontProductBase'], data => {
      resolve({
        storeSlug:   data.storeSlug   || 'y9wpse-tn',
        markupRate:  parseFloat(data.markupRate)  || 300,
        cnyRate:     parseFloat(data.cnyRate)     || DEFAULT_CNY_RATE,
        adminAppUrl:  normalizeAdminAppUrl(data.adminAppUrl),
        storefrontProductBase: data.storefrontProductBase || DEFAULT_STOREFRONT_PRODUCT_BASE,
      });
    });
  });
}

function normalizeAdminAppUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_ADMIN_APP_URL;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(raw)) return DEFAULT_ADMIN_APP_URL;
  return raw;
}

// ===================== Shopify候補同期 =====================
let shopifyCollections = [];
let shopifyProductTypes = [...DEFAULT_PRODUCT_TYPES];
let shopifyVendors = [...DEFAULT_VENDORS];
let shopifyAvailableTags = [];
const DEFAULT_SHOPIFY_TAGS = [
  'ユニセックス', 'レディース', 'セットアップ', 'UPF50+', 'UVカット', 'ランキング',
  '表示_新作', '季節_2026春夏', '性別_ユニセックス', '性別_レディース', '性別_メンズ',
  'カテゴリ_セットアップ',
  '機能_UPF50+', '機能_UVカット', '機能_ストレッチ', '機能_軽量', '機能_速乾',
  '機能_通気', '機能_防水', '機能_撥水', '機能_防風', '機能_冷感',
  'シルエット_オーバーサイズ', 'シルエット_ワイド',
];
let shopifyCandidateCacheUpdatedAt = '';

async function loadShopifyCandidateCache() {
  renderProductTypeOptions();
  renderVendorOptions();
  const cache = await storageGet(SHOPIFY_CANDIDATES_KEY, null);
  if (!cache) return null;
  if (Array.isArray(cache.collections) && cache.collections.length) shopifyCollections = normalizeShopifyCollections(cache.collections);
  if (Array.isArray(cache.tags) && cache.tags.length) shopifyAvailableTags = sortShopifyTags(cache.tags);
  if (Array.isArray(cache.productTypes) && cache.productTypes.length) shopifyProductTypes = mergeUniqueValues(DEFAULT_PRODUCT_TYPES, cache.productTypes);
  if (Array.isArray(cache.vendors) && cache.vendors.length) shopifyVendors = mergeUniqueValues(DEFAULT_VENDORS, cache.vendors);
  shopifyCandidateCacheUpdatedAt = cache.updatedAt || '';
  renderProductTypeOptions();
  renderVendorOptions();
  renderCollectionOptions();
  renderShopifyTagOptions();
  updateShopifyCandidateSyncStatus(cache.updatedAt ? `前回同期 ${formatSyncTime(cache.updatedAt)} / ${shopifyCandidateSummaryText()}` : `候補を保存済み / ${shopifyCandidateSummaryText()}`);
  return cache;
}

async function saveShopifyCandidateCache() {
  shopifyCandidateCacheUpdatedAt = new Date().toISOString();
  await storageSet(SHOPIFY_CANDIDATES_KEY, {
    collections: normalizeShopifyCollections(shopifyCollections),
    tags: shopifyAvailableTags,
    productTypes: shopifyProductTypes,
    vendors: shopifyVendors,
    updatedAt: shopifyCandidateCacheUpdatedAt,
  });
}

async function syncShopifyCandidates(showDone = false) {
  if (!config.storeSlug) {
    showAlert('warn', 'Shopifyのストア設定を確認してください');
    return;
  }
  const btn = document.getElementById('btnSyncShopifyCandidates');
  if (btn) btn.disabled = true;
  updateShopifyCandidateSyncStatus('同期中...');
  try {
    await Promise.all([
      loadCollections({ silent: true, throwOnError: true }),
      loadShopifyTags({ silent: true, throwOnError: true }),
      loadProductTypeVendorOptions({ silent: true, throwOnError: true }),
    ]);
    await saveShopifyCandidateCache();
    updateShopifyCandidateSyncStatus(`同期済み ${formatSyncTime(shopifyCandidateCacheUpdatedAt)} / ${shopifyCandidateSummaryText()}`);
    if (showDone) {
      showAlert('ok', 'Shopify候補を同期しました');
      setTimeout(() => { document.getElementById('alert').className = 'alert'; }, 2500);
    }
  } catch(e) {
    updateShopifyCandidateSyncStatus('同期失敗');
    showAlert('err', 'Shopify候補の同期に失敗しました。Shopify管理画面にログインしているか確認してください。');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function updateShopifyCandidateSyncStatus(text) {
  const el = document.getElementById('shopifyCandidateSyncStatus');
  if (el) el.textContent = text;
}

function shopifyCandidateSummaryText() {
  return `タグ${shopifyAvailableTags.length}件 / 商品タイプ${shopifyProductTypes.length}件 / コレクション${shopifyCollections.length}件`;
}

function formatSyncTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function mergeUniqueValues(...groups) {
  return [...new Set(groups.flat().map(v => String(v || '').trim()).filter(Boolean))];
}

async function loadProductTypeVendorOptions(options = {}) {
  if (!IS_EXTENSION) {
    shopifyProductTypes = [...DEFAULT_PRODUCT_TYPES];
    shopifyVendors = [...DEFAULT_VENDORS];
    renderProductTypeOptions();
    renderVendorOptions();
    return;
  }
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'shopifyRequest',
      storeSlug: config.storeSlug,
      endpoint: '/products.json?limit=250&fields=product_type,vendor',
      method: 'GET',
    });
    const products = res?.data?.products || [];
    const productTypes = products.map(p => p.product_type).filter(Boolean);
    const vendors = products.map(p => p.vendor).filter(Boolean);
    shopifyProductTypes = mergeUniqueValues(DEFAULT_PRODUCT_TYPES, productTypes).sort((a, b) => a.localeCompare(b, 'ja'));
    shopifyVendors = mergeUniqueValues(DEFAULT_VENDORS, vendors).sort((a, b) => a.localeCompare(b, 'ja'));
  } catch(e) {
    shopifyProductTypes = mergeUniqueValues(DEFAULT_PRODUCT_TYPES, shopifyProductTypes);
    shopifyVendors = mergeUniqueValues(DEFAULT_VENDORS, shopifyVendors);
    if (options.throwOnError) throw e;
  }
  renderProductTypeOptions();
  renderVendorOptions();
}

function renderProductTypeOptions() {
  const input = document.getElementById('fProductType');
  if (!input) return;
  const current = input.value || DEFAULT_PRODUCT_TYPES[0];
  const values = mergeUniqueValues(DEFAULT_PRODUCT_TYPES, shopifyProductTypes, [current]);
  shopifyProductTypes = values;
  input.value = current;
  renderCustomSelectOptions('fProductType', values);
}

function renderVendorOptions() {
  const datalist = document.getElementById('vendorOptions');
  if (!datalist) return;
  datalist.innerHTML = '';
  mergeUniqueValues(DEFAULT_VENDORS, shopifyVendors).forEach(value => {
    const opt = document.createElement('option');
    opt.value = value;
    datalist.appendChild(opt);
  });
}

// ===================== コレクション =====================

async function loadCollections(options = {}) {
  const container = document.getElementById('collectionOptions');
  if (!container) return;

  if (!IS_EXTENSION) {
    shopifyCollections = normalizeShopifyCollections([
      { id: 1, title: 'セール' },
      { id: 2, title: 'メンズ / ユニセックス/アウター' },
      { id: 3, title: 'メンズ / ユニセックス/グッズ' },
      { id: 4, title: 'メンズ / ユニセックス/トップス' },
      { id: 5, title: 'メンズ / ユニセックス/ボトムス' },
      { id: 6, title: 'メンズ / ユニセックス/セットアップ' },
      { id: 7, title: 'レディース/アウター' },
      { id: 8, title: 'レディース/グッズ' },
      { id: 9, title: 'レディース/トップス' },
      { id: 10, title: 'レディース/ボトムス' },
      { id: 11, title: 'レディース/セットアップ' },
    ]);
    applyAutoCollectionSelection();
    renderCollectionOptions();
    return;
  }

  container.innerHTML = '<span style="color:var(--muted);font-size:11px">読み込み中...</span>';
  try {
    shopifyCollections = normalizeShopifyCollections(await fetchShopifyCollections());
    if (!shopifyCollections.length) {
      container.innerHTML = '<span style="color:var(--muted);font-size:11px">取得失敗（Shopifyにログイン確認）</span>';
      if (options.throwOnError) throw new Error('コレクションを取得できませんでした');
      return;
    }
    applyAutoCollectionSelection();
    renderCollectionOptions();
  } catch(e) {
    container.innerHTML = '<span style="color:#e03a3a;font-size:11px">取得失敗 - Shopifyにログインしてください</span>';
    if (!options.silent || options.throwOnError) throw e;
  }
}

async function fetchShopifyCollections() {
  const endpoints = [
    { key: 'custom_collections', endpoint: '/custom_collections.json?limit=250&fields=id,title,handle' },
    { key: 'smart_collections', endpoint: '/smart_collections.json?limit=250&fields=id,title,handle' },
  ];
  const results = await Promise.all(endpoints.map(item => chrome.runtime.sendMessage({
    action: 'shopifyRequest',
    storeSlug: config.storeSlug,
    endpoint: item.endpoint,
    method: 'GET',
  }).then(res => ({ item, res })).catch(() => ({ item, res: null }))));
  return results.flatMap(({ item, res }) => res?.success ? (res.data?.[item.key] || []) : [])
    .map(col => ({ id: col.id, title: col.title || '', handle: col.handle || '' }))
    .filter(col => col.id && col.title);
}

function normalizeShopifyCollections(collections) {
  const seen = new Set();
  return (collections || [])
    .map(col => ({
      id: col?.id,
      title: cleanCollectionTitle(col?.title || col?.name || ''),
      handle: String(col?.handle || '').trim(),
    }))
    .filter(col => col.id && col.title)
    .filter(col => {
      const key = collectionCompareKey(col);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'ja', { numeric: true, sensitivity: 'base' }));
}

function cleanCollectionTitle(title) {
  return String(title || '')
    .replace(/\uFFFD+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectionCompareKey(collection) {
  const title = cleanCollectionTitle(collection?.title || '');
  return normalizeMatchText(title || collection?.handle || collection?.id);
}

function selectedCollectionKeys() {
  const keys = new Set();
  selectedCollections.forEach(id => {
    const col = shopifyCollections.find(item => Number(item.id) === Number(id));
    if (col) keys.add(collectionCompareKey(col));
  });
  return keys;
}

function applyAutoCollectionSelection() {
  if (!autoShopifySelectionPending || !scrapedData || !shopifyCollections.length) return;
  const intent = analyzeProductIntent(scrapedData);
  const matched = shopifyCollections.filter(col => collectionMatchesIntent(col.title, intent));
  selectedCollections = new Set(normalizeShopifyCollections(matched).map(col => Number(col.id)).filter(Boolean));
  autoShopifySelectionPending = false;
}

function collectionMatchesIntent(title, intent) {
  const text = normalizeMatchText(title);
  if (!text || text.includes('セール') || text.includes('sale')) return false;
  const featureOk = (intent.featureCollectionKeywords || []).some(keyword => text.includes(normalizeMatchText(keyword)));
  if (featureOk) return true;

  const seasonOk = (intent.seasonCollectionKeywords || []).some(keyword => text.includes(normalizeMatchText(keyword)));
  if (seasonOk) return true;

  const categoryOk = (intent.collectionKeywords || []).some(keyword => text.includes(normalizeMatchText(keyword)));
  if (!categoryOk) return false;

  if (intent.gender === 'ladies') return text.includes('レディース') || text.includes('women');
  if (intent.gender === 'mens') return text.includes('メンズ') || text.includes('mens') || text.includes('ユニセックス') || text.includes('unisex');
  if (intent.gender === 'unisex') {
    return text.includes('ユニセックス') || text.includes('unisex') || text.includes('メンズ') || text.includes('レディース');
  }
  return true;
}

function setupCollectionMatchesIntent(title, intent = {}) {
  const text = normalizeMatchText(title);
  if (!text || (!text.includes('セットアップ') && !text.includes('setup'))) return false;
  if (intent.gender === 'ladies') return text.includes('レディース') || text.includes('women');
  if (intent.gender === 'mens') {
    return text.includes('メンズ') || text.includes('mens') || text.includes('ユニセックス') || text.includes('unisex');
  }
  if (intent.gender === 'unisex') {
    return text.includes('ユニセックス') || text.includes('unisex') || text.includes('メンズ') || text.includes('レディース') || text === 'セットアップ';
  }
  return true;
}

function setupCollectionTitlesForIntent(intent = {}) {
  if (intent.gender === 'ladies') return ['レディース/セットアップ'];
  if (intent.gender === 'mens') return ['メンズ / ユニセックス/セットアップ'];
  return ['メンズ / ユニセックス/セットアップ', 'レディース/セットアップ'];
}

async function createShopifyCustomCollection(title) {
  const res = await chrome.runtime.sendMessage({
    action: 'shopifyRequest',
    storeSlug: config.storeSlug,
    endpoint: '/custom_collections.json',
    method: 'POST',
    body: {
      custom_collection: {
        title,
      },
    },
  });
  const collection = res?.data?.custom_collection;
  if (!res?.success || !collection?.id) {
    throw new Error(`Shopifyコレクション「${title}」を作成できませんでした`);
  }
  return { id: collection.id, title: collection.title || title, handle: collection.handle || '' };
}

async function ensureSetupCollectionsForShopifyRegistration() {
  if (!IS_EXTENSION || !scrapedData) return;
  const intent = analyzeProductIntent(scrapedData);
  if (intent.productType !== 'セットアップ') return;

  if (!shopifyCollections.length) {
    await loadCollections({ silent: true, throwOnError: true });
  }

  const existing = shopifyCollections.filter(col => setupCollectionMatchesIntent(col.title, intent));
  if (existing.length) {
    existing.forEach(col => selectedCollections.add(Number(col.id)));
    renderCollectionOptions();
    return;
  }

  const created = [];
  for (const title of setupCollectionTitlesForIntent(intent)) {
    const sameTitle = shopifyCollections.find(col => normalizeMatchText(col.title) === normalizeMatchText(title));
    if (sameTitle?.id) {
      created.push(sameTitle);
      continue;
    }
    created.push(await createShopifyCustomCollection(title));
  }
  shopifyCollections = normalizeShopifyCollections([...shopifyCollections, ...created]);
  created.forEach(col => selectedCollections.add(Number(col.id)));
  await saveShopifyCandidateCache();
  renderCollectionOptions();
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[／/・\s_-]+/g, '');
}

function renderCollectionOptions() {
  const container = document.getElementById('collectionOptions');
  if (!container) return;
  const query = document.getElementById('collectionSearch')?.value.trim().toLowerCase() || '';
  const intent = scrapedData ? analyzeProductIntent(scrapedData) : null;
  const list = normalizeShopifyCollections(shopifyCollections)
    .filter(col => col.title.toLowerCase().includes(query));

  container.innerHTML = '';
  if (list.length === 0) {
    container.innerHTML = '<span style="color:var(--muted);font-size:11px">該当するコレクションなし</span>';
    return;
  }

  const selectedKeys = selectedCollectionKeys();
  const recommendedKeys = new Set(
    intent ? list.filter(col => collectionMatchesIntent(col.title, intent)).map(collectionCompareKey) : []
  );
  const selectedOrRecommended = list.filter(col => {
    const key = collectionCompareKey(col);
    return selectedKeys.has(key) || recommendedKeys.has(key);
  });
  const other = list.filter(col => {
    const key = collectionCompareKey(col);
    return !selectedKeys.has(key) && !recommendedKeys.has(key);
  });

  const renderGroup = (label, items, options = {}) => {
    if (!items.length) return;
    if (!query && label) appendChipGroupLabel(container, label);
    items.forEach(col => renderCollectionChip(container, col, {
      recommended: recommendedKeys.has(collectionCompareKey(col)) || options.recommended,
    }));
  };

  if (query) {
    list.forEach(col => renderCollectionChip(container, col, {
      recommended: recommendedKeys.has(collectionCompareKey(col)),
    }));
    return;
  }

  renderGroup('自動選択 / おすすめ', selectedOrRecommended, { recommended: true });
  renderGroup('その他（必要なときだけ選択）', other.slice(0, 10));
  if (other.length > 10) appendChipNote(container, `ほか${other.length - 10}件は検索すると表示できます。`);
}

function renderCollectionChip(container, col, options = {}) {
    const id = Number(col.id);
    const chip = document.createElement('span');
    chip.className = 'col-chip';
    if (options.recommended) chip.classList.add('recommended');
    chip.textContent = col.title;
    chip.dataset.id = String(id);
    const collectionKey = collectionCompareKey(col);
    const selectedKeys = selectedCollectionKeys();
    if (selectedCollections.has(id) || selectedKeys.has(collectionKey)) chip.classList.add('selected');
    chip.addEventListener('click', () => {
      if (selectedCollections.has(id)) {
        selectedCollections.delete(id);
        chip.classList.remove('selected');
      } else {
        shopifyCollections
          .filter(item => collectionCompareKey(item) === collectionKey)
          .forEach(item => selectedCollections.delete(Number(item.id)));
        selectedCollections.add(id);
        chip.classList.add('selected');
      }
      renderCollectionOptions();
    });
    container.appendChild(chip);
}

function appendChipGroupLabel(container, label) {
  const el = document.createElement('div');
  el.className = 'chip-group-label';
  el.textContent = label;
  container.appendChild(el);
}

function appendChipNote(container, text) {
  const el = document.createElement('div');
  el.className = 'chip-note';
  el.textContent = text;
  container.appendChild(el);
}

// ===================== Shopifyタグ読み込み =====================
async function loadShopifyTags(options = {}) {
  const container = document.getElementById('shopifyTagChips');
  if (!container) return;

  if (!IS_EXTENSION) {
    shopifyAvailableTags = [...DEFAULT_SHOPIFY_TAGS];
    renderShopifyTagOptions();
    return;
  }

  container.innerHTML = '<span style="color:var(--muted);font-size:11px">読み込み中...</span>';
  try {
    shopifyAvailableTags = await fetchShopifyTagSuggestions();
    if (shopifyAvailableTags.length === 0) {
      container.innerHTML = '<span style="color:var(--muted);font-size:11px">タグなし（下の入力欄から追加）</span>';
      if (options.throwOnError) throw new Error('タグを取得できませんでした');
      return;
    }
    renderShopifyTagOptions();
  } catch(e) {
    shopifyAvailableTags = [...DEFAULT_SHOPIFY_TAGS];
    renderShopifyTagOptions();
    if (!options.silent || options.throwOnError) throw e;
  }
}

async function fetchShopifyTagSuggestions() {
  const tagRes = await chrome.runtime.sendMessage({
    action: 'shopifyRequest',
    storeSlug: config.storeSlug,
    endpoint: '/products/tags.json?limit=250&popular=1',
    method: 'GET',
  }).catch(() => null);

  const directTags = extractTagListFromResponse(tagRes?.data);
  if (tagRes?.success && directTags.length > 0) return sortShopifyTags(directTags);

  const productRes = await chrome.runtime.sendMessage({
    action: 'shopifyRequest',
    storeSlug: config.storeSlug,
    endpoint: '/products.json?limit=250&fields=tags',
    method: 'GET',
  });

  const tagSet = new Set();
  (productRes.data?.products || []).forEach(p => {
    if (p.tags) p.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
  });
  return sortShopifyTags([...tagSet]);
}

function extractTagListFromResponse(data) {
  const raw = data?.tags || data?.product_tags || data?.data?.shop?.productTags?.edges?.map(edge => edge.node);
  if (!raw) return [];
  return raw.map(tag => typeof tag === 'string' ? tag : (tag?.name || tag?.value || ''))
    .map(tag => tag.trim())
    .filter(Boolean);
}

function renderShopifyTagOptions() {
  const container = document.getElementById('shopifyTagChips');
  if (!container) return;
  const query = document.getElementById('shopifyTagSearch')?.value.trim().toLowerCase() || '';
  const intent = scrapedData ? analyzeProductIntent(scrapedData) : null;
  const recommendedTags = new Set(intent ? recommendedShopifyTags(intent).map(normalizeTagKey) : []);
  const visibleTags = shopifyAvailableTags.filter(tag => tag.toLowerCase().includes(query));

  container.innerHTML = '';
  if (visibleTags.length === 0) {
    container.innerHTML = '<span style="color:var(--muted);font-size:11px">該当するタグなし</span>';
    return;
  }

  const selectedOrRecommended = visibleTags.filter(tag => tags.includes(tag) || recommendedTags.has(normalizeTagKey(tag)));
  const other = visibleTags.filter(tag => !tags.includes(tag) && !recommendedTags.has(normalizeTagKey(tag)));

  const renderGroup = (label, items) => {
    if (!items.length) return;
    if (!query && label) appendChipGroupLabel(container, label);
    items.forEach(tag => renderShopifyTagChip(container, tag, recommendedTags.has(normalizeTagKey(tag))));
  };

  if (query) {
    visibleTags.forEach(tag => renderShopifyTagChip(container, tag, recommendedTags.has(normalizeTagKey(tag))));
    return;
  }

  renderGroup('自動選択 / おすすめ', selectedOrRecommended);
  renderGroup('その他（検索で追加）', other.slice(0, 14));
  if (other.length > 14) appendChipNote(container, `ほか${other.length - 14}件は検索すると表示できます。`);
}

function renderShopifyTagChip(container, tag, recommended = false) {
    const chip = document.createElement('span');
    chip.className = 'col-chip';
    if (recommended) chip.classList.add('recommended');
    chip.textContent = tag;
    chip.dataset.tag = tag;
    if (tags.includes(tag)) chip.classList.add('selected');
    chip.addEventListener('click', () => {
      if (tags.includes(tag)) {
        tags = tags.filter(t => t !== tag);
        chip.classList.remove('selected');
      } else {
        tags.push(tag);
        chip.classList.add('selected');
      }
      renderTags();
      syncTagChips();
      saveLastInputs();
    });
    container.appendChild(chip);
}

function sortShopifyTags(values) {
  const priority = new Map(DEFAULT_SHOPIFY_TAGS.map((tag, index) => [tag.toLowerCase(), index]));
  return [...new Set([...(values || []), ...DEFAULT_SHOPIFY_TAGS])]
    .filter(Boolean)
    .sort((a, b) => {
      const ai = priority.has(a.toLowerCase()) ? priority.get(a.toLowerCase()) : 999;
      const bi = priority.has(b.toLowerCase()) ? priority.get(b.toLowerCase()) : 999;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b, 'ja');
    });
}

// タグ選択後にチップの選択状態を同期
function syncTagChips() {
  document.querySelectorAll('#shopifyTagChips .col-chip').forEach(chip => {
    if (tags.includes(chip.dataset.tag)) chip.classList.add('selected');
    else chip.classList.remove('selected');
  });
}

function applyTagSet(type) {
  const sets = {
    ladies: ['レディース', '性別_レディース'],
    unisex: ['ユニセックス', '性別_ユニセックス'],
    ranking: ['ランキング', '表示_ランキング'],
    uv: ['UPF50+', 'UVカット', '機能_UPF50+', '機能_UVカット'],
  };
  if (type === 'clear') {
    tags = [];
  } else {
    (sets[type] || []).forEach(tag => {
      if (!tags.includes(tag)) tags.push(tag);
    });
  }
  renderTags();
  syncTagChips();
  saveLastInputs();
}

// ===================== 在庫確認 =====================
function setToolMode(mode) {
  activeToolMode = mode === 'inventory' ? 'inventory' : 'register';
  syncToolModeButtons();
  document.getElementById('alert').className = 'alert';
  if (activeToolMode === 'inventory') {
    updateInventoryCurrentUrl();
    showPanel('inventoryPanel');
    if (!inventoryTargets.length) loadInventoryTargets({ silent: false });
  } else {
    showPanel(scrapedData ? 'productPanel' : 'startPanel');
  }
}

function syncToolModeButtons() {
  document.querySelectorAll('[data-tool-mode]').forEach(button => {
    const isActive = button.dataset.toolMode === activeToolMode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

async function chooseInitialToolMode() {
  try {
    const tab = await findProductTab();
    if (tab) {
      currentTab = tab;
      const currentUrl = document.getElementById('currentUrl');
      if (currentUrl) currentUrl.textContent = tab.url || '';
    }
  } catch(e) {
    // 初期表示は商品登録を優先する。在庫確認はユーザーが手動で押した時だけ開く。
  }
  setToolMode('register');
}

function setInventoryStatus(message, tone = 'info') {
  const el = document.getElementById('inventoryStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `inventory-status-box tone-${tone}`;
}

function setInventoryStatusHtml(html, tone = 'info') {
  const el = document.getElementById('inventoryStatus');
  if (!el) return;
  el.innerHTML = html;
  el.className = `inventory-status-box tone-${tone} is-html`;
}

async function updateInventoryCurrentUrl() {
  try {
    const tab = await findProductTab();
    currentTab = tab || currentTab;
    const text = tab?.url ? shortUrl(tab.url) : '1688またはTaobaoの商品ページを開いてください';
    const el = document.getElementById('inventoryCurrentUrl');
    if (el && tab?.url) el.title = tab.url;
    if (el) el.textContent = text;
    if (tab?.url && inventoryTargets.length) {
      const pageTarget = await detectCurrentPageInventoryTarget({ tab });
      renderInventoryTargets();
      if (!pageTarget && isSourceSiteUrl(tab.url)) {
        setInventoryStatus('現在ページは商品マスターの確認対象と一致しません。保存していません。', 'danger');
      }
    }
  } catch(e) {
    const el = document.getElementById('inventoryCurrentUrl');
    if (el) el.textContent = '現在ページを取得できません';
  }
}

function inventoryStatusLabel(check) {
  if (!check) return '未確認';
  return check.statusLabel || check.status || '未確認';
}

function inventoryTargetTone(check) {
  const status = String(check?.status || '').toLowerCase();
  if (!check) return 'pending';
  if (['available', 'in_stock', 'ok'].includes(status)) return 'ok';
  if (['partial', 'unknown'].includes(status)) return 'warn';
  if (['out', 'error', 'protected', 'link_broken'].includes(status)) return 'danger';
  return 'pending';
}

function inventoryStatusToneFromCheck(check) {
  const tone = inventoryTargetTone(check);
  if (tone === 'ok') return 'ok';
  if (tone === 'danger') return 'danger';
  if (tone === 'warn') return 'warn';
  return 'info';
}

function shortUrl(value) {
  const text = String(value || '');
  if (text.length <= 120) return text;
  try {
    const url = new URL(text);
    const id = url.pathname.match(/\/offer\/(\d+)/i)?.[1] || url.searchParams.get('offerId') || url.searchParams.get('id') || '';
    return `${url.origin}${id ? `/offer/${id}.html` : url.pathname} ...`;
  } catch(e) {
    return `${text.slice(0, 100)} ...`;
  }
}

function formatChangeLine(change) {
  if (!change) return '';
  const before = change.before === undefined || change.before === null || change.before === '' ? 'なし' : change.before;
  const after = change.after === undefined || change.after === null || change.after === '' ? 'なし' : change.after;
  const label = change.label || change.field || '変更';
  const sku = change.sku ? `${change.sku} ` : '';
  return `${sku}${label}: ${before} → ${after}`;
}

function inventoryChangePreview(check) {
  const changes = Array.isArray(check?.changes) ? check.changes : [];
  if (!changes.length) return '';
  const lines = changes.slice(0, 3).map(formatChangeLine).filter(Boolean);
  if (changes.length > lines.length) lines.push(`ほか${changes.length - lines.length}件`);
  return lines.map(line => `<div>${escapeHtml(line)}</div>`).join('');
}

function inventoryTargetDateSummary(check) {
  const checkedAt = check?.checkedAt || '';
  const appliedAt = check?.shopifyAppliedAt || check?.appliedAt || '';
  return `
    <div class="inventory-target-dates">
      <div>最終確認: <strong>${escapeHtml(checkedAt ? formatSyncTime(checkedAt) : '未確認')}</strong></div>
      <div>Shopify反映: <strong>${escapeHtml(appliedAt ? formatSyncTime(appliedAt) : '未反映')}</strong></div>
    </div>
  `;
}

function productNoSortNumber(value) {
  const match = String(value || '').match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function sortInventoryTargets(targets) {
  return [...(targets || [])].sort((a, b) => {
    const byNumber = productNoSortNumber(a?.productNo) - productNoSortNumber(b?.productNo);
    if (byNumber !== 0) return byNumber;
    return String(a?.productNo || '').localeCompare(String(b?.productNo || ''), 'ja');
  });
}

function currentInventoryTargetIndex() {
  if (!inventoryTargets.length) return -1;
  if (activeInventoryTarget?.productNo) {
    const activeIndex = inventoryTargets.findIndex(item => item.productNo === activeInventoryTarget.productNo);
    if (activeIndex >= 0) return activeIndex;
  }
  return Math.min(Math.max(inventoryTargetIndex, 0), inventoryTargets.length - 1);
}

function currentSelectedInventoryTarget() {
  const index = currentInventoryTargetIndex();
  if (index < 0) return null;
  if (activeInventoryTarget?.productNo) {
    const active = inventoryTargets.find(item => item.productNo === activeInventoryTarget.productNo);
    if (active) return active;
  }
  return inventoryTargets[index] || null;
}

function setCurrentInventoryTarget(target) {
  if (!target?.productNo) return;
  const index = inventoryTargets.findIndex(item => item.productNo === target.productNo);
  if (index >= 0) inventoryTargetIndex = index;
  activeInventoryTarget = inventoryTargets[index] || target;
}

async function detectCurrentPageInventoryTarget(options = {}) {
  let tab = options.tab || null;
  if (!tab && IS_EXTENSION) {
    try { tab = await findProductTab(); } catch(e) { tab = null; }
  }
  if (tab) currentTab = tab;
  const urls = currentInventorySourceUrls(null, tab);
  if (!urls.length || !inventoryTargets.length) return null;
  const pageTarget = findInventoryTargetForUrls(urls);
  if (pageTarget) {
    setCurrentInventoryTarget(pageTarget);
    confirmedInventoryTargetNo = pageTarget.productNo || '';
    mismatchedInventoryTargetNo = '';
    const search = document.getElementById('inventoryTargetSearch');
    if (search) search.value = '';
    return pageTarget;
  }
  if (isSourceSiteUrl(tab?.url)) {
    confirmedInventoryTargetNo = '';
    mismatchedInventoryTargetNo = '';
  }
  return null;
}

function inventoryTargetIsConfirmed(target = currentSelectedInventoryTarget()) {
  return Boolean(target?.productNo && confirmedInventoryTargetNo === target.productNo && !mismatchedInventoryTargetNo);
}

function syncInventorySaveButtonState() {
  const button = document.getElementById('btnCheckCurrentInventory');
  if (!button) return;
  const target = currentSelectedInventoryTarget();
  const confirmed = inventoryTargetIsConfirmed(target);
  button.disabled = !confirmed;
  button.title = confirmed
    ? `${describeInventoryTarget(target)} の在庫を保存できます`
    : '先に「現在ページと照合」で、開いているページと確認対象が一致していることを確認してください';
}

function renderInventoryTargetCard(item, index) {
  const isActive = activeInventoryTarget
    ? item.productNo === activeInventoryTarget.productNo
    : index === inventoryTargetIndex;
  const active = isActive ? ' active' : '';
  const check = item.lastInventoryCheck || item.latestCheck || null;
  const tone = inventoryTargetTone(check);
  const matched = confirmedInventoryTargetNo && item.productNo === confirmedInventoryTargetNo;
  const mismatched = mismatchedInventoryTargetNo && item.productNo === mismatchedInventoryTargetNo;
  const matchClass = matched ? ' confirmed' : mismatched ? ' mismatched' : '';
  const matchBadge = matched
    ? '<span class="inventory-pill match">現在ページと一致</span>'
    : mismatched
      ? '<span class="inventory-pill mismatch">現在ページと不一致</span>'
      : '';
  const changePreview = inventoryChangePreview(check);
  return `
    <div class="inventory-target-position">確認対象 ${index + 1} / ${inventoryTargets.length}</div>
    <div class="inventory-target ${tone}${active}${matchClass}">
      <strong>${escapeHtml(item.productNo || '')} ${escapeHtml(item.title || '')}</strong>
      <div class="inventory-target-meta">
        <span class="inventory-pill ${tone === 'pending' ? '' : tone}">${escapeHtml(inventoryStatusLabel(check))}</span>
        <span class="inventory-sku">SKU ${escapeHtml(item.skuCount || 0)}</span>
        ${matchBadge}
      </div>
      ${inventoryTargetDateSummary(check)}
      ${changePreview ? `<div class="inventory-change-list">${changePreview}</div>` : ''}
      <div class="inventory-target-actions">
        <button type="button" class="primary" data-inventory-action="open" data-inventory-index="${index}">1688ページを開く</button>
        <button type="button" class="primary" id="btnCheckCurrentInventory" data-inventory-action="save" data-inventory-index="${index}">現在ページの在庫を保存</button>
        <button type="button" data-inventory-action="shopify" data-inventory-index="${index}">Shopify管理画面</button>
        <button type="button" data-inventory-action="next" data-inventory-index="${index}">次の確認対象へ</button>
      </div>
    </div>
  `;
}

function renderInventoryTargets() {
  const list = document.getElementById('inventoryTargetList');
  if (!list) return;
  if (!inventoryTargets.length) {
    renderInventoryTargetOptions();
    list.innerHTML = '<div class="inventory-muted">対象商品がありません。</div>';
    syncInventorySaveButtonState();
    return;
  }
  const index = currentInventoryTargetIndex();
  const item = inventoryTargets[index];
  renderInventoryTargetOptions(document.getElementById('inventoryTargetSearch')?.value || '', index);
  list.innerHTML = item ? renderInventoryTargetCard(item, index) : '<div class="inventory-muted">確認対象を表示できません。</div>';
  syncInventorySaveButtonState();
}

function inventoryTargetOptionLabel(item, index) {
  const title = `${item.productNo || ''} ${item.title || ''}`.trim();
  const check = item.lastInventoryCheck || item.latestCheck || null;
  const status = inventoryStatusLabel(check);
  return {
    title: title || `確認対象 ${index + 1}`,
    meta: `${index + 1}/${inventoryTargets.length} / ${status} / SKU ${item.skuCount || 0}`,
  };
}

function renderInventoryTargetOptions(query = '', selectedIndex = currentInventoryTargetIndex()) {
  const options = document.getElementById('inventoryTargetOptions');
  if (!options) return;
  if (!inventoryTargets.length) {
    options.innerHTML = '<div class="inventory-muted">対象がありません。</div>';
    return;
  }
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const normalizedIndex = Math.min(Math.max(selectedIndex, 0), inventoryTargets.length - 1);
  const matches = inventoryTargets
    .map((item, index) => ({ item, index, label: inventoryTargetOptionLabel(item, index) }))
    .filter(({ item, label }) => {
      if (!normalizedQuery) return true;
      return `${item.productNo || ''} ${item.title || ''} ${label.meta}`.toLowerCase().includes(normalizedQuery);
    });
  const visible = matches;
  if (!visible.length) {
    options.innerHTML = '<div class="inventory-muted">一致する確認対象がありません。</div>';
    return;
  }
  options.innerHTML = visible.map(({ index, label }) => `
    <button type="button" class="inventory-target-option${index === normalizedIndex ? ' active' : ''}" data-target-index="${index}">
      ${escapeHtml(label.title)}
      <span class="inventory-target-option-sub">${escapeHtml(label.meta)}</span>
    </button>
  `).join('');
}

function selectInventoryTarget(index) {
  if (!Number.isFinite(index) || index < 0 || index >= inventoryTargets.length) return;
  inventoryTargetIndex = index;
  activeInventoryTarget = null;
  confirmedInventoryTargetNo = '';
  mismatchedInventoryTargetNo = '';
  const search = document.getElementById('inventoryTargetSearch');
  if (search) search.value = '';
  renderInventoryTargets();
  setInventoryStatus(`確認対象 ${index + 1} / ${inventoryTargets.length} を表示しました。`, 'info');
}

async function loadInventoryTargets(options = {}) {
  try {
    if (!options.silent) setInventoryStatus('確認対象を読み込み中...', 'info');
    const previousProductNo = activeInventoryTarget?.productNo || confirmedInventoryTargetNo || mismatchedInventoryTargetNo || '';
    const previousConfirmedNo = confirmedInventoryTargetNo;
    const previousMismatchedNo = mismatchedInventoryTargetNo;
    const previousPointerIndex = inventoryTargetIndex;
    const res = await fetch(`${getAdminAppUrl()}/api/inventory-check-targets`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '対象商品を読み込めませんでした');
    inventoryTargets = sortInventoryTargets(data.targets || []);
    const previousIndex = previousProductNo
      ? inventoryTargets.findIndex(item => item.productNo === previousProductNo)
      : -1;
    inventoryTargetIndex = previousIndex >= 0
      ? previousIndex
      : Math.min(Math.max(previousPointerIndex, 0), Math.max(0, inventoryTargets.length - 1));
    activeInventoryTarget = previousIndex >= 0 ? inventoryTargets[previousIndex] : null;
    confirmedInventoryTargetNo = previousIndex >= 0 ? previousConfirmedNo : '';
    mismatchedInventoryTargetNo = previousIndex >= 0 ? previousMismatchedNo : '';
    const pageTarget = await detectCurrentPageInventoryTarget();
    renderInventoryTargets();
    if (!options.silent) {
      if (pageTarget) {
        setInventoryStatus(`現在ページから ${describeInventoryTarget(pageTarget)} を確認対象にしました。この1件だけを表示しています。`, 'ok');
      } else {
        setInventoryStatus(`確認対象 ${inventoryTargets.length}件のうち、現在確認する1件だけを下に表示しました。`, 'info');
      }
    }
    if (options.focus) scrollInventoryTargetsIntoView();
  } catch(e) {
    setInventoryStatus(e.message || String(e), 'danger');
    syncInventorySaveButtonState();
  }
}

function scrollInventoryTargetsIntoView() {
  document.getElementById('inventoryTargetsCard')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

async function openCurrentInventoryTarget() {
  if (!inventoryTargets.length) await loadInventoryTargets({ silent: false });
  const index = currentInventoryTargetIndex();
  if (index < 0) {
    setInventoryStatus('開ける確認対象がありません。', 'warn');
    return;
  }
  await openInventoryTargetAt(index);
}

async function openCurrentShopifyTarget() {
  if (!inventoryTargets.length) await loadInventoryTargets({ silent: false });
  const index = currentInventoryTargetIndex();
  if (index < 0) {
    setInventoryStatus('Shopify管理画面を開ける確認対象がありません。', 'warn');
    return;
  }
  openShopifyTargetAt(index);
}

async function showNextInventoryTarget() {
  if (!inventoryTargets.length) await loadInventoryTargets({ silent: false });
  if (!inventoryTargets.length) {
    setInventoryStatus('次に表示できる確認対象がありません。', 'warn');
    return;
  }
  const currentIndex = currentInventoryTargetIndex();
  const nextIndex = currentIndex >= inventoryTargets.length - 1 ? 0 : currentIndex + 1;
  inventoryTargetIndex = nextIndex;
  activeInventoryTarget = null;
  confirmedInventoryTargetNo = '';
  mismatchedInventoryTargetNo = '';
  renderInventoryTargets();
  const message = nextIndex === 0 && currentIndex >= inventoryTargets.length - 1
    ? `最後まで確認しました。最初の確認対象 1 / ${inventoryTargets.length} に戻りました。`
    : `次の確認対象 ${nextIndex + 1} / ${inventoryTargets.length} を表示しました。`;
  setInventoryStatus(message, 'info');
  scrollInventoryTargetsIntoView();
}

async function confirmInventoryTarget(index) {
  const target = inventoryTargets[index];
  if (!target?.sourceUrl) {
    setInventoryStatus('確認できる対象商品がありません。', 'warn');
    return;
  }
  const tab = await findActiveSourceTab() || await findProductTab();
  if (!tab?.url) {
    setInventoryStatus(`${target.productNo || ''} の仕入れページを開いてから「対象商品を確認」を押してください。`, 'warn');
    return;
  }
  const urls = currentInventorySourceUrls(null, tab);
  const pageTarget = findInventoryTargetForUrls(urls);
  if (!sourceUrlsMatchTarget(target, urls)) {
    const pageLabel = pageTarget ? describeInventoryTarget(pageTarget) : '商品マスターにないページ';
    confirmedInventoryTargetNo = '';
    mismatchedInventoryTargetNo = target.productNo || '';
    renderInventoryTargets();
    setInventoryStatus(`保存前確認で不一致です。現在ページは ${pageLabel}、確認したい対象は ${describeInventoryTarget(target)} です。保存していません。対象商品の「1688ページを開く」から開き直してください。`, 'danger');
    return;
  }
  activeInventoryTarget = target;
  inventoryTargetIndex = index;
  confirmedInventoryTargetNo = target.productNo || '';
  mismatchedInventoryTargetNo = '';
  renderInventoryTargets();
  setInventoryStatus(`${describeInventoryTarget(target)} と現在ページが一致しました。「現在ページの在庫を保存」を押せます。`, 'ok');
}

async function openInventoryTargetAt(index, options = {}) {
  if (!inventoryTargets.length) await loadInventoryTargets({ silent: true });
  const target = inventoryTargets[index];
  if (!target?.sourceUrl) {
    setInventoryStatus('開ける対象商品がありません。', 'warn');
    return;
  }
  activeInventoryTarget = target;
  confirmedInventoryTargetNo = '';
  mismatchedInventoryTargetNo = '';
  inventoryTargetIndex = options.advance
    ? Math.min(index + 1, Math.max(0, inventoryTargets.length - 1))
    : index;
  renderInventoryTargets();
  setInventoryStatus(`${target.productNo || ''} の仕入れページを開きます。保存時に対象商品と現在ページの一致を確認します。`, 'info');
  openUrlInTab(target.sourceUrl);
}

function openShopifyTargetAt(index) {
  const target = inventoryTargets[index];
  const url = target?.shopifyAdminUrl || target?.shopifyUrl || '';
  if (!url) {
    setInventoryStatus(`${target?.productNo || ''} のShopify管理画面URLがまだありません。商品マスターのShopify紐づけを確認してください。`, 'warn');
    return;
  }
  activeInventoryTarget = target;
  inventoryTargetIndex = index;
  renderInventoryTargets();
  setInventoryStatus(`${target.productNo || ''} のShopify管理画面を開きます。1688ページと見比べて確認できます。`, 'info');
  openUrlInTab(url);
}

function openUrlInTab(url) {
  if (IS_EXTENSION) {
    chrome.tabs.create({ url, active: true });
  } else {
    window.open(url, '_blank');
  }
}

function inventoryPayloadFromScrapedData(data, tab) {
  const urls = currentInventorySourceUrls(data, tab);
  const target = requireMatchingInventoryTarget(urls, currentSelectedInventoryTarget());
  return {
    productNo: target?.productNo || '',
    title: data?.title || target?.title || '',
    sourceSite: getSourceSiteId(data?.site || tab?.url || ''),
    sourceUrl: data?.url || tab?.url || '',
    pageStatus: 'ok',
    skuStocks: data?.skuStocks || data?.skus || [],
    checkedAt: new Date().toISOString(),
  };
}

function inventoryPayloadForBrokenPage(tab) {
  const urls = currentInventorySourceUrls(null, tab);
  const target = requireMatchingInventoryTarget(urls, currentSelectedInventoryTarget());
  const sourceUrl = target.sourceUrl || tab?.url || '';
  return {
    productNo: target.productNo || '',
    title: target.title || tab?.title || '',
    sourceSite: getSourceSiteId(sourceUrl || tab?.url || ''),
    sourceUrl,
    pageStatus: 'link_broken',
    skuStocks: [],
    checkedAt: new Date().toISOString(),
    error: '仕入れページが404またはリンク切れです。商品が削除・移動・販売終了している可能性があります。',
  };
}

async function saveInventoryPayload(payload) {
  const res = await fetch(`${getAdminAppUrl()}/api/inventory-checks`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '在庫確認結果を保存できませんでした');
  return data.check || {};
}

function inventorySavedMessageHtml(check) {
  const changes = Array.isArray(check?.changes) ? check.changes : [];
  const changeCount = changes.length;
  const matched = check?.matchedVariants ?? '-';
  const updated = check?.updatedVariants ?? '-';
  const shopifyApplied = Boolean(check?.shopifyAppliedAt);
  const shopifyValue = shopifyApplied
    ? `済（${check.shopifyAppliedAt}）`
    : '未反映（Shopifyは変更なし）';
  const shopifyClass = shopifyApplied ? 'inventory-save-value-ok' : 'inventory-save-value-danger';
  const line1 = `システム更新: 完了 / ${check.productNo || ''} / ${check.statusLabel || check.status || '-'}`;
  const line2 = `SKU: 取得${check.knownRows || 0} / 照合${matched} / 更新${updated} / 総在庫${check.totalStock ?? '-'}`;
  const line3Prefix = `変更${changeCount}件 / Shopify反映: `;
  return `
    <div class="inventory-save-lines">
      <div class="inventory-save-line">${escapeHtml(line1)}</div>
      <div class="inventory-save-line">${escapeHtml(line2)}</div>
      <div class="inventory-save-line">${escapeHtml(line3Prefix)}<span class="${shopifyClass}">${escapeHtml(shopifyValue)}</span></div>
    </div>
  `;
}

function sourceUrlsAreSame(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  const leftId = left.match(/\/offer\/(\d+)/i)?.[1] || left.match(/[?&](?:id|itemId|offerId)=(\d+)/i)?.[1] || '';
  const rightId = right.match(/\/offer\/(\d+)/i)?.[1] || right.match(/[?&](?:id|itemId|offerId)=(\d+)/i)?.[1] || '';
  if (leftId && rightId && leftId === rightId) return true;
  return left.replace(/[#?].*$/, '') === right.replace(/[#?].*$/, '');
}

function currentInventorySourceUrls(data, tab) {
  return [data?.url, tab?.url]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function sourceUrlsMatchTarget(target, urls) {
  if (!target?.sourceUrl) return false;
  return (urls || []).some(url => sourceUrlsAreSame(target.sourceUrl, url));
}

function findInventoryTargetForUrls(urls) {
  return inventoryTargets.find(item => sourceUrlsMatchTarget(item, urls)) || null;
}

function describeInventoryTarget(target) {
  if (!target) return '未選択';
  return `${target.productNo || ''} ${target.title || ''}`.trim() || '未選択';
}

function requireMatchingInventoryTarget(urls, selectedTarget) {
  const target = selectedTarget || currentSelectedInventoryTarget();
  const pageTarget = findInventoryTargetForUrls(urls);
  if (!target) {
    throw new Error('保存を止めました。先に確認対象を選択し、対象商品の「1688ページを開く」から開いてください。');
  }
  if (!sourceUrlsMatchTarget(target, urls)) {
    const pageLabel = pageTarget ? describeInventoryTarget(pageTarget) : '商品マスターにないページ';
    throw new Error(`保存を止めました。現在ページは ${pageLabel}、選択中の確認対象は ${describeInventoryTarget(target)} です。対象商品の「1688ページを開く」から開き直してください。`);
  }
  return target;
}

function markInventoryTargetMismatch(target, urls) {
  const pageTarget = findInventoryTargetForUrls(urls);
  confirmedInventoryTargetNo = '';
  mismatchedInventoryTargetNo = target?.productNo || '';
  if (target) setCurrentInventoryTarget(target);
  renderInventoryTargets();
  const pageLabel = pageTarget ? describeInventoryTarget(pageTarget) : '商品マスターにないページ';
  setInventoryStatus(`保存を止めました。現在ページは ${pageLabel}、選択中の確認対象は ${describeInventoryTarget(target)} です。対象商品の「1688ページを開く」から開き直してください。`, 'danger');
}

function confirmInventoryTargetForTab(target, tab) {
  if (!target) {
    setInventoryStatus('保存を止めました。先に確認対象を選択してください。', 'danger');
    syncInventorySaveButtonState();
    return false;
  }
  const urls = currentInventorySourceUrls(null, tab);
  if (!sourceUrlsMatchTarget(target, urls)) {
    markInventoryTargetMismatch(target, urls);
    return false;
  }
  setCurrentInventoryTarget(target);
  confirmedInventoryTargetNo = target.productNo || '';
  mismatchedInventoryTargetNo = '';
  renderInventoryTargets();
  return true;
}

async function checkCurrentInventoryPage() {
  if (!IS_EXTENSION) {
    setInventoryStatus('プレビューでは在庫保存を実行しません。', 'warn');
    return;
  }
  if (!inventoryTargets.length) await loadInventoryTargets({ silent: true });
  let selectedTarget = currentSelectedInventoryTarget();
  if (!selectedTarget) {
    setInventoryStatus('保存を止めました。先に確認対象を選択してください。', 'danger');
    syncInventorySaveButtonState();
    return;
  }
  const tab = await findProductTab();
  if (!tab) {
    const activeSourceTab = await findActiveSourceTab();
    setCurrentInventoryTarget(selectedTarget);
    if (selectedTarget && isLikelyBrokenSourcePage(activeSourceTab)) {
      showLoading('リンク切れを保存中...', 70, '仕入れページが開けない状態を商品マスターへ保存しています');
      try {
        const check = await saveInventoryPayload(inventoryPayloadForBrokenPage(activeSourceTab));
        confirmedInventoryTargetNo = check.productNo || selectedTarget?.productNo || '';
        mismatchedInventoryTargetNo = '';
        setToolMode('inventory');
        setInventoryStatusHtml(inventorySavedMessageHtml(check), inventoryStatusToneFromCheck(check));
        await loadInventoryTargets({ silent: true });
      } catch(e) {
        setToolMode('inventory');
        setInventoryStatus(e.message || String(e), 'danger');
      }
      return;
    }
    setInventoryStatus('1688またはTaobaoの商品ページが見つかりません。対象ページを開いてください。', 'warn');
    return;
  }
  currentTab = tab;
  await updateInventoryCurrentUrl();
  const pageTarget = await detectCurrentPageInventoryTarget({ tab });
  if (pageTarget) {
    selectedTarget = pageTarget;
    renderInventoryTargets();
  }
  if (!confirmInventoryTargetForTab(selectedTarget, tab)) return;
  showLoading('在庫を取得中...', 25, '現在の仕入れページからSKU別在庫を読み取っています');
  try {
    const result = await scrapeProductTabData(tab, { requireSafeTitle: false });
    const payload = inventoryPayloadFromScrapedData(result.data, tab);
    if (!payload.skuStocks.length) {
      payload.pageStatus = 'error';
      payload.error = 'SKU別在庫を取得できませんでした。ページの再読み込み、ログイン状態、1688側の保護画面を確認してください。';
    }
    showLoading('管理画面へ保存中...', 70, '在庫確認結果を商品マスターへ保存しています');
    const check = await saveInventoryPayload(payload);
    confirmedInventoryTargetNo = check.productNo || payload.productNo || '';
    mismatchedInventoryTargetNo = '';
    setToolMode('inventory');
    setInventoryStatusHtml(inventorySavedMessageHtml(check), inventoryStatusToneFromCheck(check));
    await loadInventoryTargets({ silent: true });
  } catch(e) {
    setToolMode('inventory');
    setInventoryStatus(e.message || String(e), 'danger');
  }
}

// ===================== スクレイピング =====================
async function scrapeProductTabData(tab, options = {}) {
  if (!IS_EXTENSION) {
    loadPreviewProduct();
    return { data: scrapedData, sourceConfig: getProductSourceConfig(scrapedData?.url || '') };
  }
  if (!isSupportedProductTab(tab)) {
    throw new Error('1688またはTaobaoの商品ページだけ取得できます。Shopify画面や拡張画面は取得対象にしません。');
  }
  const messageTab = await resolveMessageableSourceTab(tab);
  const sourceConfig = getProductSourceConfig(messageTab?.url || tab?.url);
  let response;
  try {
    response = await sendTabMessageCompat(messageTab.id, { action: sourceConfig.action }, { frameId: 0 });
  } catch (connErr) {
    if (connErr.message?.includes('Receiving end does not exist') || connErr.message?.includes('Could not establish connection')) {
      showLoading(`${sourceConfig.label}用スクリプトを注入中...`, 5, 'ページにスクリプトを注入しています');
      await chrome.scripting.executeScript({
        target: { tabId: messageTab.id, frameIds: [0] },
        files: [sourceConfig.script],
      });
      await new Promise(r => setTimeout(r, 300));
      response = await sendTabMessageCompat(messageTab.id, { action: sourceConfig.action }, { frameId: 0 });
    } else {
      throw connErr;
    }
  }
  if (!response?.success) throw new Error(response?.error || 'スクレイピング失敗');
  const data = {
    ...response.data,
    site: getSourceSiteId(response.data?.site || messageTab?.url || tab?.url || ''),
    sourceLabel: sourceConfig.label,
    browserTitle: messageTab?.title || tab?.title || '',
  };
  data.title = safeScrapedProductTitle(data);
  if (options.requireSafeTitle !== false && !data.title) {
      throw new Error('商品タイトルを安全に取得できませんでした。店舗名を拾う危険があるため停止しました。ページを再読み込みして、もう一度取得してください。');
  }
  return { data, sourceConfig };
}

async function startScraping(tab) {
  const sourceConfig = getProductSourceConfig(tab?.url);
  showLoading(`${sourceConfig.label}から商品情報を取得中...`);
  try {
    const scrapeResult = await scrapeProductTabData(tab, { requireSafeTitle: true });
    scrapedData = scrapeResult.data;
    assertScrapedVariantQuality(scrapedData);

    // バリアント状態初期化（COLOR→SIZE順、SIZEは標準順にソート）
    variantState = sortVariantsByType(scrapedData.variants).map(v => {
      let vals = expandValues([...v.values]);
      const isSize = preTranslate(v.label) === 'SIZE';
      if (isSize) vals = sortSizeValues(vals.map(cleanVariantSizeValue).filter(Boolean));
      const variant = {
        label: v.label,
        jaLabel: v.label,
        values: vals,
        zeroStock: isSize ? (v.zeroStock || []).map(cleanVariantSizeValue).filter(Boolean) : (v.zeroStock || []),
        images: v.images || {},
      };
      variant.jaValues = vals.map(val => defaultVariantJaValue(variant, val));
      return {
        ...variant,
      };
    });

    // タイトル：ルールベースでシンプルに変換（AIなし）
    scrapedData._autoTitle = quickTranslateTitle(scrapedData.title);
    // 品番は登録時に採番（スクレイプ時は採番しない）
    scrapedData._productNo = null;

    showProductPanel();
  } catch(e) {
    showAlert('err', '' + e.message);
    showPanel('startPanel');
  }
}

// ===================== 商品パネル表示 =====================
function showProductPanel() {
  showPanel('productPanel');
  autoShopifySelectionPending = true;
  selectedCollections.clear();

  // ソースURL
  const bar = document.getElementById('sourceBar');
  bar.classList.add('visible');
  document.getElementById('sourceUrl').textContent = scrapedData.url;
  document.getElementById('sourceLink').href = scrapedData.url;

  // 管理番号は商品タイトルとは分けて扱い、Shopifyのhandleに使う
  const productNoEl = document.getElementById('fProductNo');
  if (productNoEl) {
    productNoEl.value = scrapedData._productNo || '';
    if (!productNoEl.value) {
      getSuggestedProductNo().then(no => {
        if (!productNoEl.value) productNoEl.value = no;
      });
    }
  }

  document.getElementById('fTitle').value = scrapedData._autoTitle || '';
  // 中国語原文を下に表示
  const origEl = document.getElementById('titleCnOrig');
  if (origEl && scrapedData.title) {
    origEl.textContent = '原文（中国語）：' + scrapedData.title;
    origEl.style.display = 'block';
  }
  const descEl = document.getElementById('fDesc');
  if (descEl) descEl.value = '';
  renderCombinedSourceTools();

  // 1点購入の仕入価格として、表示価格の中で一番高い金額を使う
  const purchasePrice = getPurchasePrice(scrapedData.prices);
  document.getElementById('fCostCny').value = purchasePrice || '';
  calculatePrice();

  // バリアント
  renderVariants();

  // Shopify項目を商品名から自動初期化
  applyAutoShopifyFields();
  renderTags();

  // コレクション・タグを再読み込み（configは確認済み）
  if (config.storeSlug) {
    loadCollections();
    loadShopifyTags();
  }

  // ステータスボタン更新
  updateStatusButton();
  renderRegisterLog();
  renderCombinedSourceTools();
}

// ===================== バリアント =====================
// 中国語→英語事前翻訳辞書
const CN_TO_EN = {
  // ===== 基本色 =====
  '黑色': 'ブラック',      '黑': 'ブラック',
  '白色': 'ホワイト',      '白': 'ホワイト',
  '红色': 'レッド',        '红': 'レッド',
  '蓝色': 'ブルー',        '蓝': 'ブルー',
  '绿色': 'グリーン',      '绿': 'グリーン',
  '黄色': 'イエロー',      '黄': 'イエロー',
  '柠檬黄色': 'イエロー',  '柠檬黄': 'イエロー',  '柠檬': 'イエロー',
  '檸檬黃色': 'イエロー',  '檸檬黄': 'イエロー',  '檸檬': 'イエロー',
  '粉色': 'ピンク',        '粉': 'ピンク',
  '紫色': 'パープル',      '紫': 'パープル',
  '橙色': 'オレンジ',      '橙': 'オレンジ',
  '灰色': 'グレー',        '灰': 'グレー',
  '棕色': 'ブラウン',      '棕': 'ブラウン',
  '青色': 'ティール',      '青': 'ティール',

  // ===== パープル系 =====
  '黑加仑紫': 'ブラックカラントパープル',
  '黑加仑':   'ブラックカラント',
  '加仑紫':   'カラントパープル',
  '雾霾紫':   'ミストパープル',
  '烟霞紫':   'ヘイズパープル',
  '丁香紫':   'ライラックパープル',
  '薰衣草紫': 'ラベンダーパープル',
  '薰衣草':   'ラベンダー',
  '藕紫色':   'ロータスパープル',
  '藕紫':     'ロータスパープル',
  '浅紫色':   'ライトパープル',
  '浅紫':     'ライトパープル',
  '深紫色':   'ディープパープル',
  '深紫':     'ディープパープル',
  '烟紫色':   'スモークパープル',
  '烟紫':     'スモークパープル',
  '灰紫色':   'グレーパープル',
  '灰紫':     'グレーパープル',
  '蓝紫色':   'ブルーパープル',
  '蓝紫':     'ブルーパープル',

  // ===== ブルー系 =====
  '墨蓝色':   'インクブルー',
  '墨蓝':     'インクブルー',
  '墨':       'インク',
  '藏青色':   'ネイビーブルー',
  '藏青':     'ネイビーブルー',
  '深藏青':   'ディープネイビー',
  '灰藏青':   'アッシュネイビー',
  '深蓝色':   'ネイビー',
  '深蓝':     'ネイビー',
  '宝蓝色':   'ロイヤルブルー',
  '宝蓝':     'ロイヤルブルー',
  '天蓝色':   'スカイブルー',
  '天蓝':     'スカイブルー',
  '冰蓝色':   'アイシーブルー',
  '冰蓝':     'アイシーブルー',
  '浅蓝色':   'ライトブルー',
  '浅蓝':     'ライトブルー',
  '牛仔蓝':   'デニムブルー',
  '冰川蓝':   'グレイシャーブルー',
  '浅灰蓝':   'ライトブルー',
  '复古蓝':   'ヴィンテージブルー',

  // ===== グリーン系 =====
  '浅绿色':   'ライトグリーン',
  '浅绿':     'ライトグリーン',
  '军绿色':   'オリーブグリーン',
  '军绿':     'オリーブグリーン',
  '深军绿':   'ダークオリーブ',
  '墨绿色':   'モスグリーン',
  '墨绿':     'モスグリーン',
  '橄榄绿':   'オリーブ',
  '深橄榄绿色': 'ダークオリーブグリーン',
  '深橄榄绿': 'ダークオリーブグリーン',
  '橄榄绿色': 'オリーブグリーン',
  '暗绿色':   'ダークグリーン',
  '暗绿':     'ダークグリーン',
  '草绿色':   'グラスグリーン',
  '草绿':     'グラスグリーン',
  '薄荷绿':   'ミントグリーン',
  '薄荷':     'ミント',
  '丛林绿':   'ジャングルグリーン',
  '森林绿':   'フォレストグリーン',
  '石墨绿':   'グラファイトグリーン',
  '卡其绿':   'カーキグリーン',
  '荧光绿':   'ネオングリーン',
  '嫩叶绿':   'フレッシュグリーン',
  '嫩叶':     'フレッシュリーフ',
  '苔藓绿':   'モスグリーン',
  '苔藓':     'モス',
  '梅子青':   'プラムグリーン',
  '梅子':     'プラム',
  '复古绿':   'ヴィンテージグリーン',
  '浅灰绿':   'ライトグリーン',
  '青柠绿色': 'ライムグリーン',
  '青柠绿':   'ライムグリーン',
  '青柠':     'ライム',
  '雪松绿色': 'シダーグリーン',
  '雪松绿':   'シダーグリーン',
  '雪松':     'シダー',

  // ===== グレー系 =====
  '浅灰色':   'ライトグレー',
  '浅灰':     'ライトグレー',
  '深灰色':   'ダークグレー',
  '深灰':     'ダークグレー',
  '铁灰色':   'アイアングレー',
  '铁灰':     'アイアングレー',
  '烟灰色':   'スモークグレー',
  '烟灰':     'スモークグレー',
  '木炭灰':   'チャコールグレー',
  '炭灰色':   'チャコールグレー',
  '炭灰':     'チャコールグレー',
  '火山灰':   'ボルカニックグレー',
  '雾霾灰':   'ミストグレー',
  '雾霾':     'ミスト',
  '冰川灰':   'グレイシャーグレー',
  '麻灰色':   'メランジグレー',
  '麻灰':     'メランジグレー',
  '石墨色':   'グラファイト',
  '幻影灰色': 'ファントムグレー',
  '幻影灰':   'ファントムグレー',

  // ===== ブラウン/ベージュ系 =====
  '驼色':     'キャメル',
  '驼':       'キャメル',
  '咖啡色':   'コーヒーブラウン',
  '咖啡':     'コーヒー',
  '深咖色':   'ダークブラウン',
  '深咖':     'ダークブラウン',
  '浅咖色':   'ライトブラウン',
  '浅咖':     'ライトブラウン',
  '咖色':     'ブラウン',
  '深棕色':   'ダークブラウン',
  '深棕':     'ダークブラウン',
  '浅棕色':   'ライトブラウン',
  '浅棕':     'ライトブラウン',
  '树皮棕':   'バークブラウン',
  '树皮':     'バークブラウン',
  '奶茶色':   'ラテベージュ',
  '奶茶':     'ラテベージュ',
  '米色':     'ベージュ',
  '杏色':     'アプリコット',
  '杏':       'アプリコット',
  '卡其色':   'カーキ',
  '卡其':     'カーキ',
  '深卡其':   'ダークカーキ',
  '浅卡其':   'ライトカーキ',
  '奶油黄色': 'クリーム',
  '奶油黄':   'クリーム',
  '奶油黃色': 'クリーム',
  '奶油黃':   'クリーム',
  '奶油白':   'クリームホワイト',
  '奶白色':   'クリームホワイト',
  '米白色':   'オフホワイト',
  '米白':     'オフホワイト',
  '象牙白':   'アイボリーホワイト',
  '象牙':     'アイボリー',
  '暖白色':   'ウォームホワイト',
  '暖白':     'ウォームホワイト',
  '香槟白色': 'シャンパンホワイト',
  '香槟白':   'シャンパンホワイト',
  '香槟':     'シャンパン',

  // ===== レッド系 =====
  '玫瑰红':   'ローズレッド',
  '玫红色':   'ローズレッド',
  '玫红':     'ローズレッド',
  '砖红色':   'ブリックレッド',
  '砖红':     'ブリックレッド',
  '酒红色':   'バーガンディ',
  '酒红':     'バーガンディ',
  '深红色':   'ディープレッド',
  '深红':     'ディープレッド',
  '粉红色':   'ピンクレッド',
  '粉红':     'ピンクレッド',
  '樱花粉色': 'ライトピンク',
  '樱花粉':   'ライトピンク',
  '樱粉':     'ライトピンク',
  '櫻花粉色': 'ライトピンク',
  '櫻花粉':   'ライトピンク',
  '櫻粉':     'ライトピンク',
  '桜花粉色': 'ライトピンク',
  '桜花粉':   'ライトピンク',
  '桜粉':     'ライトピンク',
  '荧光粉':   'ネオンピンク',
  '雾粉色':   'ミストピンク',
  '雾粉':     'ミストピンク',
  '冰梅粉色': 'ダスティピンク',
  '冰梅粉':   'ダスティピンク',

  // ===== オレンジ/イエロー系 =====
  '日光橙':   'サンシャインオレンジ',
  '落日橙色': 'サンセットオレンジ',
  '落日橙':   'サンセットオレンジ',
  '活力橙':   'ビビッドオレンジ',
  '脏橘色':   'ミュートオレンジ',
  '砖橙色':   'テラコッタオレンジ',
  '姜黄色':   'ターメリックイエロー',
  '姜黄':     'ターメリックイエロー',
  '荧光黄':   'ネオンイエロー',
  '柠檬黄色': 'イエロー',
  '柠檬黄':   'イエロー',
  '柠檬':     'イエロー',
  '檸檬黃色': 'イエロー',
  '檸檬黄':   'イエロー',
  '檸檬':     'イエロー',

  // ===== 特殊 =====
  '迷彩':     'カモフラ',
  '格子':     'チェック',
  '条纹':     'ストライプ',
  '复古棕':   'ヴィンテージブラウン',
  '星耀黑':   'スターブラック',
  '曜石黑':   'オブシディアンブラック',
  '烟墨色':   'スモークブラック',
  '烟墨':     'スモークブラック',
  '凝夜紫色': 'ナイトパープル',
  '凝夜紫':   'ナイトパープル',
  '秘境紫色': 'パープル',
  '秘境紫':   'パープル',
  '船长蓝色': 'ネイビー',
  '船长蓝':   'ネイビー',
  '船長藍色': 'ネイビー',
  '船長藍':   'ネイビー',
  '暗夜黑色': 'ブラック',
  '暗夜黑':   'ブラック',
  '露灰色':   'グレー',
  '露灰':     'グレー',
  '芥岚灰色': 'グレー',
  '芥岚灰':   'グレー',
  '芥嵐灰色': 'グレー',
  '芥嵐灰':   'グレー',
  '暴雨灰色': 'グレー',
  '暴雨灰':   'グレー',
  '牛仔':     'デニム',
  '无花果色': 'フィグ',
  '無花果色': 'フィグ',
  '无花果':   'フィグ',
  '無花果':   'フィグ',

  // ===== ラベル =====
  '颜色分类': 'COLOR',
  '颜色':     'COLOR',
  '尺码':     'SIZE',
  '尺寸':     'SIZE',
  '规格':     'SPEC',
  '款式':     'STYLE',
  '版型':     'FIT',
  '材质':     'MATERIAL',
};

// 英数字のみそのまま通す
function isAlphanumericSize(val) {
  return /^[A-Za-z0-9\-\/\+\.xX\s]+$/.test(val.trim());
}

function preTranslate(val) {
  // 【...】や（...）など余分な括弧テキストを除去
  let v = String(val || '').replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
  // SD99002青柠绿 / LKB6106雾粉 のような品番付きカラーは、翻訳用には品番を外す
  const withoutCode = v.replace(/^[A-Za-z]{1,12}\d{2,}[A-Za-z0-9_-]*(?=[\u4e00-\u9fff])/, '').trim();
  if (withoutCode) v = withoutCode;
  // 完全一致
  if (CN_TO_EN[v]) return CN_TO_EN[v];
  // 英数字のみならそのまま
  if (isAlphanumericSize(v)) return v;
  // 部分置換（長いキーを先に）
  let result = v;
  const sortedEntries = Object.entries(CN_TO_EN).sort((a, b) => b[0].length - a[0].length);
  for (const [cn, en] of sortedEntries) {
    if (result.includes(cn)) result = result.replace(new RegExp(cn, 'g'), en);
  }
  // 置換後に中国語文字が残っていたら混在を防ぐ → 元の中国語をそのまま返す
  if (/[\u4e00-\u9fff]/.test(result)) return v;
  return result;
}

function normalizeColorLookupText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/【[^】]*】/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/^[a-z]{1,12}\d{2,}[a-z0-9_-]*(?=[\u4e00-\u9fff])/i, '')
    .replace(/[色カラーcolor\s　_\-\/・,，、.。:：()（）[\]【】"'“”‘’]/g, '')
    .trim();
}

function colorMasterTerms(color) {
  return [
    color.code,
    `${color.code}${color.name}`,
    color.name,
    ...(color.aliases || []),
  ];
}

function colorMasterByValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const translated = preTranslate(raw);
  const candidates = [raw, translated, stripVariantParenthetical(raw), stripVariantParenthetical(translated)]
    .map(normalizeColorLookupText)
    .filter(Boolean);

  for (const candidate of candidates) {
    const exact = COLOR_MASTER.find(color => colorMasterTerms(color).some(term => normalizeColorLookupText(term) === candidate));
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const partial = COLOR_MASTER.find(color => colorMasterTerms(color).some(term => {
      const key = normalizeColorLookupText(term);
      return key.length >= 2 && (candidate.includes(key) || key.includes(candidate));
    }));
    if (partial) return partial;
  }

  return null;
}

function colorOptionLabel(color) {
  return color.name;
}

function shopifyColorName(value, fallback = '') {
  const matched = colorMasterByValue(value);
  if (matched) return matched.name;
  const stripped = String(value || '')
    .replace(/^\s*\d{1,3}\s+(?=\S)/, '')
    .replace(/^\s*\d{1,3}(?=[^\d\s])/u, '')
    .trim();
  return stripped || String(fallback || '').trim();
}

function selectedColorForVariantValue(jaValue, originalValue) {
  return colorMasterByValue(jaValue) || colorMasterByValue(originalValue);
}

function validateColorSelections() {
  const missing = [];
  variantState.forEach(variant => {
    if (getVariantType(variant) !== 'COLOR') return;
    (variant.jaValues || []).forEach((value, index) => {
      if (colorMasterByValue(value)) return;
      const original = originalVariantValue(variant, index) || variant.values?.[index] || `カラー${index + 1}`;
      missing.push(original);
    });
  });
  if (missing.length) {
    throw new Error(`カラーをマスターから選択してください: ${missing.join(' / ')}`);
  }
}
// カンマ区切りで結合された値を個別に分割するヘルパー
function expandValues(vals) {
  const result = [];
  (vals || []).forEach(v => {
    const s = (v || '').trim();
    if (!s) return;
    if (s.includes(',') || s.includes('，')) {
      s.split(/[,，]/).map(x => x.trim()).filter(Boolean).forEach(x => {
        if (!result.includes(x)) result.push(x);
      });
    } else {
      if (!result.includes(s)) result.push(s);
    }
  });
  return result;
}

// 標準サイズ順（小→大）
const SIZE_ORDER = ['XXXS','XXS','XS','S','M','L','XL','XXL','2XL','3XL','XXXL','4XL','5XL','6XL','7XL','8XL'];
const VARIANT_SIZE_BASE_SOURCE = '(XXXS|XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|6XL|7XL|8XL|均码|均碼|[\\d.]+码|[\\d.]+碼)';

function sortSizeValues(vals) {
  // 「S偏大」→「S」のようなサフィックスを除いてソートキーを正規化
  function sizeKey(v) {
    return String(cleanVariantSizeValue(v) || v || '').toUpperCase()
      .replace(/【[^】]*】/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/偏大|偏小|加大|大码|标准|常规|均码|free|ワンサイズ/gi, '')
      .trim();
  }
  return [...vals].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(sizeKey(a));
    const bi = SIZE_ORDER.indexOf(sizeKey(b));
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// バリアント配列をCOLOR→SIZEの順に並び替え
function sortVariantsByType(variants) {
  return [...variants].sort((a, b) => {
    const la = preTranslate(a.label);
    const lb = preTranslate(b.label);
    if (la === 'COLOR' && lb !== 'COLOR') return -1;
    if (la !== 'COLOR' && lb === 'COLOR') return 1;
    return 0;
  });
}

function getVariantType(variant) {
  return preTranslate(variant?.label || variant?.jaLabel || '');
}

function stripVariantParenthetical(value) {
  return String(value || '')
    .replace(/【[^】]*】/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[（(]\s*$/g, '')
    .replace(/^\s*[）)]/g, '')
    .trim();
}

function cleanVariantSizeValue(value) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[「"“『」"”』]/g, ' ')
    .replace(/^[\s()（）]+|[\s()（）]+$/g, '')
    .trim();
  if (!normalized) return '';
  const baseOnly = normalized.match(new RegExp(`^${VARIANT_SIZE_BASE_SOURCE}$`, 'i'));
  if (baseOnly) return formatVariantSizeBase(baseOnly[1]);
  const m = normalized.match(new RegExp(`^${VARIANT_SIZE_BASE_SOURCE}\\s*[「"'“”『(（]?\\s*(.{1,70}?)\\s*[」"'”』)）]*$`, 'i'));
  if (!m) return normalized
    .replace(/[（(]\s*$/g, '')
    .replace(/^\s*[）)]/g, '')
    .trim();
  const base = formatVariantSizeBase(m[1]);
  const detail = String(m[2] || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s()（）]+|[\s()（）]+$/g, '')
    .replace(/[()（）]/g, '')
    .trim();
  if (!detail || detail.toUpperCase() === base.toUpperCase()) return base;
  if (!/[\dA-Za-z]/.test(detail) || /[¥￥]|購入|购买|購買|在庫|库存|有货|缺货|售罄|人|件/.test(detail)) return base;
  return `${base}（${detail}）`;
}

function formatVariantSizeBase(value) {
  const text = String(value || '').trim();
  if (/^[A-Za-z0-9.]+(?:码|碼)?$/i.test(text)) return text.toUpperCase();
  return text;
}

function originalVariantValue(variant, index) {
  if (!variant) return '';
  const raw = String(variant?.values?.[index] ?? '').trim();
  const ja = String(variant?.jaValues?.[index] ?? '').trim();
  const value = raw || ja || '';
  return getVariantType(variant) === 'SIZE' ? (cleanVariantSizeValue(value) || value) : value;
}

function defaultVariantJaValue(variant, value) {
  if (getVariantType(variant) === 'COLOR') return colorMasterByValue(value)?.name || '';
  if (getVariantType(variant) === 'SIZE') {
    const cleaned = cleanVariantSizeValue(value) || value;
    const base = stripVariantParenthetical(cleaned) || cleaned;
    return preTranslate(base);
  }
  return preTranslate(value);
}

function variantValueMatches(a, b) {
  const aa = normalizeSkuStockPart(a);
  const bb = normalizeSkuStockPart(b);
  if (aa && bb && aa === bb) return true;
  const abase = normalizeSkuStockPart(stripVariantParenthetical(a));
  const bbase = normalizeSkuStockPart(stripVariantParenthetical(b));
  return Boolean(abase && bbase && abase === bbase);
}

function isVariantValueZeroStock(variant, index) {
  const original = originalVariantValue(variant, index);
  return (variant?.zeroStock || []).some(value => variantValueMatches(value, original));
}

function reorderVariantValue(variantIndex, fromIndex, toIndex) {
  const variant = variantState[variantIndex];
  if (!variant || !Array.isArray(variant.jaValues)) return;
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= variant.jaValues.length || toIndex >= variant.jaValues.length) return;
  ['values', 'jaValues'].forEach(key => {
    if (!Array.isArray(variant[key])) variant[key] = [];
    const [item] = variant[key].splice(fromIndex, 1);
    variant[key].splice(toIndex, 0, item);
  });
  renderVariants();
}

function readDraggedVariantValue(event) {
  try {
    return JSON.parse(event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain') || '{}');
  } catch(e) {
    return {};
  }
}

function closeColorMenus(except = null) {
  document.querySelectorAll('.variant-color-menu:not(.hidden)').forEach(menu => {
    if (menu !== except) menu.classList.add('hidden');
  });
}

function createColorSwatch(color) {
  const swatch = document.createElement('span');
  swatch.className = 'variant-color-swatch';
  swatch.style.background = color?.hex || '#fff';
  if (color?.name === 'ホワイト' || String(color?.hex || '').toLowerCase() === '#ffffff') {
    swatch.style.borderColor = '#cbd5e1';
  }
  return swatch;
}

function renderVariants() {
  const container = document.getElementById('variantsContainer');
  container.innerHTML = '';
  if (variantState.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:11px">バリアントなし</div>';
    return;
  }

  variantState.forEach((v, vi) => {
    const row = document.createElement('div');
    row.className = 'variant-row';
    const isSizeVariant = getVariantType(v) === 'SIZE';
    const isColorVariant = getVariantType(v) === 'COLOR';

    // ラベル行（グループ削除ボタン付き）
    const header = document.createElement('div');
    header.className = 'variant-header';
    const labelInp = document.createElement('input');
    labelInp.className = 'variant-label-input';
    if (variantState[vi].jaLabel === v.label) {
      variantState[vi].jaLabel = preTranslate(v.label);
    }
    labelInp.value = variantState[vi].jaLabel;
    labelInp.placeholder = '日本語ラベル';
    labelInp.addEventListener('input', e => { variantState[vi].jaLabel = e.target.value; });
    const cn = document.createElement('span');
    cn.className = 'variant-cn';
    cn.textContent = `（${v.label}）`;

    // グループ削除ボタン（バリアントタイプごと削除）
    const delGroup = document.createElement('button');
    delGroup.textContent = ' 削除';
    delGroup.style.cssText = 'margin-left:auto;padding:3px 8px;background:transparent;border:1px solid #ccc;border-radius:4px;color:#888;font-size:10px;cursor:pointer;font-family:inherit;flex-shrink:0;';
    delGroup.title = 'このバリアントグループを削除';
    delGroup.addEventListener('mouseenter', e => { e.target.style.borderColor='#e03a3a'; e.target.style.color='#e03a3a'; });
    delGroup.addEventListener('mouseleave', e => { e.target.style.borderColor='#ccc'; e.target.style.color='#888'; });
    delGroup.addEventListener('click', () => {
      variantState.splice(vi, 1);
      renderVariants();
    });

    header.appendChild(labelInp);
    header.appendChild(cn);
    header.appendChild(delGroup);
    row.appendChild(header);

    // バリアント値を縦並びで表示
    const valList = document.createElement('div');
    valList.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:8px;';

    v.jaValues.forEach((val, chi) => {
      if (variantState[vi].jaValues[chi] === v.values[chi]) {
        variantState[vi].jaValues[chi] = defaultVariantJaValue(v, v.values[chi]);
      }
      let jaVal = variantState[vi].jaValues[chi];
      const cnVal = originalVariantValue(v, chi) || '未取得';
      if (isColorVariant) {
        const selectedColor = selectedColorForVariantValue(jaVal, cnVal);
        if (selectedColor && jaVal !== selectedColor.name) {
          variantState[vi].jaValues[chi] = selectedColor.name;
          jaVal = selectedColor.name;
        }
      }
      const shouldShowOriginal = Boolean(cnVal);
      // 在庫ゼロ判定（中国語元名で照合）
      const isZeroStock = isVariantValueZeroStock(v, chi);

      const valRow = document.createElement('div');
      valRow.className = isColorVariant ? 'variant-value-row is-color-row' : 'variant-value-row';
      valRow.style.cssText = isZeroStock ? 'opacity:0.55;' : '';
      valRow.addEventListener('dragstart', event => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/json', JSON.stringify({ variantIndex: vi, valueIndex: chi }));
        event.dataTransfer.setData('text/plain', JSON.stringify({ variantIndex: vi, valueIndex: chi }));
        valRow.classList.add('is-dragging');
      });
      valRow.addEventListener('dragend', () => {
        valRow.classList.remove('is-dragging');
        document.querySelectorAll('.variant-value-row.drag-over').forEach(el => el.classList.remove('drag-over'));
      });
      valRow.addEventListener('dragover', event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        valRow.classList.add('drag-over');
      });
      valRow.addEventListener('dragleave', () => {
        valRow.classList.remove('drag-over');
      });
      valRow.addEventListener('drop', event => {
        event.preventDefault();
        valRow.classList.remove('drag-over');
        const dragged = readDraggedVariantValue(event);
        if (dragged.variantIndex === vi) reorderVariantValue(vi, Number(dragged.valueIndex), chi);
      });

      const dragHandle = document.createElement('span');
      dragHandle.className = 'variant-drag-handle';
      dragHandle.textContent = '≡';
      dragHandle.title = 'ドラッグして並び替え';
      dragHandle.draggable = true;
      valRow.appendChild(dragHandle);

      if (isColorVariant) {
        const selectedColor = colorMasterByValue(jaVal);
        const field = document.createElement('div');
        field.className = 'variant-color-field';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `variant-color-select variant-color-button${selectedColor ? '' : ' is-empty'}`;
        button.textContent = selectedColor?.name || 'カラーを選択';
        const menu = document.createElement('div');
        menu.className = 'variant-color-menu hidden';

        const emptyButton = document.createElement('button');
        emptyButton.type = 'button';
        emptyButton.className = 'variant-color-option';
        emptyButton.textContent = 'カラーを選択';
        emptyButton.addEventListener('click', event => {
          event.stopPropagation();
          variantState[vi].jaValues[chi] = '';
          closeColorMenus();
          renderVariants();
        });
        menu.appendChild(emptyButton);

        COLOR_MASTER.forEach(color => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = `variant-color-option${selectedColor?.name === color.name ? ' selected' : ''}`;
          option.title = `管理コード ${color.code}`;
          option.appendChild(createColorSwatch(color));
          option.appendChild(document.createTextNode(colorOptionLabel(color)));
          option.addEventListener('click', event => {
            event.stopPropagation();
            variantState[vi].jaValues[chi] = color.name;
            closeColorMenus();
            renderVariants();
          });
          menu.appendChild(option);
        });
        button.addEventListener('click', event => {
          event.stopPropagation();
          const willOpen = menu.classList.contains('hidden');
          closeColorMenus(menu);
          menu.classList.toggle('hidden', !willOpen);
        });
        field.appendChild(button);
        field.appendChild(menu);
        valRow.appendChild(field);

        const meta = document.createElement('span');
        meta.className = 'variant-color-meta';
        if (selectedColor) {
          meta.appendChild(createColorSwatch(selectedColor));
        } else {
          meta.textContent = '未選択';
        }
        valRow.appendChild(meta);
      } else {
        // テキスト入力欄
        const inp = document.createElement('input');
        inp.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-family:inherit;padding:5px 9px;outline:none;width:160px;flex-shrink:0;';
        inp.value = jaVal;
        inp.placeholder = isSizeVariant ? 'サイズ' : 'カタカナで入力';
        inp.addEventListener('input', e => { variantState[vi].jaValues[chi] = e.target.value; });
        inp.addEventListener('focus', e => { e.target.style.borderColor = '#aaa'; });
        inp.addEventListener('blur', e => { e.target.style.borderColor = 'var(--border)'; });
        valRow.appendChild(inp);
      }

      if (shouldShowOriginal) {
        const cnSpan = document.createElement('span');
        cnSpan.className = 'variant-value-original';
        cnSpan.title = cnVal;
        cnSpan.textContent = isColorVariant ? `発注用：${cnVal}` : `（${cnVal}）`;
        valRow.appendChild(cnSpan);
      }

      // 在庫ゼロバッジ
      if (isZeroStock) {
        const badge = document.createElement('span');
        badge.className = 'variant-stock-badge';
        badge.textContent = '在庫なし';
        badge.style.cssText = 'font-size:10px;color:#e03a3a;background:#fdeaea;border:1px solid #f5b8b8;border-radius:4px;padding:1px 5px;flex-shrink:0;';
        valRow.appendChild(badge);
      }

      // 値削除ボタン（×）
      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.style.cssText = 'width:22px;height:22px;border-radius:50%;background:transparent;border:1px solid #ccc;color:#999;font-size:13px;line-height:1;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit;';
      delBtn.title = 'この項目を削除';
      delBtn.addEventListener('mouseenter', e => { e.target.style.background='#fdeaea'; e.target.style.borderColor='#e03a3a'; e.target.style.color='#e03a3a'; });
      delBtn.addEventListener('mouseleave', e => { e.target.style.background='transparent'; e.target.style.borderColor='#ccc'; e.target.style.color='#999'; });
      delBtn.addEventListener('click', () => {
        variantState[vi].jaValues.splice(chi, 1);
        variantState[vi].values.splice(chi, 1);
        // 全値が消えたらグループごと削除
        if (variantState[vi].jaValues.length === 0) {
          variantState.splice(vi, 1);
        }
        renderVariants();
      });
      valRow.appendChild(delBtn);

      valList.appendChild(valRow);
    });

    row.appendChild(valList);
    container.appendChild(row);
  });
}

// ===================== ルールベースタイトル変換（商品の特徴をシンプルに） =====================
function quickTranslateTitle(cnTitle) {
  if (!cnTitle) return '';
  if (looksLikeCompanyOrStoreTitle(cnTitle)) return '';

  // アイテム名（優先度順・より具体的なものを先に）
  const itemMap = [
    [/套装|套裝|两件套|兩件套|三件套|上下套|上下セット|セットアップ/, 'セットアップ'],
    [/防晒衣|防曬衣|皮肤衣|皮膚衣|防紫外线衣|防紫外線衣/, 'UVカット ジャケット'],
    [/冲锋衣|沖鋒衣/, 'アウトドアジャケット'],
    [/牛仔裤/, 'デニムパンツ'],
    [/短裤|ショートパンツ/, 'ショートパンツ'],
    [/工装裤/, 'カーゴパンツ'],
    [/阔腿裤|宽腿裤/, 'ワイドパンツ'],
    [/直筒裤/, 'ストレートパンツ'],
    [/弯刀裤|伞兵裤/, 'バナナパンツ'],
    [/西裤/, 'スラックス'],
    [/裤|裤子/, 'パンツ'],
    [/连衣裙/, 'ワンピース'],
    [/半裙|裙/, 'スカート'],
    [/卫衣/, 'スウェット'],
    [/夹克/, 'ジャケット'],
    [/外套/, 'アウター'],
    [/大衣|风衣/, 'コート'],
    [/衬衫/, 'シャツ'],
    [/T恤|t恤/, 'Tシャツ'],
    [/上衣/, 'トップス'],
    [/羽绒服/, 'ダウンジャケット'],
  ];

  // スタイル特徴（最大2つ、商品の核心）
  const styleMap = [
    [/户外|戶外/, 'アウトドア'],
    [/防紫外线|防紫外線|防晒|防曬|UPF/i, 'UVカット'],
    [/轻薄|輕薄|薄款/, '軽量'],
    [/透气|透氣/, '通気'],
    [/连帽|連帽/, 'フード付き'],
    [/拉链|拉鏈/, 'ジップ'],
    [/美式/, 'アメカジ'],
    [/运动|運動|スポーツ/, 'スポーツ'],
    [/复古/, 'レトロ'],
    [/工装/, 'ワーク'],
    [/迷彩/, 'カモフラ'],
    [/点墨|手绘/, 'ペイント加工'],
    [/牛仔/, 'デニム'],
    [/宽松/, 'ルーズ'],
    [/高腰/, 'ハイウエスト'],
    [/直筒/, 'ストレート'],
    [/阔腿/, 'ワイドレッグ'],
    [/垂感/, 'ドレープ'],
    [/格子/, 'チェック'],
    [/条纹/, 'ストライプ'],
    [/拼接/, 'バイカラー'],
    [/刺绣/, '刺繍'],
  ];

  // 性別
  let gender = '';
  if (/女|女式|女款/.test(cnTitle)) gender = 'レディース';
  else if (/男|男式|男款/.test(cnTitle)) gender = 'メンズ';

  let item = '';
  for (const [pat, ja] of itemMap) {
    if (pat.test(cnTitle)) { item = ja; break; }
  }

  const styles = [];
  for (const [pat, ja] of styleMap) {
    if (pat.test(cnTitle) && styles.length < 2) styles.push(ja);
  }

  if (!item) return looksLikeCompanyOrStoreTitle(cnTitle) ? '' : cnTitle; // 変換できなければ中国語のまま

  // 組み合わせ：スタイル + アイテム（性別は不要な場合は省く）
  const parts = [...styles, item].filter(Boolean);
  return parts.join(' ');
}

function looksLikeCompanyOrStoreTitle(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /有限公司|有限责任公司|股份有限公司|服饰公司|贸易公司|供应链|供應鏈|工厂|工廠|厂家|廠家|店铺|店舖|旗舰店|官方店|专营店|专卖店|批发店|档口|商行|企业店|1688采购助手|找工厂|找厂|找店/i.test(text);
}

function looksUnsafeForProductTitle(value) {
  const text = normalizeScrapedTitleCandidate(value);
  if (!text) return true;
  if (looksLikeCompanyOrStoreTitle(text)) return true;
  if (/window\.contextPath|contextPath|AppFrame|Shopify|admin\.shopify|このページの準備/i.test(text)) return true;
  if (/https?:\/\//i.test(text) || /[¥￥]\s*\d/.test(text)) return true;
  if (/^(颜色|顏色|尺码|尺碼|尺寸|规格|規格|价格|库存|运费|销量|商品)$/i.test(text.replace(/\s+/g, ''))) return true;
  return false;
}

function isPlaceholderVariantText(value) {
  return /^(?:カラー\s*\d+|カラー未設定|色未設定|未設定|ONE)$/i.test(String(value || '').replace(/\s+/g, ''));
}

function assertScrapedVariantQuality(data = {}) {
  const variants = Array.isArray(data.variants) ? data.variants : [];
  if (!variants.length) {
    throw new Error('カラー・サイズを取得できませんでした。誤登録を防ぐためShopify登録を停止します。1688ページを再読み込みしてから取得してください。');
  }
  const colorVariant = variants.find(v => preTranslate(v.label || v.jaLabel || '') === 'COLOR');
  const colorValues = (colorVariant?.values || []).map(value => String(value || '').trim()).filter(Boolean);
  if (!colorValues.length || colorValues.some(isPlaceholderVariantText)) {
    throw new Error('カラーを正しく取得できませんでした。カラー1などの仮データでは登録できません。1688ページを再読み込みしてから取得してください。');
  }
}

function productTitleScore(value, index = 0) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (looksUnsafeForProductTitle(text)) return -9999;
  if (text.length < 8 || text.length > 160) return -9999;
  let score = 120 - Math.min(index, 120) * 0.3;
  if (/防晒衣|防曬衣|防紫外线|防紫外線|UPF|户外|戶外|连帽|連帽|拉链|拉鏈|夹克|外套|衬衫|襯衫|T恤|裤|褲|短裤|短褲|长裤|長褲|裙|运动|運動|休闲|休閒|宽松|寬鬆|透气|透氣|速干|速乾|防水|撥水|轻薄|輕薄/i.test(text)) score += 80;
  if (/男|女|情侣|情侶|男女|中性|儿童|童/.test(text)) score += 16;
  if (/[\u4e00-\u9fff]{8,}/.test(text)) score += 20;
  if (/有限公司|店铺|店舖|旗舰店|1688采购助手|找工厂|找店/i.test(text)) score -= 300;
  return score;
}

function normalizeScrapedTitleCandidate(value) {
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

function safeScrapedProductTitle(data = {}) {
  const candidates = [];
  const add = (value, source = '', base = 0) => {
    const text = normalizeScrapedTitleCandidate(value);
    if (!text) return;
    candidates.push({ text, source, base });
  };

  add(data.title, 'scraped-title', 50);
  add(data.browserTitle, 'browser-title', 90);
  add(data.documentTitle, 'document-title', 80);
  if (Array.isArray(data.titleCandidates)) {
    data.titleCandidates.forEach((candidate, index) => {
      const value = typeof candidate === 'string' ? candidate : candidate?.text;
      const weight = typeof candidate === 'string' ? 0 : Number(candidate?.weight || 0);
      add(value, `candidate-${index}`, Math.max(0, 58 - index * 0.4) + Math.min(weight, 80) * 0.2);
    });
  }
  [data.pageText, data.detailText, data.paramText].forEach((block, blockIndex) => {
    String(block || '').split('\n').slice(0, 260).forEach((line, lineIndex) => {
      add(line, `text-${blockIndex}`, Math.max(0, 24 - lineIndex * 0.05));
    });
  });

  const ranked = candidates
    .map((candidate, index) => ({
      ...candidate,
      score: productTitleScore(candidate.text, index) + Number(candidate.base || 0),
    }))
    .filter(candidate => candidate.score > -1000)
    .sort((a, b) => (b.score - a.score) || (b.text.length - a.text.length));

  return ranked[0]?.text || '';
}

// ===================== タグ =====================
function addTag(val) {
  if (!tags.includes(val)) {
    tags.push(val);
    renderTags();
    saveLastInputs();
  }
}
function renderTags() {
  const container = document.getElementById('tagsContainer');
  container.innerHTML = '';
  tags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${tag} <span class="tag-del"></span>`;
    chip.querySelector('.tag-del').addEventListener('click', e => {
      e.stopPropagation();
      tags.splice(i, 1);
      renderTags();
      saveLastInputs();
    });
    container.appendChild(chip);
  });
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'tag-input'; inp.id = 'tagInput';
  inp.placeholder = tags.length === 0 ? 'タグを入力してEnter...' : 'タグを追加...';
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const v = e.target.value.trim().replace(/,$/, ''); if (v) { addTag(v); e.target.value = ''; } }
  });
  container.appendChild(inp);
  syncTagChips();
}

// ===================== 価格計算 + 利益計算 =====================
function calculatePrice() {
  const costCny  = parseFloat(document.getElementById('fCostCny').value) || 0;
  const shipping = parseFloat(document.getElementById('fShipping')?.value) || DEFAULT_SHIPPING_CNY;
  const fee      = parseFloat(document.getElementById('fFee')?.value)      || DEFAULT_FEE_CNY;
  const rate     = getCnyRate();

  if (!costCny) {
    document.getElementById('fPriceJpy').value = '';
    document.getElementById('fComparePriceJpy').value = '';
    return;
  }

  // 総コスト（円）= 仕入原価 + 送料 + 手数料
  const totalCostJpy = Math.round((costCny + shipping + fee) * rate);

  // 利益率50%以上を保証する最低販売価格の計算
  // 利益率 = (販売価格 - 総コスト) / 販売価格 >= 0.5
  const minPrice = Math.ceil(totalCostJpy / 0.5);

  // 50%を下回らないように、100円単位で切り上げ
  // 例: 4,704円 → 4,800円
  const sale = roundToNicePrice(minPrice);

  document.getElementById('fPriceJpy').value = sale;
  document.getElementById('fComparePriceJpy').value = '';  // デフォルト空
  calculateProfit();
}

// 100円単位に切り上げ
function roundToNicePrice(price) {
  return Math.ceil(Number(price || 0) / 100) * 100;
}

function calculateProfit() {
  const costCny  = parseFloat(document.getElementById('fCostCny')?.value)   || 0;
  const shipping = parseFloat(document.getElementById('fShipping')?.value)   || 0;
  const fee      = DEFAULT_FEE_CNY;
  const saleJpy  = parseFloat(document.getElementById('fPriceJpy')?.value)   || 0;

  if (!saleJpy) return;

  const rate = getCnyRate();

  // 仕入原価（円）
  const costJpy      = Math.round(costCny * rate);
  // 送料と手数料を足した追加原価（円）
  const extrasCny    = shipping + fee;
  const extrasJpy    = Math.round(extrasCny * rate);
  // 総コスト（円）
  const totalCostJpy = costJpy + extrasJpy;
  // 純利益
  const profit       = saleJpy - totalCostJpy;
  // 利益率（利益 / 販売価格）
  const margin       = saleJpy > 0 ? (profit / saleJpy * 100) : 0;

  const fmt = n => n.toLocaleString('ja-JP') + '円';
  const color = profit >= 0 ? '#1e7a40' : '#e03a3a';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setColor = (id, c) => { const el = document.getElementById(id); if (el) el.style.color = c; };

  set('pCostJpy',    fmt(costJpy));
  set('pTotalCost',  fmt(totalCostJpy));
  set('pProfit',     (profit >= 0 ? '+' : '') + fmt(profit));
  set('pMargin',     margin.toFixed(1) + '%');

  setColor('pProfit', color);
  setColor('pMargin', color);

}

// ===================== ユーティリティ =====================
function buildProductHtml() {
  return '';
}

function cartesianProduct(arrays) {
  if (!arrays?.length) return [];
  const [first, ...rest] = arrays;
  if (!rest.length) return first.map(v => [v]);
  return first.flatMap(v => cartesianProduct(rest).map(c => [v, ...c]));
}

function getPurchasePrice(prices) {
  // 1688は数量が増えるほど単価が下がることが多いので、1点購入想定では最高単価を使う
  if (!prices?.length) return 0;
  const normalized = prices
    .map(p => ({ ...p, number: parseFloat(p.price) }))
    .filter(p => Number.isFinite(p.number) && p.number > 0 && p.number < 2000);
  const oneUnit = /1\s*(?:件|条|條|个|個|只|双|雙|枚|张|張|套|款|包|片|本|支|组|組)/;
  const onePieceOrder = normalized.filter(p => {
    const qty = String(p.qty || '');
    return oneUnit.test(qty) && /起批|起订|起訂|起購|起购/.test(qty);
  });
  const onePieceAny = normalized.filter(p => oneUnit.test(String(p.qty || '')));
  const candidates = onePieceOrder.length ? onePieceOrder : (onePieceAny.length ? onePieceAny : normalized);
  if (candidates.length === 0) return 0;
  const bestPriority = Math.min(...candidates.map(p => Number.isFinite(Number(p.priority)) ? Number(p.priority) : 50));
  const priorityCandidates = candidates.filter(p => (Number.isFinite(Number(p.priority)) ? Number(p.priority) : 50) === bestPriority);
  return Math.max(...priorityCandidates.map(p => p.number));
}

function guessProductType(title) {
  return analyzeProductIntent(title).productType;
}

function productIntentText(source) {
  if (typeof source === 'string') return source;
  const data = source || {};
  const variantText = (data.variants || [])
    .flatMap(v => [v.label, ...(v.values || [])])
    .join(' ');
  return [
    data.title,
    data.paramText,
    data.packingText,
    data.detailText,
    data.pageText,
    variantText,
  ].map(value => String(value || '')).filter(Boolean).join(' ');
}

function analyzeProductIntent(source) {
  const t = productIntentText(source).toLowerCase();
  const intent = {
    productType: 'その他',
    collectionKeywords: ['その他'],
    featureCollectionKeywords: [],
    seasonCollectionKeywords: [],
    tags: [],
    gender: 'unisex',
  };
  const has = pattern => pattern.test(t);
  const addTags = (...items) => {
    items.flat().filter(Boolean).forEach(tag => {
      if (!intent.tags.includes(tag)) intent.tags.push(tag);
    });
  };
  const addFeatures = (...items) => {
    items.flat().filter(Boolean).forEach(keyword => {
      if (!intent.featureCollectionKeywords.includes(keyword)) intent.featureCollectionKeywords.push(keyword);
    });
  };

  if (/男女|情侣|情侶|男女同款|男女兼用|unisex|ユニセックス/i.test(t)) {
    intent.gender = 'unisex';
    addTags('ユニセックス', '性別_ユニセックス');
  } else if (/女|女士|女款|レディース|women|woman/i.test(t)) {
    intent.gender = 'ladies';
    addTags('レディース', '性別_レディース');
  } else if (/男|男士|男款|メンズ|men|mens/i.test(t)) {
    intent.gender = 'mens';
    addTags('性別_メンズ');
  } else {
    addTags('ユニセックス', '性別_ユニセックス');
  }

  if (has(/套装|套裝|两件套|兩件套|三件套|上下套|上下装|上下裝|上下セット|セットアップ|set\s*up|setup/i)) {
    intent.productType = 'セットアップ';
    intent.collectionKeywords = ['セットアップ'];
    addTags('セットアップ', 'カテゴリ_セットアップ');
  } else if (has(/家居服|居家服|睡衣|睡裤|睡褲|睡袍|寝巻|パジャマ|ルームウェア/i)) {
    intent.productType = 'ルームウェア';
    intent.collectionKeywords = ['ルームウェア'];
    addTags('ルームウェア', 'カテゴリ_ルームウェア');
  } else if (has(/防晒|防曬|防紫外线|防紫外線|皮肤衣|皮膚衣|uv|upf|サンシェード|日焼け|日除け|冲锋衣|衝鋒衣|外套|大衣|コート|风衣|風衣|夹克|夾克|ジャケット|jacket|羽绒服|羽絨服|ダウン|开衫|開衫|パーカー/i)) {
    intent.productType = 'アウター';
    intent.collectionKeywords = ['アウター'];
    if (has(/防晒|防曬|防紫外线|防紫外線|皮肤衣|皮膚衣|uv|upf|サンシェード|日焼け|日除け/i)) {
      addFeatures('UVカット', 'UPF50');
      addTags('UPF50+', 'UVカット', '機能_UPF50+', '機能_UVカット');
    }
  } else if (has(/连衣裙|連衣裙|ワンピ|dress/i)) {
    intent.productType = 'ワンピース';
    intent.collectionKeywords = ['ワンピース'];
  } else if (has(/牛仔裤|牛仔褲|工装裤|工裝褲|阔腿裤|闊腿褲|直筒裤|短裤|短褲|裤|褲|パンツ|ズボン|半裙|短裙|长裙|長裙|裙|スカート|jeans/i)) {
    intent.productType = 'ボトムス';
    intent.collectionKeywords = ['ボトムス'];
  } else if (has(/卫衣|衛衣|衬衫|襯衫|t恤|Ｔ恤|吊带|吊帶|背心|上衣|シャツ|tシャツ|トップス|hoodie|sweater|shirt|tops/i)) {
    intent.productType = 'トップス';
    intent.collectionKeywords = ['トップス'];
  } else if (has(/鞋|シューズ|靴|sneaker/i)) {
    intent.productType = 'シューズ';
    intent.collectionKeywords = ['シューズ'];
  } else if (has(/包|バッグ|bag/i)) {
    intent.productType = 'バッグ';
    intent.collectionKeywords = ['バッグ', 'グッズ'];
  } else if (has(/帽|キャップ|ハット|hat|cap|アクセサリー/i)) {
    intent.productType = 'アクセサリー';
    intent.collectionKeywords = ['アクセサリー', 'グッズ'];
  }

  if (/春夏|夏季|夏|冷感|冰感|防晒|防曬|uv|upf/i.test(t)) {
    intent.seasonCollectionKeywords.push('2026春夏', '春夏新作');
    addTags('季節_2026春夏', '表示_新作');
  }
  if (/速干|速乾|快干|快乾/i.test(t)) {
    addFeatures('速乾');
    addTags('機能_速乾');
  }
  if (/透气|透氣|通気|通氣|吸湿|吸汗|排汗/i.test(t)) {
    addFeatures('通気');
    addTags('機能_通気', '機能_吸湿排汗');
  }
  if (/防水|撥水|泼水|潑水|拒水/i.test(t)) {
    addFeatures('撥水', '防水');
    addTags('機能_撥水', '機能_防水');
  }
  if (/防风|防風|挡风|擋風/i.test(t)) {
    addFeatures('防風');
    addTags('機能_防風');
  }
  if (/冷感|冰感|接触冷感/i.test(t)) {
    addFeatures('冷感');
    addTags('機能_冷感');
  }
  if (/轻量|軽量|轻薄|薄款|ライト/i.test(t)) {
    addFeatures('軽量');
    addTags('機能_軽量');
  }
  if (/弹力|彈力|ストレッチ|伸缩|伸縮/i.test(t)) {
    addFeatures('ストレッチ');
    addTags('機能_ストレッチ');
  }
  if (/宽松|寬鬆|オーバーサイズ|ゆったり|ルーズ/i.test(t)) {
    addTags('シルエット_オーバーサイズ');
  }
  if (/阔腿|闊腿|ワイド|wide/i.test(t)) {
    addTags('シルエット_ワイド');
  }

  intent.tags = [...new Set(intent.tags)];
  return intent;
}

function applyAutoShopifyFields() {
  const intent = analyzeProductIntent(scrapedData || '');
  setCustomSelectValue('fProductType', intent.productType, { silent: true });
  tags = recommendedShopifyTags(intent);
}

function normalizeTagKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[＿_\s・/／-]+/g, '');
}

function pickExistingShopifyTag(preferredTag) {
  const preferredKey = normalizeTagKey(preferredTag);
  const found = shopifyAvailableTags.find(tag => normalizeTagKey(tag) === preferredKey);
  return found || preferredTag;
}

function recommendedShopifyTags(intent) {
  const output = [];
  (intent?.tags || []).forEach(tag => {
    const selected = pickExistingShopifyTag(tag);
    if (selected && !output.some(item => normalizeTagKey(item) === normalizeTagKey(selected))) {
      output.push(selected);
    }
  });
  return output;
}

function showLoading(text, percent = null, sub = '') {
  document.getElementById('loadingText').textContent = text;
  const subEl = document.getElementById('loadingSubText');
  if (subEl) subEl.textContent = sub;
  const bar  = document.getElementById('progressBar');
  const pct  = document.getElementById('progressText');
  if (bar) bar.style.width = (percent !== null ? percent : 0) + '%';
  if (pct) pct.textContent = (percent !== null && percent > 0) ? percent + '%' : '';
  showPanel('loadingPanel');
}

function showPanel(id) {
  ['startPanel', 'inventoryPanel', 'loadingPanel', 'productPanel', 'confirmPanel', 'successPanel'].forEach(pid => {
    document.getElementById(pid).style.display = pid === id ? 'block' : 'none';
  });
}

function showAlert(type, msg) {
  const el = document.getElementById('alert');
  el.className = 'alert ' + type;
  el.textContent = msg;
}

function resetToStart() {
  scrapedData = null;
  selectedCollections.clear();
  variantState = []; tags = [];
  document.getElementById('sourceBar').classList.remove('visible');
  document.getElementById('alert').className = 'alert';
  showPanel('startPanel');
  if (!IS_EXTENSION) {
    document.getElementById('currentUrl').textContent = 'ローカルプレビュー';
    document.getElementById('btnScrape').disabled = false;
    return;
  }
  // 現在のタブを再取得（サイドパネル対応）
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
    let tab = tabs[0] || null;
    if (!isSupportedProductTab(tab)) {
      chrome.tabs.query({}, allTabs => {
        const productTab = bestProductTab(allTabs);
        if (productTab) { tab = productTab; }
        currentTab = tab;
        document.getElementById('currentUrl').textContent = tab?.url || '（1688またはTaobaoの商品ページを開いてください）';
        document.getElementById('btnScrape').disabled = !isSupportedProductTab(tab);
      });
    } else {
      currentTab = tab;
      document.getElementById('currentUrl').textContent = tab?.url || '';
      document.getElementById('btnScrape').disabled = false;
    }
  });
}

// ===================== 登録前確認 =====================
async function prepareRegistrationConfirm() {
  try {
    if (!scrapedData) throw new Error('商品情報がまだありません');
    await ensureProductNoForConfirm();
    const draft = getRegistrationDraft();
    validateDraft(draft);
    renderConfirmSummary(draft);
    renderCombinedSourceTools();
    showPanel('confirmPanel');
    await updateAdminReviewStatus(draft);
  } catch(e) {
    showAlert('err', '' + e.message);
    showPanel('productPanel');
  }
}

async function updateAdminReviewStatus(draft) {
  const statusEl = document.getElementById('duplicateStatus');
  const btn = document.getElementById('btnConfirmRegister');
  if (!statusEl) return;
  statusEl.className = 'check-status warn';
  statusEl.textContent = '商品URLと管理番号の重複を確認中...';
  if (btn) btn.disabled = true;

  const result = await checkRegistrationDuplicates(draft || getRegistrationDraft());
  if (result.duplicate) {
    statusEl.className = 'check-status err';
    statusEl.textContent = result.message;
    if (btn) btn.disabled = true;
    return;
  }
  if (result.unknown) {
    statusEl.className = 'check-status warn';
    statusEl.textContent = result.message || '重複確認ができませんでした。登録を止めています。';
    if (btn) btn.disabled = true;
    return;
  }

  statusEl.className = 'check-status ok';
  statusEl.textContent = '商品URL・管理番号ともに重複なし。登録できます。';
  if (btn) btn.disabled = false;
}

async function ensureProductNoForConfirm() {
  const el = document.getElementById('fProductNo');
  if (!el || el.value.trim()) return;
  el.value = await getSuggestedProductNo();
}

function getRegistrationDraft() {
  const managementNo = document.getElementById('fProductNo')?.value.trim() || '';
  const title = document.getElementById('fTitle')?.value.trim() || '';
  const priceJpy = parseFloat(document.getElementById('fPriceJpy')?.value || '0');
  const compareAtPriceJpy = parseFloat(document.getElementById('fComparePriceJpy')?.value || '0');
  const status = document.getElementById('fStatus')?.value || 'draft';
  const productType = document.getElementById('fProductType')?.value || '';
  const vendor = document.getElementById('fVendor')?.value || '';
  const inventory = document.getElementById('fInventory')?.value || '';
  const handle = buildShopifyHandle(managementNo);
  return {
    managementNo, title, priceJpy, compareAtPriceJpy, status, productType, vendor, inventory, handle,
    sourceUrl: scrapedData?.url || currentTab?.url || '',
    tags: [...tags],
    collections: [...selectedCollections],
    variantCount: getVariantCombinationCount(),
    shipping: document.getElementById('fShipping')?.value || String(DEFAULT_SHIPPING_CNY),
    cnyRate: document.getElementById('fCnyRate')?.value || String(DEFAULT_CNY_RATE),
    fee: String(DEFAULT_FEE_CNY),
  };
}

function validateDraft(draft) {
  if (!draft.title) throw new Error('商品タイトルが空です');
  if (!draft.managementNo) throw new Error('管理番号が空です');
  if (!draft.handle) throw new Error('管理番号からShopify URLを作れません。英数字を含めてください。');
  if (!draft.sourceUrl) throw new Error('仕入れ元URLを取得できません。1688/Taobaoの商品ページを開いてから登録してください。');
  validateColorSelections();
  if (draft.priceJpy && draft.compareAtPriceJpy && draft.compareAtPriceJpy <= draft.priceJpy) {
    throw new Error('割引前価格（定価）は販売価格より高い金額にしてください。');
  }
}

function duplicateProductLabel(product) {
  if (!product) return '既存商品';
  const no = product.productNo || product.id || '';
  const title = product.title || '';
  return `${no} ${title}`.trim() || '既存商品';
}

async function checkAdminDuplicate(draft) {
  if (!IS_EXTENSION) return { duplicate: false };
  const sourceUrl = String(draft?.sourceUrl || '').trim();
  const productNo = String(draft?.managementNo || '').trim();
  if (!sourceUrl) {
    return {
      unknown: true,
      message: '仕入れ元URLを取得できません。1688/Taobaoの商品ページを開いてから登録してください。',
    };
  }
  const params = new URLSearchParams();
  params.set('sourceUrl', sourceUrl);
  if (productNo) params.set('productNo', productNo);
  try {
    const res = await fetch(`${getAdminAppUrl()}/api/products/duplicate-check?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        unknown: true,
        message: data.error || '管理システムで重複確認ができませんでした。登録を止めています。',
      };
    }
    return data;
  } catch(e) {
    return {
      unknown: true,
      message: `管理システムに接続できないため、重複確認を完了できません。登録を止めています。保存先URLを確認してください: ${getAdminAppUrl()}`,
    };
  }
}

async function checkRegistrationDuplicates(draft) {
  const adminResult = await checkAdminDuplicate(draft);
  if (adminResult.sourceUrlDuplicate) {
    return {
      duplicate: true,
      message: `重複停止: 同じ仕入れ元URLが既に ${duplicateProductLabel(adminResult.sourceUrlDuplicate)} で登録されています。既存商品を確認してください。`,
    };
  }
  if (adminResult.productNoDuplicate) {
    return {
      duplicate: true,
      message: `重複停止: 管理番号 ${draft.managementNo} は既に ${duplicateProductLabel(adminResult.productNoDuplicate)} で登録されています。`,
    };
  }
  if (adminResult.unknown) {
    return {
      unknown: true,
      message: adminResult.message || '管理システムで重複確認ができませんでした。登録を止めています。',
    };
  }

  const shopifyResult = await checkHandleDuplicate(draft.handle);
  if (shopifyResult.duplicate) {
    return {
      duplicate: true,
      message: `重複停止: Shopifyに同じ管理番号の商品があります: ${shopifyResult.product?.title || draft.handle}`,
    };
  }
  if (shopifyResult.unknown) {
    return {
      unknown: true,
      message: 'Shopify側の重複確認ができませんでした。登録を止めています。Shopifyログイン状態を確認してください。',
    };
  }
  return { duplicate: false };
}

async function assertRegistrationNotDuplicate(draft) {
  const result = await checkRegistrationDuplicates(draft || getRegistrationDraft());
  if (result.duplicate || result.unknown) {
    throw new Error(result.message || '重複確認が完了していないため、登録を止めました。');
  }
}

function renderConfirmSummary(draft) {
  const el = document.getElementById('confirmSummary');
  if (!el) return;
  const collectionNames = draft.collections
    .map(id => shopifyCollections.find(col => Number(col.id) === Number(id))?.title)
    .filter(Boolean);
  const rows = [
    ['管理番号', draft.managementNo],
    ['Shopify URL予定', draft.handle],
    ['商品タイトル', draft.title],
    ['Shopify作成時', draft.status === 'active' ? '公開予定' : '下書き予定'],
    ['販売価格', draft.priceJpy ? formatYen(draft.priceJpy) : '未設定'],
    ['割引前価格', draft.compareAtPriceJpy ? formatYen(draft.compareAtPriceJpy) : 'なし'],
    ['商品タイプ', draft.productType || '未設定'],
    ['販売元', draft.vendor || '未設定'],
    ['タグ', draft.tags.length ? draft.tags.join(' / ') : 'なし'],
    ['コレクション', collectionNames.length ? collectionNames.join(' / ') : 'なし'],
    ['バリアント数', `${draft.variantCount}件`],
    ['在庫', draft.inventory ? `${draft.inventory} / 各バリアント` : '実在庫または未設定'],
    ['次の流れ', 'Shopifyへ直接登録 → Shopify編集画面で必要箇所だけ修正'],
    ['利益計算', `送料 ${getShippingLabel(draft.shipping)} / 為替 ${draft.cnyRate}円 / 手数料 ${DEFAULT_FEE_CNY}元`],
  ];
  el.innerHTML = '';
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'confirm-row';
    const labelEl = document.createElement('div');
    labelEl.className = 'confirm-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.className = 'confirm-value';
    valueEl.textContent = String(value);
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    el.appendChild(row);
  });
}

async function updateDuplicateStatus(handle) {
  const statusEl = document.getElementById('duplicateStatus');
  const btn = document.getElementById('btnConfirmRegister');
  if (!statusEl) return;
  statusEl.className = 'check-status warn';
  statusEl.textContent = '管理番号の重複を確認中...';
  if (btn) btn.disabled = true;

  const result = await checkHandleDuplicate(handle);
  if (result.duplicate) {
    statusEl.className = 'check-status err';
    statusEl.textContent = `同じ管理番号の商品が既にあります: ${result.product?.title || handle}`;
    if (btn) btn.disabled = true;
    return;
  }
  if (result.unknown) {
    statusEl.className = 'check-status warn';
    statusEl.textContent = '重複確認ができませんでした。Shopifyログイン状態を確認してください。';
    if (btn) btn.disabled = true;
    return;
  }
  statusEl.className = 'check-status ok';
  statusEl.textContent = IS_EXTENSION ? '重複なし。登録できます。' : 'プレビュー中。実登録は拡張機能から行います。';
  if (btn) btn.disabled = false;
}

async function checkHandleDuplicate(handle) {
  if (!handle || !IS_EXTENSION) return { duplicate: false };
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'shopifyRequest',
      storeSlug: config.storeSlug,
      endpoint: `/products.json?handle=${encodeURIComponent(handle)}&fields=id,title,handle&limit=1`,
      method: 'GET',
    });
    const products = res?.data?.products || [];
    const product = products.find(p => p.handle === handle) || products[0];
    return { duplicate: Boolean(product), product };
  } catch(e) {
    try {
      const fallback = await chrome.runtime.sendMessage({
        action: 'shopifyRequest',
        storeSlug: config.storeSlug,
        endpoint: '/products.json?fields=id,title,handle&limit=250',
        method: 'GET',
      });
      const product = (fallback?.data?.products || []).find(p => p.handle === handle);
      return { duplicate: Boolean(product), product };
    } catch(fallbackErr) {
      return { duplicate: false, unknown: true, error: fallbackErr.message || e.message };
    }
  }
}

function getVariantCombinationCount() {
  const nonEmpty = variantState.filter(v => v.jaValues?.length > 0);
  if (nonEmpty.length === 0) return 1;
  return nonEmpty.reduce((total, v) => total * v.jaValues.length, 1);
}

function normalizeSkuSize(value) {
  const raw = String(value || '').trim();
  return (raw || 'ONE').replace(/\s+/g, '').toUpperCase();
}

function buildVariantSku(productNo, colorIndex = 0, sizeValue = '') {
  const colorNo = String(Math.max(1, Number(colorIndex || 0) + 1)).padStart(2, '0');
  return [String(productNo || '').trim(), colorNo, normalizeSkuSize(sizeValue)].filter(Boolean).join('-');
}

function normalizeSkuStockPart(value) {
  return String(value || '')
    .trim()
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

function findSkuStockForOriginalCombo(originalCombo) {
  const parts = (originalCombo || []).map(normalizeSkuStockPart).filter(Boolean);
  if (!parts.length || !Array.isArray(scrapedData?.skuStocks)) return null;
  return scrapedData.skuStocks.find(row => {
    const rowParts = (row.parts || String(row.spec || '').split('>')).map(normalizeSkuStockPart).filter(Boolean);
    return parts.every(part => rowParts.some(rowPart => variantValueMatches(part, rowPart)));
  }) || null;
}

function isOriginalComboOutOfStock(originalCombo) {
  const stockRow = findSkuStockForOriginalCombo(originalCombo);
  if (stockRow && typeof stockRow.outOfStock === 'boolean') return stockRow.outOfStock;
  return false;
}

function sourceStockQuantityForOriginalCombo(originalCombo) {
  const stockRow = findSkuStockForOriginalCombo(originalCombo);
  if (stockRow) {
    const numericStock = Number(stockRow.stockNumber ?? stockRow.stock ?? '');
    if (Number.isFinite(numericStock) && String(stockRow.stockNumber ?? stockRow.stock ?? '').trim() !== '') {
      return numericStock > 0 ? SOURCE_AVAILABLE_STOCK_QTY : SOURCE_OUT_OF_STOCK_QTY;
    }
    if (typeof stockRow.outOfStock === 'boolean') {
      return stockRow.outOfStock ? SOURCE_OUT_OF_STOCK_QTY : SOURCE_AVAILABLE_STOCK_QTY;
    }
  }
  return isOriginalComboOutOfStock(originalCombo) ? SOURCE_OUT_OF_STOCK_QTY : SOURCE_AVAILABLE_STOCK_QTY;
}

function isVariantComboOutOfStock(comboEntries) {
  const originalCombo = comboEntries.map(entry => entry.originalValue);
  const stockRow = findSkuStockForOriginalCombo(originalCombo);
  if (stockRow && typeof stockRow.outOfStock === 'boolean') return stockRow.outOfStock;

  // SKU単位の在庫が取れないページだけ、値全体が在庫切れの場合のフォールバックを使う。
  return comboEntries.some(entry => (entry.variant?.zeroStock || []).includes(entry.originalValue));
}

function formatYen(value) {
  return Number(value || 0).toLocaleString('ja-JP') + '円';
}

function getShippingLabel(value) {
  const labels = { 38: '0.5kg（38元）', 46: '1kg（46元）', 54: '1.5kg（54元）' };
  return labels[Number(value)] || `${value}元`;
}

async function addRegisterLog(entry) {
}

async function renderRegisterLog() {
}

// ===================== Shopifyへ直接登録 =====================
async function registerProduct() {
  showLoading('Shopifyへ登録中...', 15, '取得データを保存して、そのままShopifyへ商品を作成します');
  try {
    if (!IS_EXTENSION) {
      showAlert('warn', 'ローカルプレビューではShopify登録を実行しません');
      showPanel('productPanel');
      return;
    }
    config = await getConfig();

    let productNo = document.getElementById('fProductNo')?.value.trim() || '';
    if (!productNo) productNo = await getSuggestedProductNo();
    const productNoEl = document.getElementById('fProductNo');
    if (productNoEl && productNo) productNoEl.value = productNo;
    const title = document.getElementById('fTitle')?.value.trim() || '';
    const priceJpy = parseFloat(document.getElementById('fPriceJpy')?.value || '0');
    const compareAtPriceJpy = parseFloat(document.getElementById('fComparePriceJpy')?.value || '0');

    if (!title) throw new Error('商品タイトルが空です');
    if (looksUnsafeForProductTitle(title)) {
      throw new Error('商品タイトルが会社名・店舗名になっている可能性があります。Shopifyへ登録せず停止しました。1688の商品名を取得し直すか、正しい商品名を入力してください。');
    }
    if (!productNo) throw new Error('管理番号が空です');
    validateColorSelections();
    await ensureSetupCollectionsForShopifyRegistration();
    if (priceJpy && compareAtPriceJpy && compareAtPriceJpy <= priceJpy) {
      throw new Error('割引前価格（定価）は販売価格より高い金額にしてください。');
    }
    await assertRegistrationNotDuplicate(getRegistrationDraft());

    await reserveProductNo(productNo);
    scrapedData._productNo = productNo;
    if (productNoEl) productNoEl.value = productNo;

    showLoading('管理Webへ保存中...', 45, 'タイトル・原文・価格・カラー・サイズ・画像URLを保存しています');
    const saved = await saveProductToAdminApp({ silent: true, registrationStage: 'ready_for_shopify_draft' });

    showLoading('Shopifyへ商品作成中...', 78, '商品・バリアント・SKUをShopifyへ登録しています');
    let createResult = await createShopifyProductOnAdminApp(saved);
    if (!shopifyCreateResultHasProductIdentity(createResult)) {
      showLoading('Shopify作成結果を確認中...', 90, '商品IDが返らない場合に備えて、Shopify側を自動で照合しています');
      const reconciled = await reconcileShopifyProductOnAdminApp(saved.productNo || productNo);
      if (shopifyCreateResultHasProductIdentity(reconciled)) {
        createResult = {
          ...createResult,
          ...reconciled,
          product: reconciled.product || createResult.product || saved,
          result: reconciled.result || createResult.result,
          snapshot: reconciled.snapshot || createResult.snapshot,
          reconciledAfterCreate: true,
        };
      }
    }
    const createdProduct = createResult.product || saved;
    const createdShopify = assertShopifyCreateSucceeded(createResult);
    const shopifyAdminUrl = createdProduct.shopifyAdminUrl || createResult.snapshot?.adminUrl || createdShopify.adminUrl || '';
    const shopifyUrl = createdProduct.shopifyUrl || createResult.snapshot?.onlineStoreUrl || '';

    await saveLastInputs();
    await addRegisterLog({
      title,
      productNo,
      handle: buildShopifyHandle(productNo),
      status: document.getElementById('fStatus')?.value || 'draft',
      priceJpy,
      shopifyAdminUrl,
      adminProductUrl: getAdminProductUrl(productNo),
      sourceUrl: scrapedData.url || '',
      sourceSite: currentSourceSiteId(),
      createdAt: new Date().toISOString(),
    });

    showLoading(createResult.alreadyExists ? '既存商品に紐付け完了！' : 'Shopify登録完了！', 100, '必要な修正はShopify編集画面で行えます');
    await new Promise(r => setTimeout(r, 350));
    const adminUrl = getAdminProductUrl(saved.productNo || productNo);
    const linkEl = document.getElementById('shopifyLink');
    const primaryShopifyUrl = shopifyAdminUrl || shopifyUrl;
    if (linkEl) {
      linkEl.href = primaryShopifyUrl || '#';
      linkEl.textContent = shopifyAdminUrl ? 'Shopify編集画面を開く →' : 'Shopify商品を開く →';
    }
    const adminLinkEl = document.getElementById('adminWebLink');
    if (adminLinkEl) adminLinkEl.href = adminUrl;
    renderCombinedSourceTools();
    await renderRegisterLog();
    showPanel('successPanel');
    if (document.getElementById('openAfterRegister')?.checked) {
      try {
        if (primaryShopifyUrl) chrome.tabs.create({ url: primaryShopifyUrl });
      } catch(e) {}
    }
  } catch(e) {
    showAlert('err', '' + e.message);
    showPanel('productPanel');
  }
}

async function createShopifyProductOnAdminApp(savedProduct) {
  const productId = savedProduct?.id || savedProduct?.productNo || document.getElementById('fProductNo')?.value.trim() || '';
  if (!productId) throw new Error('Shopify作成用の商品IDが見つかりません');
  const res = await fetch(`${getAdminAppUrl()}/api/products/${encodeURIComponent(productId)}/shopify-create`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Shopifyへ商品を作成できませんでした');
  return data;
}

function extractShopifyLegacyProductId(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const gid = text.match(/Product\/(\d+)/i);
  if (gid) return gid[1];
  const admin = text.match(/\/products\/(\d+)/i);
  if (admin) return admin[1];
  return /^\d+$/.test(text) ? text : '';
}

function assertShopifyCreateSucceeded(result) {
  const product = result?.product || {};
  const snapshot = result?.snapshot || {};
  const productId = extractShopifyLegacyProductId(
    product.shopifyProductId
    || snapshot.legacyId
    || snapshot.id
    || product.shopifyAdminUrl
    || snapshot.adminUrl
  );
  const adminUrl = product.shopifyAdminUrl || snapshot.adminUrl || '';
  if (!productId && !adminUrl) {
    throw new Error('Shopifyの商品IDが返っていないため、登録完了にできません。管理Webには保存済みですが、Shopify作成は未確認です。');
  }
  return { productId, adminUrl };
}

function shopifyCreateResultHasProductIdentity(result) {
  try {
    assertShopifyCreateSucceeded(result);
    return true;
  } catch(e) {
    return false;
  }
}

// ===================== コピー補助 =====================
function buildCombinedSourceText() {
  if (!scrapedData) return '';
  const originalText = buildOriginalTextDownload().trim();
  const summaryText = buildDescriptionSourceText().trim();
  return [
    originalText ? `【1688/Taobao 原文・取得データ】\n${originalText}` : '',
    summaryText ? `【商品登録用 まとめ】\n${summaryText}` : '',
  ].filter(Boolean).join('\n\n').trim() + '\n';
}

function renderCombinedSourceTools() {
  const text = scrapedData ? buildCombinedSourceText() : '';
  ['combinedSourceText', 'confirmCombinedSourceText', 'successCombinedSourceText'].forEach(id => {
    const area = document.getElementById(id);
    if (area) area.value = text;
  });
}

async function copyCombinedSourceText(areaId = 'combinedSourceText') {
  if (!scrapedData) return;
  renderCombinedSourceTools();
  const text = document.getElementById(areaId)?.value || buildCombinedSourceText();
  await copyText(text);
  showAlert('ok', '元データと商品情報をまとめてコピーしました');
  setTimeout(() => { document.getElementById('alert').className = 'alert'; }, 2500);
}

function downloadCombinedSourceText(areaId = 'combinedSourceText') {
  if (!scrapedData) return;
  renderCombinedSourceTools();
  const text = document.getElementById(areaId)?.value || buildCombinedSourceText();
  const base = document.getElementById('fProductNo')?.value.trim() || scrapedData.itemId || `${currentSourceSiteId()}_product`;
  const filename = safeFileName(`${base}_source_and_summary.txt`);
  downloadTextFile(filename, text, 'text/plain');
  showAlert('ok', filename + ' をダウンロードしました');
  setTimeout(() => { document.getElementById('alert').className = 'alert'; }, 3000);
}

function buildDescriptionSourceText() {
  if (!scrapedData) return '';
  const draft = getRegistrationDraft();
  const sourceLabel = currentSourceSiteLabel();
  const sourceTitle = String(scrapedData.title || '').trim();
  const collectionNames = selectedShopifyCollectionSummaries()
    .map(col => col.title || col.handle || col.id)
    .filter(Boolean);
  const productUrl = getStorefrontProductUrl(draft.managementNo);
  const sections = [];
  const add = (title, lines) => {
    const body = (Array.isArray(lines) ? lines : [lines])
      .map(line => String(line || '').trim())
      .filter(Boolean)
      .join('\n');
    if (body) sections.push(`【${title}】\n${body}`);
  };

  add('商品説明作成用まとめ', [
    'Shopifyの説明欄には自動入力しません。必要な情報を手入力するときの参考です。',
    `${sourceLabel}の商品タイトル、拡張機能で確定したカラー/サイズ/タグ/カテゴリをまとめた情報です。`,
  ]);
  add('基本情報', [
    `作成日時: ${new Date().toISOString()}`,
    draft.managementNo ? `管理番号: ${draft.managementNo}` : '',
    draft.handle ? `Shopify handle: ${draft.handle}` : '',
    productUrl ? `Shopify公開URL: ${productUrl}` : '',
    `${sourceLabel}商品ID: ${scrapedData.itemId || ''}`,
    `仕入れ元URL: ${scrapedData.url || ''}`,
  ]);
  add('タイトル', [
    sourceTitle ? `${sourceLabel}元タイトル: ${sourceTitle}` : '',
    draft.title ? `日本語タイトル: ${draft.title}` : '',
  ]);
  add('Shopify設定', [
    `公開ステータス: ${draft.status === 'active' ? '公開' : '下書き'}`,
    draft.productType ? `商品タイプ/カテゴリ: ${draft.productType}` : '',
    draft.vendor ? `販売元: ${draft.vendor}` : '',
    draft.tags?.length ? `タグ: ${draft.tags.join(', ')}` : '',
    collectionNames.length ? `コレクション: ${collectionNames.join(', ')}` : '',
    draft.inventory ? `在庫数: 各バリアント ${draft.inventory}` : '',
  ]);
  add('価格メモ', [
    draft.priceJpy ? `販売価格: ${formatYen(draft.priceJpy)}` : '',
    draft.compareAtPriceJpy ? `割引前価格: ${formatYen(draft.compareAtPriceJpy)}` : '',
    document.getElementById('fCostCny')?.value ? `仕入原価: ${document.getElementById('fCostCny')?.value}元` : '',
    `送料/手数料: ${getShippingLabel(draft.shipping)} / 手数料 ${DEFAULT_FEE_CNY}元 / 為替 ${draft.cnyRate || DEFAULT_CNY_RATE}円`,
  ]);
  add('カラー・サイズ・SKU', formatDescriptionVariantDetails(draft.managementNo));
  add('元バリエーション', formatCurrentVariantState());
  add('商品属性', scrapedData.paramText || '');
  add('サイズ表・表データ', formatOriginalTables(scrapedData.sizeTables || []));

  return sections.join('\n\n').trim() + '\n';
}

function formatDescriptionVariantDetails(productNo) {
  const colors = buildAdminColors(productNo || 'S0000');
  if (!colors.length) return '';
  return colors.map(color => {
    const colorLine = [
      color.colorJa,
      color.originalColor ? `元カラー: ${color.originalColor}` : '',
      color.imageUrl ? `画像: ${color.imageUrl}` : '画像なし',
    ].filter(Boolean).join(' / ');
    const sizeLines = (color.sizes || []).map(size => {
      const status = size.stockStatus === 'out' ? '在庫なし' : '通常';
      return `  - サイズ: ${size.sizeJa || '-'} / 元サイズ: ${size.originalSize || '-'} / SKU: ${size.sku || '-'} / ${status}`;
    });
    return `■ ${colorLine}\n${sizeLines.join('\n')}`;
  }).join('\n\n');
}

async function copyText(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const tmp = document.createElement('textarea');
  tmp.value = text;
  tmp.style.position = 'fixed';
  tmp.style.left = '-9999px';
  document.body.appendChild(tmp);
  tmp.focus();
  tmp.select();
  document.execCommand('copy');
  document.body.removeChild(tmp);
}

// ===================== データダウンロード =====================
async function bulkDownload() {
  if (!scrapedData) return;

  const btn = document.getElementById('btnBulkDownload');
  btn.disabled = true;
  btn.textContent = '生成中...';

  try {
    const text = buildOriginalTextDownload();
    const sourceId = currentSourceSiteId();
    const base = document.getElementById('fProductNo')?.value.trim() || scrapedData.itemId || `${sourceId}_product`;
    const filename = safeFileName(`${base}_${sourceId}_original_text.txt`);
    downloadTextFile(filename, text, 'text/plain');
    showAlert('ok', filename + ' をダウンロードしました');
    setTimeout(() => { document.getElementById('alert').className = 'alert'; }, 4000);
  } catch(e) {
    showAlert('err', '原文DL失敗: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '原文DL';
  }
}

function buildOriginalTextDownload() {
  const managementNo = document.getElementById('fProductNo')?.value.trim() || scrapedData._productNo || '';
  const titleJa = document.getElementById('fTitle')?.value.trim() || '';
  const sourceLabel = currentSourceSiteLabel();
  const lines = [];
  const add = (title, body) => {
    const text = Array.isArray(body) ? body.filter(Boolean).join('\n') : String(body || '').trim();
    if (!text) return;
    lines.push(`【${title}】\n${text}`);
  };

  add('基本情報', [
    `取得日時: ${new Date().toISOString()}`,
    managementNo ? `管理番号: ${managementNo}` : '',
    `商品ID: ${scrapedData.itemId || ''}`,
    `URL: ${scrapedData.url || ''}`,
  ]);
  add('商品タイトル', [
    scrapedData.title ? `${sourceLabel}原文: ${scrapedData.title}` : '',
    titleJa ? `日本語入力中: ${titleJa}` : '',
  ]);
  add('価格（元）', formatOriginalPrices(scrapedData.prices || []));
  add(`バリエーション（${sourceLabel}原文）`, formatOriginalVariants(scrapedData.variants || []));
  add(`カラー画像URL（${sourceLabel}原文）`, formatOriginalColorImages(scrapedData.variants || []));
  add('現在のバリアント入力値（確認用）', formatCurrentVariantState());
  add(`SKU別データ（${sourceLabel}原文）`, formatOriginalSkus(scrapedData.skus || []));
  add(`商品属性（${sourceLabel}原文）`, scrapedData.paramText || '');
  add(`サイズ表・表データ（${sourceLabel}原文）`, formatOriginalTables(scrapedData.sizeTables || []));

  return lines.join('\n\n').trim() + '\n';
}

function formatOriginalPrices(prices) {
  if (!prices.length) return '';
  return prices.map(p => {
    const qty = p.qty ? `${p.qty}: ` : '';
    return `- ${qty}${p.price || ''} 元`;
  }).join('\n');
}

function formatOriginalVariants(variants) {
  if (!variants.length) return '';
  return variants.map(v => {
    const values = (v.values || []).map(value => {
      const stockNote = (v.zeroStock || []).includes(value) ? '（在庫なし）' : '';
      const imageUrl = v.images?.[value] ? ` / 画像: ${v.images[value]}` : '';
      return `  - ${value}${stockNote}${imageUrl}`;
    }).join('\n');
    return `■ ${v.label || ''}\n${values}`;
  }).join('\n\n');
}

function formatOriginalColorImages(variants) {
  const colorVariant = (variants || []).find(v => preTranslate(v.label || '') === 'COLOR');
  if (!colorVariant) return '';
  const rows = (colorVariant.values || []).map(value => {
    const imageUrl = colorVariant.images?.[value] || '';
    return `${value} | ${imageUrl || '画像なし'}`;
  });
  if (!rows.length) return '';
  return ['元カラー | カラー画像URL', ...rows].join('\n');
}

function formatCurrentVariantState() {
  if (!variantState.length) return '';
  return variantState.map(v => {
    const isColor = getVariantType(v) === 'COLOR';
    const rows = (v.jaValues || []).map((_, idx) => {
      const value = originalVariantValue(v, idx);
      const rawJa = v.jaValues?.[idx] || '';
      const ja = isColor ? shopifyColorName(rawJa, value) : rawJa;
      const stockNote = isVariantValueZeroStock(v, idx) ? ' | 在庫なし' : '';
      const imageUrl = v.images?.[value] ? ` | 画像: ${v.images[value]}` : '';
      return `  - 元: ${value} | 日本語: ${ja}${stockNote}${imageUrl}`;
    }).join('\n');
    return `■ ${v.label || ''} / ${v.jaLabel || v.label || ''}\n${rows}`;
  }).join('\n\n');
}

function formatOriginalSkus(skus) {
  if (!skus.length) return '';
  return ['規格 | 価格 | 在庫', ...skus.map(row => {
    const stock = row.outOfStock ? `${row.stock || 0}（在庫なし）` : (row.stock || '');
    return `${row.spec || ''} | ${row.price || ''} | ${stock}`;
  })].join('\n');
}

function formatOriginalTables(tables) {
  if (!tables.length) return '';
  const normalizedParam = normalizeDownloadBlock(scrapedData?.paramText || '');
  const dimensionKeyword = /(胸围|衣长|肩宽|腰围|臀围|裤长|袖长|下摆|长\(cm\)|宽\(cm\)|高\(cm\)|重量|体积|CM|cm)/;
  const seen = new Set();
  const filtered = tables
    .map(text => String(text || '').trim())
    .filter(Boolean)
    .filter(text => {
      const key = normalizeDownloadBlock(text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      if (normalizedParam && (key === normalizedParam || normalizedParam.includes(key) || key.includes(normalizedParam))) return false;
      return dimensionKeyword.test(text);
    });
  const output = filtered.length ? filtered : tables.map(text => String(text || '').trim()).filter(Boolean).slice(0, 3);
  return output.map((text, idx) => `--- 表${idx + 1} ---\n${text}`).join('\n\n');
}

function normalizeDownloadBlock(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/[|｜,，、:：]/g, '')
    .trim();
}

function buildProductData() {
  const managementNo = document.getElementById('fProductNo')?.value.trim() || scrapedData._productNo || '';
  const titleJa   = document.getElementById('fTitle')?.value.trim() || '';
  const costCny   = document.getElementById('fCostCny')?.value || '';
  const priceJpy  = document.getElementById('fPriceJpy')?.value || '';
  const compareAt = document.getElementById('fComparePriceJpy')?.value || '';
  const shipping  = document.getElementById('fShipping')?.value || '';
  const fee       = String(DEFAULT_FEE_CNY);
  const cnyRate   = document.getElementById('fCnyRate')?.value || '';
  const inventory = document.getElementById('fInventory')?.value || '';

  return {
    exportedAt: new Date().toISOString(),
    managementNo,
    source: {
      site: currentSourceSiteId(),
      itemId: scrapedData.itemId || '',
      url: scrapedData.url || '',
    },
    product: {
      originalTitle: scrapedData.title || '',
      title: titleJa,
      description: '',
      productType: document.getElementById('fProductType')?.value || '',
      vendor: document.getElementById('fVendor')?.value || '',
      status: document.getElementById('fStatus')?.value || '',
      tags: [...tags],
      inventoryPerVariant: inventory,
    },
    shopify: {
      handle: buildShopifyHandle(managementNo),
      selectedCollectionIds: [...selectedCollections],
    },
    pricing: {
      supplierPrices: scrapedData.prices || [],
      costCny,
      salePriceJpy: priceJpy,
      compareAtPriceJpy: compareAt,
      shippingCny: shipping,
      feeCny: fee,
      cnyRate,
    },
    variants: variantState.map(v => {
      const isColor = getVariantType(v) === 'COLOR';
      return {
        originalLabel: v.label,
        label: v.jaLabel || v.label,
        values: (v.jaValues || []).map((value, idx) => {
          const originalValue = originalVariantValue(v, idx);
          const cleanValue = isColor ? shopifyColorName(value, originalValue) : value;
          const color = isColor ? colorMasterByValue(cleanValue || value || originalValue) : null;
          return {
            value: cleanValue,
            originalValue,
            outOfStock: isVariantValueZeroStock(v, idx),
            colorCode: color?.code || '',
            colorHex: color?.hex || '',
          };
        }),
      };
    }),
    attributes: {
      paramText: scrapedData.paramText || '',
      rawAttributes: scrapedData.attributes || {},
      packingText: scrapedData.packingText || '',
      detailText: scrapedData.detailText || '',
      sizeTables: scrapedData.sizeTables || [],
      skuStocks: scrapedData.skuStocks || [],
      pageText: scrapedData.pageText || '',
    },
  };
}

function getAdminAppUrl() {
  return normalizeAdminAppUrl(config.adminAppUrl);
}

function getAdminProductUrl(productNo) {
  const base = getAdminAppUrl();
  return productNo ? `${base}/?productNo=${encodeURIComponent(productNo)}` : base;
}

function getStorefrontProductUrl(productNo) {
  const handle = buildShopifyHandle(productNo);
  const base = String(config.storefrontProductBase || DEFAULT_STOREFRONT_PRODUCT_BASE).replace(/\/+$/, '');
  return handle ? `${base}/${handle}` : '';
}

function selectedShopifyCollectionSummaries() {
  return normalizeShopifyCollections([...selectedCollections]
    .map(id => shopifyCollections.find(col => Number(col.id) === Number(id)) || { id })
    .filter(col => col?.id)
    .map(col => ({
      id: String(col.id),
      title: col.title || '',
      handle: col.handle || '',
    })));
}

function normalizeShopifyTagList(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map(tag => String(tag || '').trim()).filter(Boolean))];
}

function todayYmd() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function findVariantByType(type) {
  return variantState.find(v => preTranslate(v.label || v.jaLabel || '') === type) || null;
}

function buildAdminColors(productNo) {
  const colorVariant = findVariantByType('COLOR') || variantState.find(v => v.jaValues?.length);
  const sizeVariant = findVariantByType('SIZE');
  const colorOriginals = colorVariant?.values?.length ? colorVariant.values : [''];
  const colorValues = colorVariant?.jaValues?.length ? colorVariant.jaValues : colorOriginals;
  const sizeOriginals = sizeVariant?.values?.length ? sizeVariant.values : [''];
  const sizeValues = sizeVariant?.jaValues?.length ? sizeVariant.jaValues : sizeOriginals;

  return colorValues.map((rawColorJa, colorIndex) => {
    const originalColor = originalVariantValue(colorVariant, colorIndex) || colorOriginals[colorIndex] || rawColorJa || '';
    const colorJa = colorVariant ? shopifyColorName(rawColorJa, originalColor) : rawColorJa;
    const colorMeta = colorMasterByValue(colorJa) || colorMasterByValue(rawColorJa) || colorMasterByValue(originalColor);
    const imageUrl = findColorImageUrl(colorVariant, colorIndex, originalColor, colorJa || rawColorJa);
    return {
      originalColor,
      colorJa: colorJa || originalColor,
      colorCode: colorMeta?.code || '',
      colorHex: colorMeta?.hex || '',
      imageUrl,
      sizes: sizeValues.map((sizeJa, sizeIndex) => {
        const originalSize = originalVariantValue(sizeVariant, sizeIndex) || sizeOriginals[sizeIndex] || sizeJa || '';
        const combo = [];
        if (colorVariant) combo.push(colorJa || originalColor);
        if (sizeVariant) combo.push(sizeJa || originalSize);
        const originalCombo = [];
        if (colorVariant) originalCombo.push(originalColor);
        if (sizeVariant) originalCombo.push(originalSize);
        const stockQuantity = sourceStockQuantityForOriginalCombo(originalCombo);
        return {
          originalSize,
          sizeJa: sizeJa || originalSize,
          sku: buildVariantSku(productNo, colorIndex, sizeJa || originalSize),
          stockStatus: stockQuantity <= 0 ? 'out' : 'available',
          stockQuantity,
        };
      }),
    };
  });
}

function findColorImageUrl(colorVariant, colorIndex, originalColor, colorJa) {
  const images = colorVariant?.images || {};
  const directKeys = [
    originalColor,
    colorJa,
    colorVariant?.values?.[colorIndex],
    colorVariant?.jaValues?.[colorIndex],
  ].map(value => String(value || '').trim()).filter(Boolean);

  for (const key of directKeys) {
    if (images[key]) return images[key];
  }

  const imageKeys = Object.keys(images);
  const matchedKey = imageKeys.find(key => directKeys.some(value => variantValueMatches(key, value)));
  if (matchedKey) return images[matchedKey];

  if (imageKeys.length === (colorVariant?.values || []).length && imageKeys[colorIndex]) {
    return images[imageKeys[colorIndex]] || '';
  }

  return '';
}

function buildAdminProductPayload() {
  const productData = buildProductData();
  const productNo = productData.managementNo;
  const shippingCny = Number(productData.pricing.shippingCny || DEFAULT_SHIPPING_CNY);
  const productTags = normalizeShopifyTagList(productData.product.tags);
  const sourceSnapshot = {
    source: productData.source,
    pricing: productData.pricing,
    variants: productData.variants,
    attributes: productData.attributes,
    capturedAt: productData.exportedAt,
  };
  return {
    productNo,
    localTitle: productData.product.title,
    shopifyTitle: productData.product.title,
    sourceTitle: productData.product.originalTitle,
    originalTitle: productData.product.originalTitle,
    sourceSite: productData.source.site,
    sourceUrl: productData.source.url,
    shopifyUrl: getStorefrontProductUrl(productNo),
    shopifyAdminUrl: '',
    shopifyProductId: '',
    shopifyProductType: productData.product.productType || '',
    shopifyVendor: productData.product.vendor || '',
    shopifyTags: productTags,
    shopifyCollections: selectedShopifyCollectionSummaries(),
    shopifyPublishStatus: productData.product.status === 'active' ? 'active' : 'draft',
    registrationStage: 'ready_for_shopify_draft',
    registrationSource: 'chrome_extension_scrape',
    capturedAt: productData.exportedAt,
    status: 'active',
    registeredAt: todayYmd(),
    linkStatus: 'ok',
    linkCheckedAt: '',
    costCny: Number(productData.pricing.costCny || 0),
    salePriceJpy: Number(productData.pricing.salePriceJpy || 0),
    shippingCny,
    shippingWeightKg: shippingWeightFromCny(shippingCny),
    cnyRate: Number(productData.pricing.cnyRate || DEFAULT_CNY_RATE),
    feeCny: DEFAULT_FEE_CNY,
    compareAtPriceJpy: Number(productData.pricing.compareAtPriceJpy || 0),
    inventoryPerVariant: Number(productData.product.inventoryPerVariant || 0),
    shopifyDescriptionHtml: '',
    descriptionSourceText: buildDescriptionSourceText(),
    sourceSnapshot,
    memo: '',
    colors: buildAdminColors(productNo),
  };
}

async function saveProductToAdminApp(options = {}) {
  if (!scrapedData) throw new Error('商品情報がまだありません');
  config = await getConfig();
  await ensureProductNoForConfirm();
  const productNo = document.getElementById('fProductNo')?.value.trim() || '';
  if (!productNo) throw new Error('管理番号が空です');
  await reserveProductNo(productNo);

  const product = {
    ...buildAdminProductPayload(),
    registrationStage: options.registrationStage || 'needs_review',
  };
  const adminUrl = getAdminAppUrl();
  let res;
  try {
    res = await fetch(`${adminUrl}/api/products`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product }),
    });
  } catch(e) {
    throw new Error(`管理システムに接続できませんでした。保存先URLを確認してください: ${adminUrl}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '管理Webへ保存できませんでした');

  if (!options.silent) {
    showAlert('ok', `管理Webへ保存しました: ${data.product?.productNo || product.productNo}`);
    setTimeout(() => { document.getElementById('alert').className = 'alert'; }, 3000);
  }
  return data.product || product;
}

function buildShopifyActualAdminUpdates(productNo, shopifyAdminUrl, shopifyProductId = '', shopifyProduct = null) {
  const productData = buildProductData();
  const actual = shopifyProduct || {};
  return {
    shopifyUrl: getStorefrontProductUrl(productNo),
    shopifyAdminUrl,
    shopifyProductId: String(shopifyProductId || actual.id || ''),
    shopifyTitle: actual.title || productData.product.title || '',
    shopifyProductType: actual.product_type || productData.product.productType || '',
    shopifyVendor: actual.vendor || productData.product.vendor || '',
    shopifyTags: normalizeShopifyTagList(actual.tags || productData.product.tags),
    shopifyCollections: selectedShopifyCollectionSummaries(),
  };
}

async function saveShopifyAdminUrlToAdminApp(productNo, shopifyAdminUrl, shopifyProductId = '', shopifyProduct = null) {
  if (!productNo || !shopifyAdminUrl) return;
  try {
    const id = buildShopifyHandle(productNo);
    const res = await fetch(`${getAdminAppUrl()}/api/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: buildShopifyActualAdminUpdates(productNo, shopifyAdminUrl, shopifyProductId, shopifyProduct) }),
    });
    if (!res.ok) {
      await res.text().catch(() => '');
    }
  } catch(e) {
    // 管理Webへの補助リンク保存に失敗しても、Shopify登録は完了扱いにする。
  }
}

async function reconcileShopifyProductOnAdminApp(productNo) {
  const id = buildShopifyHandle(productNo);
  if (!id) return null;
  try {
    const res = await fetch(`${getAdminAppUrl()}/api/products/${encodeURIComponent(id)}/shopify-reconcile`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch(e) {
    return null;
  }
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFileName(name) {
  return String(name || 'download')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function loadPreviewProduct() {
  document.getElementById('currentUrl').textContent = 'ローカルプレビュー（Chrome拡張の再読み込みなし）';
  setHeaderStatus('プレビュー');
  scrapedData = {
    title: '美式复古宽松直筒牛仔裤男女同款潮牌休闲长裤',
    prices: [{ price: '68.00', qty: '1+' }],
    variants: [
      { label: '颜色', values: ['黑色', '浅蓝色', '复古蓝'], zeroStock: ['复古蓝'] },
      { label: '尺码', values: ['S', 'M', 'L', 'XL'], zeroStock: [] },
    ],
    attributes: {},
    paramText: '材质: 棉\n风格: 美式复古\n版型: 宽松\n适用季节: 春秋',
    sizeTables: ['尺码 | 腰围 | 臀围 | 裤长\nS | 66 | 94 | 98\nM | 70 | 98 | 100\nL | 74 | 102 | 102\nXL | 78 | 106 | 104'],
    skus: [
      { spec: '黑色>S', price: '68.00', stock: '120' },
      { spec: '黑色>M', price: '68.00', stock: '88' },
      { spec: '浅蓝色>S', price: '68.00', stock: '56' },
    ],
    skuStocks: [
      { spec: '黑色>S', parts: ['黑色', 'S'], price: '68.00', stock: '120', stockNumber: 120, outOfStock: false },
      { spec: '黑色>M', parts: ['黑色', 'M'], price: '68.00', stock: '88', stockNumber: 88, outOfStock: false },
      { spec: '浅蓝色>S', parts: ['浅蓝色', 'S'], price: '68.00', stock: '56', stockNumber: 56, outOfStock: false },
    ],
    detailText: '面料柔软舒适，适合春秋季节日常穿着。版型宽松，男女同款。',
    pageText: '美式复古宽松直筒牛仔裤男女同款潮牌休闲长裤\n材质: 棉\n尺码表\nS M L XL',
    url: 'https://detail.1688.com/offer/preview.html',
    itemId: 'preview',
    _autoTitle: 'レトロ デニムパンツ',
    _productNo: '',
  };
  variantState = sortVariantsByType(scrapedData.variants).map(v => {
    let vals = expandValues([...v.values]);
    const jaLabel = preTranslate(v.label);
    const isSize = jaLabel === 'SIZE';
    if (isSize) vals = sortSizeValues(vals.map(cleanVariantSizeValue).filter(Boolean));
    const variant = {
      label: v.label,
      jaLabel,
      values: vals,
      zeroStock: isSize ? (v.zeroStock || []).map(cleanVariantSizeValue).filter(Boolean) : (v.zeroStock || []),
      images: v.images || {},
    };
    variant.jaValues = vals.map(val => defaultVariantJaValue(variant, val));
    return {
      ...variant,
    };
  });
  showProductPanel();
}
