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

// ─── 館情報（参加組織情報）の取得 ─────────────────────────────────────────
//
// ILL の複写料金・送料・決済方法は、CiNii の「館情報」に載っている。
// Books は /library/FA… が独立したページだが、CiNii Research では htmx の
// ポップアップ（/api/facility/FA…）だけで、開けるURLが存在しない。
// そこで同一オリジンの content script から fetch して、ポップアップ側で描画する。
// 同一オリジンなので host_permissions は不要（activeTab のみで動く）。

/**
 * 現在のサイトにおける館情報のパスを返す
 * @param {string} libraryId FA番号
 * @returns {string|null}
 */
function facilityPath(libraryId) {
  const host = location.hostname;
  if (host === 'cir.nii.ac.jp') return `/api/facility/${libraryId}`;
  if (host === 'ci.nii.ac.jp') return `/library/${libraryId}`;
  return null;
}

/**
 * 要素のテキストを正規化して取り出す
 * メールアドレスの @ は Books が <script>+<noscript>、Research が
 * .replace-at-mark で難読化しているため、どちらも @ に戻す
 * @param {Element|null} el
 * @returns {string}
 */
function facilityText(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('script').forEach((s) => s.remove());
  clone.querySelectorAll('noscript, .replace-at-mark, #replace-at-mark')
    .forEach((n) => n.replaceWith('@'));
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

/**
 * 館名・住所・電話番号を取り出す
 * Books:    <p class="library-location">305-8550 つくば市春日1-2</p>
 *           <span class="library-tel">TEL：029-859-1200</span>
 * Research: <span class="library-zip-code">…</span><span class="library-address">…</span>
 *           <span class="library-tel">052-778-7147</span>
 * @param {Document} doc
 * @returns {{ name: string, zip: string, address: string, tel: string, fax: string }}
 */
function extractFacilityHeader(doc) {
  const addrEl = doc.querySelector('.library-address');
  // Books は郵便番号と住所が同じ <p> に入っているので分離せずそのまま使う
  const zip = addrEl ? facilityText(doc.querySelector('.library-zip-code')) : '';
  const address = addrEl ? facilityText(addrEl)
                         : facilityText(doc.querySelector('p.library-location'));
  // Books はラベルが span の中、Research は外にあるので、あれば剥がす
  const strip = (s, label) => s.replace(new RegExp(`^${label}\\s*[：:]?\\s*`, 'i'), '');

  return {
    name: facilityText(doc.querySelector('h1.library_class')),
    zip,
    address,
    tel: strip(facilityText(doc.querySelector('.library-tel')), 'TEL'),
    fax: strip(facilityText(doc.querySelector('.library-fax')), 'FAX'),
  };
}

/**
 * 「利用方法」の各行を取り出す
 * 本文中の URL はアンカーのテキストが省略されている場合があるので href も返す
 * @param {Document} doc
 * @returns {Array<{ text: string, links: string[] }>}
 */
function extractFacilityParagraphs(doc) {
  const root = doc.querySelector('.library-particulars');
  if (!root) return [];

  return [...root.querySelectorAll('p.lib-paragraph')]
    .map((p) => ({
      text: facilityText(p),
      // DOMParser の文書には base URL が無いため、絶対URLだけを拾う
      links: [...p.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((href) => /^https?:\/\//i.test(href)),
    }))
    .filter((p) => p.text || p.links.length);
}

/**
 * 「各種コード」（ILL参加・図書館間複写サービスの可否など）を取り出す
 * @param {Document} doc
 * @returns {Array<{ label: string, value: string }>}
 */
function extractFacilityCodes(doc) {
  return [...doc.querySelectorAll('.detailcodeslist .papercodesitem')]
    .map((li) => ({
      label: facilityText(li.querySelector('dt')),
      value: facilityText(li.querySelector('dd')),
    }))
    .filter((c) => c.label);
}

/**
 * 館情報を取得してパースする
 * @param {string} libraryId FA番号
 * @returns {Promise<{ ok: true, facility: object }|{ ok: false, reason: string }>}
 */
async function fetchFacility(libraryId) {
  if (!/^[A-Za-z0-9]{1,16}$/.test(libraryId || '')) return { ok: false, reason: 'invalid-id' };

  const path = facilityPath(libraryId);
  if (!path) return { ok: false, reason: 'unsupported-page' };

  let res;
  try {
    res = await fetch(location.origin + path, {
      credentials: 'omit',
      // Research 側は htmx からのリクエストを前提にしているため合わせておく
      headers: { 'HX-Request': 'true' },
    });
  } catch (_) {
    return { ok: false, reason: 'fetch-failed' };
  }
  if (!res.ok) return { ok: false, reason: `http-${res.status}` };

  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const facility = {
    libraryId,
    ...extractFacilityHeader(doc),
    paragraphs: extractFacilityParagraphs(doc),
    codes: extractFacilityCodes(doc),
  };

  // CiNii 側の仕様変更で構造が変わった場合は、誤った空表示ではなくエラーにする
  if (!facility.name && facility.paragraphs.length === 0 && facility.codes.length === 0) {
    return { ok: false, reason: 'parse-failed' };
  }
  return { ok: true, facility };
}

// ポップアップからのメッセージを受信して所蔵データを返す
// executeScript で複数回注入されても onMessage リスナーが重複しないようガードする
// （ガード名にバージョンを含めることで、旧版が注入済みのタブでも新版が必ず登録される）
if (!window.__ciniiCheckerInjected_v3) {
  window.__ciniiCheckerInjected_v3 = true;
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getHoldingsData') {
      sendResponse(extractHoldingsData());
    } else if (request.action === 'getFacilityInfo') {
      fetchFacility(request.libraryId).then(sendResponse);
    }
    return true; // 非同期レスポンスを許可
  });
}
