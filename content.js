/**
 * CiNii 共通所蔵館チェッカー - Content Script
 * CiNii Books 雑誌詳細ページから所蔵館・所蔵巻号情報を抽出する
 */

/**
 * ページから所蔵館情報を抽出する
 * @returns {{ journalTitle: string, journalUrl: string, libraries: Array }} | null
 */
function extractHoldingsData() {
  const holdingLibraries = document.getElementById('holding-libraries');
  if (!holdingLibraries) return null;

  const titleEl = document.querySelector('meta[name="dc.title"]');
  const journalTitle = titleEl
    ? titleEl.getAttribute('content')
    : document.title.replace(/^CiNii\s+雑誌\s+-\s+/, '').trim();
  const journalUrl = window.location.href;

  const libraries = [];
  const items = holdingLibraries.querySelectorAll('li[name="library"]');

  items.forEach((item) => {
    const nameEl = item.querySelector('a[href^="/library/"]');
    const volumeEl = item.querySelector('span.ll-volume.hlv');

    if (nameEl && volumeEl) {
      const name = nameEl.textContent.trim();
      const libraryId = nameEl.getAttribute('href').replace('/library/', '');
      // <wbr> 要素はテキストコンテンツを持たないため textContent で除去される
      const volumeStr = volumeEl.textContent.trim();
      const region = item.getAttribute('_kc') || '';

      libraries.push({ name, libraryId, volumeStr, region });
    }
  });

  return { journalTitle, journalUrl, libraries };
}

// ポップアップからのメッセージを受信して所蔵データを返す
// executeScript で複数回注入されても onMessage リスナーが重複しないようガードする
if (!window.__ciniiCheckerInjected) {
  window.__ciniiCheckerInjected = true;
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getHoldingsData') {
      sendResponse(extractHoldingsData());
    }
    return true; // 非同期レスポンスを許可
  });
}
