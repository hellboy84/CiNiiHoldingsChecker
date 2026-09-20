/**
 * CiNii 共通所蔵館チェッカー - Content Script
 * CiNii Books / CiNii Research の雑誌・図書詳細ページから
 * 所蔵館・所蔵巻号（巻次）情報を抽出する
 */

/**
 * ページ種別を判定する
 * 'books-journal' | 'books-book' | 'research-journal' | 'research-book' | null
 * @returns {string|null}
 */
function detectPageType() {
  const host = location.hostname;
  const site = host === 'cir.nii.ac.jp' ? 'research'
             : host === 'ci.nii.ac.jp' ? 'books'
             : null;
  if (!site) return null;

  const h1 = document.querySelector('h1.entry-title');
  const kind = h1 && h1.classList.contains('journal_class') ? 'journal'
             : h1 && h1.classList.contains('book_class') ? 'book'
             : /\/ncid\/A/i.test(location.pathname) ? 'journal'   // Books のフォールバック
             : /\/ncid\/B/i.test(location.pathname) ? 'book'
             : null;

  return kind ? `${site}-${kind}` : null;
}

/**
 * 館の a 要素から館ID（FA番号）と館名を取り出す
 * Books:    <a href="/library/FA015624">館名</a>
 * Research: <a hx-get="/api/facility/FA027204" …>館名</a>
 * FA番号の末尾はチェックディジットの X になることがあるため、
 * 数字前提の正規表現ではなくパスセグメント全体を取る
 * @param {Element} item li[name="library"]
 * @returns {{ libraryId: string, name: string }|null}
 */
function extractLibrary(item) {
  const booksLink = item.querySelector('a[href^="/library/"]');
  if (booksLink) {
    const libraryId = booksLink.getAttribute('href').replace('/library/', '').split(/[/?#]/)[0];
    if (libraryId) return { libraryId, name: booksLink.textContent.trim() };
  }

  const researchLink = item.querySelector('a[hx-get^="/api/facility/"]');
  if (researchLink) {
    const m = researchLink.getAttribute('hx-get').match(/\/api\/facility\/([^/?#]+)/);
    if (m) return { libraryId: m[1], name: researchLink.textContent.trim() };
  }

  return null;
}

/**
 * 1館分の所蔵巻情報を取り出す
 * 雑誌: span.ll-volume.hlv のテキスト（"1-5,7-11,13" など）
 * 図書: span.ll-volume.vlsr > span.vol のテキスト（"上巻", "2025年版" など）
 *       vlsr 全体には請求記号(.cln)・登録番号(.rgtn)も含まれるため必ず .vol を指定する
 * @param {Element} item li[name="library"]
 * @param {boolean} isBook
 * @returns {string[]}
 */
function extractVolumeStrs(item, isBook) {
  const selector = isBook ? 'span.ll-volume.vlsr > span.vol' : 'span.ll-volume.hlv';
  // <wbr> 要素はテキストコンテンツを持たないため textContent で除去される
  return [...item.querySelectorAll(selector)]
    .map((el) => el.textContent.trim())
    .filter((s) => s);
}

/**
 * ページのタイトル（資料名）を取得する
 * @param {string} site 'books' | 'research'
 * @returns {string}
 */
function extractTitle(site) {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  if (site === 'books') {
    const metaEl = document.querySelector('meta[name="dc.title"]');
    const meta = clean(metaEl && metaEl.getAttribute('content'));
    if (meta) return meta;
  } else {
    const ja = clean(document.querySelector('h1.entry-title span.ja')?.textContent);
    if (ja) return ja;
  }

  const h1 = clean(document.querySelector('h1.entry-title')?.textContent);
  if (h1) return h1;

  return clean(document.title).replace(/^CiNii\s+(雑誌|図書)\s+-\s+/, '');
}

/**
 * ページから所蔵館情報を抽出する
 * @returns {{ pageType: string, title: string, url: string, libraries: Array }
 *          |{ pageType: string, noHoldings: true, holdingsUrl: string|null }
 *          |null}
 */
function extractHoldingsData() {
  const pageType = detectPageType();
  if (!pageType) {
    // CiNii のページではあるが、雑誌・図書のいずれでもない（論文・博士論文など）
    const onCiNii = location.hostname === 'ci.nii.ac.jp' || location.hostname === 'cir.nii.ac.jp';
    return onCiNii ? { pageType: null, unsupported: true } : null;
  }

  const [site, kind] = pageType.split('-');
  const isBook = kind === 'book';

  const holdingLibraries = document.getElementById('holding-libraries');
  if (!holdingLibraries) {
    // CiNii Research の書誌ページ（/holdings なし）には所蔵リストが存在しない
    const tab = document.querySelector('#tab-librarian');
    return { pageType, noHoldings: true, holdingsUrl: tab ? tab.href : null };
  }

  const libraries = [];
  const items = holdingLibraries.querySelectorAll('li[name="library"]');

  items.forEach((item) => {
    const lib = extractLibrary(item);
    // 巻情報を持たない館（単巻本など）も所蔵館として扱うため、館IDだけを条件にする
    if (!lib) return;

    libraries.push({
      name: lib.name,
      libraryId: lib.libraryId,
      volumeStrs: extractVolumeStrs(item, isBook),
      region: item.getAttribute('_kc') || '',
    });
  });

  return {
    pageType,
    title: extractTitle(site),
    url: location.origin + location.pathname,
    libraries,
  };
}

// ポップアップからのメッセージを受信して所蔵データを返す
// executeScript で複数回注入されても onMessage リスナーが重複しないようガードする
// （ガード名にバージョンを含めることで、旧版が注入済みのタブでも新版が必ず登録される）
if (!window.__ciniiCheckerInjected_v2) {
  window.__ciniiCheckerInjected_v2 = true;
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getHoldingsData') {
      sendResponse(extractHoldingsData());
    }
    return true; // 非同期レスポンスを許可
  });
}
