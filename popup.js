/**
 * CiNii 共通所蔵館チェッカー - Popup Script
 */

// ─── ページ種別 ──────────────────────────────────────────────────────────────

/** ver1.4 までのデータ（CiNii Books の雑誌）の移行先 */
const LEGACY_PAGE_TYPE = 'books-journal';

const PAGE_TYPE_LABELS = {
  'books-journal': 'CiNii Books - 雑誌',
  'books-book': 'CiNii Books - 図書',
  'research-journal': 'CiNii Research - 雑誌',
  'research-book': 'CiNii Research - 図書',
};

/** 図書のページ種別か */
function isBookType(pageType) {
  return typeof pageType === 'string' && pageType.endsWith('-book');
}

// 巻号・巻次の照合と地域の対応表は lib/holdings.js にある

// ─── DOM 要素 ────────────────────────────────────────────────────────────────

const statusDiv = document.getElementById('status');
const pageTypeEl = document.getElementById('page-type');
/** 対象ページでのみ表示する領域（入力欄・登録リスト・計算・クリア） */
const workAreaEls = ['input-area', 'section-list', 'section-calc', 'section-clear']
  .map((id) => document.getElementById(id));
const journalTitleEl = document.getElementById('journal-title');
const volumeLabelEl = document.getElementById('volume-label');
const volumeUnitEl = document.getElementById('volume-unit');
const volumeHintEl = document.getElementById('volume-hint');
const issueGroupEl = document.getElementById('issue-group');
const volumeOptionsEl = document.getElementById('volume-options');
const targetVolumeInput = document.getElementById('target-volume');
const targetIssueInput = document.getElementById('target-issue');
const addBtn = document.getElementById('add-btn');
const journalListEl = document.getElementById('journal-list');
const calcBtn = document.getElementById('calc-btn');
const resultEl = document.getElementById('result');
const hitPreviewEl = document.getElementById('hit-preview');
const legacyNoticeEl = document.getElementById('legacy-notice');
const clearAllBtn = document.getElementById('clear-all-btn');

/** 対象ページでのみ使う領域の表示・非表示を切り替える */
function setWorkAreaVisible(visible) {
  for (const el of workAreaEls) el.hidden = !visible;
}

// ─── 状態 ────────────────────────────────────────────────────────────────────

/** @type {{ pageType: string, title: string, url: string, libraries: Array }|null} */
let currentPageData = null;

/** 現在開いているページの種別（対象外のページでは null） */
let currentPageType = null;

/** 現在のページの所蔵を館ごとにまとめたもの（groupHoldings の結果） */
let currentHoldings = [];

/** そのページに実在する巻次（図書の入力候補） */
let volumeCandidates = [];

/** 候補リストを組み立てたときの先頭部分（作り直しの要否判定用） */
let volumeOptionsRenderedBase = null;

/** セッション内で計算から一時除外するエントリ id の集合（ポップアップを閉じるとリセット） */
const excludedIds = new Set();

// ─── ストレージ ───────────────────────────────────────────────────────────────

/**
 * ver1.4 までの journals（CiNii Books の雑誌のみ）を
 * ページ種別ごとのコレクションへ移行する
 */
async function migrateStorage() {
  const { journals, collections } = await chrome.storage.local.get(['journals', 'collections']);
  if (collections) return;

  const migrated = {};
  if (Array.isArray(journals) && journals.length > 0) {
    migrated[LEGACY_PAGE_TYPE] = journals;
  }
  await chrome.storage.local.set({ collections: migrated });
  if (journals !== undefined) await chrome.storage.local.remove('journals');
}

async function getCollections() {
  const { collections = {} } = await chrome.storage.local.get('collections');
  return collections;
}

/** 表示中のページ種別の登録済み資料を取得する */
async function getEntries() {
  const collections = await getCollections();
  return collections[currentPageType] || [];
}

/** 表示中のページ種別の登録済み資料を保存する */
async function setEntries(entries) {
  const collections = await getCollections();
  collections[currentPageType] = entries;
  await chrome.storage.local.set({ collections });
}

// ─── 初期化 ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await migrateStorage();
  await loadCurrentPage();
  if (currentPageType) await renderJournalList();
});

// ─── 現在ページからデータ取得 ─────────────────────────────────────────────────

async function loadCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('no tab');

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });

    const data = await chrome.tabs.sendMessage(tab.id, { action: 'getHoldingsData' });

    if (!data) {
      applyNoPageType('CiNii Books / CiNii Research の詳細ページを開いてください');
      return;
    }

    if (!data.pageType) {
      applyNoPageType('このページ種別には対応していません（雑誌・図書の詳細ページを開いてください）');
      return;
    }

    currentPageType = data.pageType;
    applyPageTypeUi(currentPageType);

    if (data.noHoldings) {
      showStatus(
        'このページには所蔵情報がありません。「所蔵館」タブを開いてください',
        'warning',
        data.holdingsUrl
      );
      return;
    }

    currentPageData = data;
    currentHoldings = groupHoldings(data.libraries);
    journalTitleEl.textContent = data.title;
    fillVolumeOptions(data);
    showStatus(`${currentHoldings.length}館の所蔵情報を検出しました`, 'success');
    addBtn.disabled = false;
    updateHitPreview();
  } catch (_e) {
    applyNoPageType('CiNii Books / CiNii Research の詳細ページを開いてください');
  }
}

/**
 * 対象外のページでは、案内だけを残して入力欄・登録リスト・計算・クリアを隠す
 * @param {string} message
 */
function applyNoPageType(message) {
  currentPageType = null;
  pageTypeEl.textContent = '現在のページ：対象外のページ';
  setWorkAreaVisible(false);
  showStatus(message, 'warning');
}

/**
 * ページ種別に応じて入力欄とラベルを切り替える
 * @param {string} pageType
 */
function applyPageTypeUi(pageType) {
  const label = PAGE_TYPE_LABELS[pageType] || '';
  pageTypeEl.textContent = `現在のページ：${label}`;
  setWorkAreaVisible(true);

  const book = isBookType(pageType);

  volumeLabelEl.textContent = book ? '確認する巻次：' : '確認する巻号：';
  volumeUnitEl.hidden = book;
  issueGroupEl.hidden = book;

  targetVolumeInput.value = '';
  targetIssueInput.value = '';
  targetVolumeInput.type = book ? 'text' : 'number';
  targetVolumeInput.placeholder = book ? '任意。カンマ区切りでOR。' : '';
  targetVolumeInput.classList.toggle('wide', book);

  volumeHintEl.textContent = book
    ? '※部分一致で照合。候補から続けて選ぶかカンマ区切りで OR 条件で追加される（例：上,上巻）'
    : '※号を空白にすると巻単位で照合';

  volumeCandidates = [];
  volumeOptionsRenderedBase = null;
  volumeOptionsEl.replaceChildren();
  hitPreviewEl.textContent = '';
}

/** 図書の場合、そのページに実在する巻次を入力候補として提示する */
function fillVolumeOptions(data) {
  volumeCandidates = [];
  volumeOptionsRenderedBase = null;
  volumeOptionsEl.replaceChildren();
  if (!isBookType(data.pageType)) return;

  const values = new Set();
  for (const lib of data.libraries) {
    for (const v of lib.volumeStrs) values.add(v);
  }

  volumeCandidates = [...values].sort((a, b) => a.localeCompare(b, 'ja'));
  renderVolumeOptions();
}

/**
 * 候補に付ける先頭部分を決める
 * - 入力が空／区切り文字の直後 → そのまま（新しい巻次を選ぶ）
 * - 直前の入力がそのまま候補と一致 → 末尾に区切りを足す（選ぶたびに OR で追加される）
 * - 入力途中 → 最後の区切りまで（打ちかけの部分は候補で置き換える）
 * @returns {string}
 */
function volumeOptionBase() {
  const value = targetVolumeInput.value;
  const sepIdx = Math.max(value.lastIndexOf(','), value.lastIndexOf('，'), value.lastIndexOf('、'));
  const head = sepIdx >= 0 ? value.slice(0, sepIdx + 1) : '';
  const tail = value.slice(sepIdx + 1).trim();

  if (!tail) return head;
  if (volumeCandidates.includes(tail)) return `${value},`;
  return head;
}

/**
 * 入力欄の内容に応じて候補を組み立てる
 * プルダウンから選ぶだけで巻次を積み重ねられるよう、候補には確定済みの入力を先頭に付ける
 */
function renderVolumeOptions() {
  if (volumeCandidates.length === 0) return;

  const base = volumeOptionBase();
  // 先頭部分が変わったときだけ作り直す（入力のたびに候補リストが揺れるのを防ぐ）
  if (base === volumeOptionsRenderedBase) return;
  volumeOptionsRenderedBase = base;

  // すでに選んだ巻次は候補から外す
  const chosen = new Set(splitVolumeTargets(base).map(normalizeVol));

  volumeOptionsEl.replaceChildren();
  for (const v of volumeCandidates) {
    if (chosen.has(normalizeVol(v))) continue;
    const option = document.createElement('option');
    option.value = base + v;
    // 先頭を付けた分だけ表示が長くなるため、一覧には巻次だけを見せる
    if (base) option.setAttribute('label', v);
    volumeOptionsEl.appendChild(option);
  }
}

targetVolumeInput.addEventListener('input', () => {
  if (isBookType(currentPageType)) renderVolumeOptions();
  updateHitPreview();
});
targetIssueInput.addEventListener('input', updateHitPreview);

/** 入力中の条件で、このページの何館がヒットするかを表示する */
function updateHitPreview() {
  const cond = currentPageData
    ? readCondition(isBookType(currentPageType), targetVolumeInput.value, targetIssueInput.value)
    : { error: true };
  hitPreviewEl.textContent = cond.error
    ? ''
    : `この条件で ${currentHoldings.filter((h) => holdingMatches(h, cond)).length}館がヒット`;
}

/**
 * ステータス表示
 * @param {string} message
 * @param {string} type success | warning | error
 * @param {string|null} [linkUrl] 併記するリンク先
 */
function showStatus(message, type, linkUrl) {
  statusDiv.replaceChildren();
  statusDiv.className = `status ${type}`;
  statusDiv.appendChild(document.createTextNode(message));
  if (linkUrl) {
    const link = document.createElement('a');
    link.href = linkUrl;
    link.target = '_blank';
    link.className = 'status-link';
    link.textContent = '所蔵ページを開く';
    statusDiv.append(' ', link);
  }
}


/**
 * 巻号（巻次）の入力を照合条件にする
 * @param {boolean} book 図書か
 * @param {string} volumeValue 巻（図書は巻次）の入力
 * @param {string} issueValue  号の入力
 * @returns {{ book: boolean, targetVolume: number|null, targetIssue: number|null, targetVolumeLabel: string, label: string }
 *          |{ error: string }}
 */
function readCondition(book, volumeValue, issueValue) {
  if (book) {
    const targetVolumeLabel = volumeValue.trim();
    return {
      book, targetVolume: null, targetIssue: null, targetVolumeLabel,
      label: volumeTargetLabel(targetVolumeLabel),
    };
  }
  const targetVolume = parseInt(volumeValue, 10);
  if (isNaN(targetVolume) || targetVolume < 1) return { error: '巻（1以上の整数）を入力してください' };
  const targetIssueRaw = parseInt(issueValue, 10);
  const targetIssue = (!isNaN(targetIssueRaw) && targetIssueRaw >= 1) ? targetIssueRaw : null;
  return {
    book, targetVolume, targetIssue, targetVolumeLabel: '',
    label: targetIssue != null ? `${targetVolume}巻${targetIssue}号` : `${targetVolume}巻`,
  };
}

/** 登録済みエントリと条件が同じか（同じ資料の同じ巻号は1件にまとめる） */
function sameCondition(entry, cond) {
  return cond.book
    ? volumeTargetKey(entry.targetVolumeLabel || '') === volumeTargetKey(cond.targetVolumeLabel)
    : entry.targetVolume === cond.targetVolume && entry.targetIssue === cond.targetIssue;
}

/**
 * v2.2 以降の登録か。v2.2 からはページの全館の所蔵（holdings）を保存し、
 * ヒットする館はその都度計算する。それより前は登録時に絞り込んだ館（libraries）だけを持つ
 */
function hasHoldings(entry) {
  return Array.isArray(entry.holdings);
}

/**
 * エントリの条件を満たす館の一覧
 * @returns {{ libraryId: string, name: string, region: string, grp?: string, records?: Array }[]}
 */
function entryHits(entry) {
  if (!hasHoldings(entry)) return entry.libraries || [];
  const cond = { book: isBookType(currentPageType), ...entry };
  return entry.holdings.filter((h) => holdingMatches(h, cond));
}

/** 登録済みエントリの表示用ラベル（旧データには label が無いため補完する） */
function entryLabel(entry) {
  if (entry.label) return entry.label;
  if (entry.targetVolume != null) {
    return entry.targetIssue != null
      ? `${entry.targetVolume}巻${entry.targetIssue}号`
      : `${entry.targetVolume}巻`;
  }
  return '巻次指定なし';
}

// ─── コレクションに追加 ───────────────────────────────────────────────────────

addBtn.addEventListener('click', async () => {
  if (!currentPageData) return;

  const cond = readCondition(isBookType(currentPageType), targetVolumeInput.value, targetIssueInput.value);
  if (cond.error) {
    alert(cond.error);
    return;
  }

  // storage に保存（同一URLかつ同一巻号（巻次）の場合は上書き、異なれば別エントリとして追加）
  const entries = await getEntries();
  const existingIdx = entries.findIndex((e) => e.url === currentPageData.url && sameCondition(e, cond));

  const entry = {
    id: existingIdx >= 0 ? entries[existingIdx].id : Date.now().toString(),
    title: currentPageData.title,
    url: currentPageData.url,
    label: cond.label,
    targetVolume: cond.targetVolume,
    targetIssue: cond.targetIssue,
    targetVolumeLabel: cond.targetVolumeLabel,
    holdings: currentHoldings,
  };

  if (existingIdx >= 0) {
    entries[existingIdx] = entry;
  } else {
    entries.push(entry);
  }

  await setEntries(entries);
  await renderJournalList();
  resultEl.replaceChildren();

  if (cond.book) {
    // 次の巻次を選び直せるよう、選択済みの巻次を空にして候補も戻す
    targetVolumeInput.value = '';
    renderVolumeOptions();
    updateHitPreview();
  }

  const action = existingIdx >= 0 ? '更新' : '追加';
  showStatus(
    `${action}完了：${cond.label}を所蔵している館は ${entryHits(entry).length}館です`,
    'success'
  );
});

// ─── 登録済み資料リスト描画 ───────────────────────────────────────────────────

function updateCalcBtnState(entries) {
  const activeCount = entries.length - entries.filter((e) => excludedIds.has(e.id)).length;
  calcBtn.disabled = (activeCount === 0);
}

async function renderJournalList() {
  const entries = await getEntries();

  journalListEl.replaceChildren();
  legacyNoticeEl.hidden = entries.every(hasHoldings);

  if (entries.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-message';
    emptyMsg.textContent = '登録済みの資料はありません';
    journalListEl.appendChild(emptyMsg);
    updateCalcBtnState(entries);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement('div');
    item.className = 'journal-item';
    if (excludedIds.has(entry.id)) item.classList.add('excluded');

    const infoDiv = document.createElement('div');
    infoDiv.className = 'journal-info';

    const titleLink = document.createElement('a');
    titleLink.href = entry.url;
    titleLink.target = '_blank';
    titleLink.className = 'journal-title-link';
    titleLink.title = entry.title;
    titleLink.textContent = entry.title;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'journal-meta';

    // 巻号（巻次）そのものをボタンにして、押すとその場で修正できるようにする
    // 旧形式は全館の所蔵を持たないため、条件を変えて判定し直せない
    let labelEl;
    if (hasHoldings(entry)) {
      labelEl = document.createElement('button');
      labelEl.className = 'label-btn';
      labelEl.title = 'クリックして巻号（巻次）を修正';
      labelEl.textContent = entryLabel(entry);
      labelEl.addEventListener('click', () => startEdit(metaDiv, entry));
    } else {
      labelEl = document.createElement('span');
      labelEl.textContent = entryLabel(entry);
    }
    const countSpan = document.createElement('span');
    countSpan.textContent = `${entryHits(entry).length}館所蔵` + (hasHoldings(entry) ? '' : '（旧形式）');
    metaDiv.append(labelEl, '／', countSpan);

    infoDiv.appendChild(titleLink);
    infoDiv.appendChild(metaDiv);

    const excludeCheck = document.createElement('input');
    excludeCheck.type = 'checkbox';
    excludeCheck.className = 'exclude-check';
    excludeCheck.checked = !excludedIds.has(entry.id);
    excludeCheck.title = '計算対象に含める';
    excludeCheck.addEventListener('change', async () => {
      if (excludeCheck.checked) {
        excludedIds.delete(entry.id);
      } else {
        excludedIds.add(entry.id);
      }
      item.classList.toggle('excluded', !excludeCheck.checked);
      updateCalcBtnState(entries);
      await runCalculation(entries);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.dataset.id = entry.id;
    deleteBtn.title = '削除';
    deleteBtn.textContent = '×';

    item.appendChild(infoDiv);
    item.appendChild(excludeCheck);
    item.appendChild(deleteBtn);
    journalListEl.appendChild(item);
  }

  updateCalcBtnState(entries);

  journalListEl.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deleteEntry(btn.getAttribute('data-id'));
    });
  });
}

/**
 * 登録済み資料の巻号（巻次）をその場で修正する
 * 登録時に保存した全館の所蔵で判定し直すので、ページを開き直す必要はない
 * @param {HTMLElement} metaDiv 巻号と館数を表示している行
 * @param {object} entry
 */
function startEdit(metaDiv, entry) {
  const book = isBookType(currentPageType);
  const form = document.createElement('form');
  form.className = 'edit-form';

  const makeInput = (value, wide) => {
    const input = document.createElement('input');
    input.type = wide ? 'text' : 'number';
    input.min = '1';
    input.value = value ?? '';
    if (wide) input.className = 'wide';
    return input;
  };
  const volInput = makeInput(book ? entry.targetVolumeLabel : entry.targetVolume, book);
  const issueInput = makeInput(entry.targetIssue, false);
  if (book) {
    volInput.placeholder = '巻次（カンマ区切りでOR）';
    form.append(volInput);
  } else {
    issueInput.placeholder = '任意';
    form.append(volInput, '巻', issueInput, '号');
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'edit-save';
  saveBtn.textContent = '保存';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'edit-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => renderJournalList());
  form.append(saveBtn, cancelBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cond = readCondition(book, volInput.value, issueInput.value);
    if (cond.error) {
      alert(cond.error);
      return;
    }
    const entries = await getEntries();
    if (entries.some((x) => x.id !== entry.id && x.url === entry.url && sameCondition(x, cond))) {
      alert(`${cond.label}はすでに登録されています`);
      return;
    }
    const target = entries.find((x) => x.id === entry.id);
    if (!target) return;
    Object.assign(target, {
      label: cond.label,
      targetVolume: cond.targetVolume,
      targetIssue: cond.targetIssue,
      targetVolumeLabel: cond.targetVolumeLabel,
    });
    await setEntries(entries);
    await renderJournalList();
    // 計算結果を表示中なら、修正後の条件で計算し直す
    if (resultEl.childElementCount) await runCalculation(entries);
  });

  metaDiv.replaceChildren(form);
  volInput.focus();
  volInput.select();
}

async function deleteEntry(id) {
  excludedIds.delete(id);
  const entries = await getEntries();
  await setEntries(entries.filter((e) => e.id !== id));
  await renderJournalList();
  resultEl.replaceChildren();
}

// ─── 共通所蔵館の計算 ─────────────────────────────────────────────────────────

/** 直近の計算結果（館情報パネルで、その館の所蔵を表示するために使う） */
let lastCalc = { entries: [], libraries: new Map() };

async function runCalculation(entries) {
  const activeEntries = entries.filter((e) => !excludedIds.has(e.id));
  if (activeEntries.length === 0) {
    resultEl.replaceChildren();
    return;
  }

  // 各資料のヒット館IDの集合を作り、積集合を求める
  const hitsPerEntry = activeEntries.map(entryHits);
  const librarySets = hitsPerEntry.map((hits) => new Set(hits.map((l) => l.libraryId)));
  let commonIds = new Set(librarySets[0]);
  for (let i = 1; i < librarySets.length; i++) {
    for (const id of commonIds) {
      if (!librarySets[i].has(id)) commonIds.delete(id);
    }
  }

  // 館名・地域コード・料金相殺を引く（最初に見つかったものを使う。相殺は旧形式に無いので補う）
  const infoMap = new Map();
  for (const hits of hitsPerEntry) {
    for (const lib of hits) {
      if (!commonIds.has(lib.libraryId)) continue;
      const known = infoMap.get(lib.libraryId);
      if (!known) {
        infoMap.set(lib.libraryId, {
          id: lib.libraryId, name: lib.name, region: lib.region || '', grp: lib.grp || '',
        });
      } else if (!known.grp && lib.grp) {
        known.grp = lib.grp;
      }
    }
  }
  const commonLibraries = sortLibraries([...infoMap.values()]);
  lastCalc = { entries: activeEntries, libraries: infoMap };

  if (commonLibraries.length === 0) {
    resultEl.replaceChildren();
    const noResult = document.createElement('p');
    noResult.className = 'no-result';
    noResult.textContent = '全ての資料の指定した巻号（巻次）を所蔵している機関はありません';
    resultEl.appendChild(noResult);
    return;
  }

  // result DOM構築
  resultEl.replaceChildren();

  const heading = document.createElement('h3');
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'collapse-all-btn';
  collapseBtn.textContent = '▴ 詳細を閉じる';
  heading.append(`共通所蔵館（${commonLibraries.length}件）`, collapseBtn);
  resultEl.appendChild(heading);

  const regionCounts = new Map();
  for (const lib of commonLibraries) {
    const { region } = regionOf(lib.region);
    regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
  }

  const libList = document.createElement('ul');
  libList.className = 'common-libraries-list';
  let prevRegion = null;
  for (const lib of commonLibraries) {
    const { region, pref } = regionOf(lib.region);

    // 地域が変わるところに見出しを入れる
    if (region !== prevRegion) {
      const regionLi = document.createElement('li');
      regionLi.className = 'region-heading';
      const countSpan = document.createElement('span');
      countSpan.className = 'region-count';
      countSpan.textContent = regionCounts.get(region);
      regionLi.append(region, countSpan);
      libList.appendChild(regionLi);
      prevRegion = region;
    }

    const li = document.createElement('li');

    const row = document.createElement('div');
    row.className = 'lib-row';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.dataset.fa = lib.id;
    copyBtn.title = 'FA番号をコピー';
    copyBtn.textContent = 'copy';

    const faSpan = document.createElement('span');
    faSpan.className = 'lib-fa-id';
    faSpan.textContent = lib.id;

    const nameBtn = document.createElement('button');
    nameBtn.className = 'lib-name-btn';
    nameBtn.dataset.fa = lib.id;
    nameBtn.setAttribute('aria-expanded', 'false');
    nameBtn.title = '所蔵と館情報（ILL の受付可否・料金・送付方法）を開く';
    nameBtn.textContent = lib.name;

    row.append(copyBtn, faSpan, nameBtn);
    if (pref) {
      const prefSpan = document.createElement('span');
      prefSpan.className = 'lib-pref';
      prefSpan.textContent = pref;
      row.appendChild(prefSpan);
    }

    const detail = document.createElement('div');
    detail.className = 'lib-detail';
    detail.hidden = true;

    li.append(row, detail);
    libList.appendChild(li);
  }
  resultEl.appendChild(libList);

  // 開いた館情報をまとめて閉じる
  collapseBtn.addEventListener('click', () => {
    for (const detail of libList.querySelectorAll('.lib-detail')) detail.hidden = true;
    for (const btn of libList.querySelectorAll('.lib-name-btn')) btn.setAttribute('aria-expanded', 'false');
  });

  // copyボタン・館名ボタン — イベント委譲
  libList.addEventListener('click', async (e) => {
    const nameBtn = e.target.closest('.lib-name-btn');
    if (nameBtn) {
      await toggleFacility(nameBtn);
      return;
    }

    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const faId = btn.dataset.fa;
    try {
      await navigator.clipboard.writeText(faId);
      const orig = btn.textContent;
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
    } catch (_) {
      alert('クリップボードへのコピーに失敗しました');
    }
  });
}

// ─── 館情報（参加組織情報）の表示 ─────────────────────────────────────────
//
// CiNii Research には館単体のページが無く、館情報は htmx のポップアップでしか
// 出てこない。content script に同一オリジンで取得させ、ここで描画する。

/** libraryId -> 取得済みの館情報（成功したものだけキャッシュする） */
const facilityCache = new Map();

const FACILITY_ERRORS = {
  'unsupported-page': 'CiNii Books / CiNii Research のページを開いた状態で実行すると館情報を表示できます',
  'no-content-script': 'CiNii Books / CiNii Research のページを開いた状態で実行すると館情報を表示できます',
  'parse-failed': 'CiNii 側のページ構成が変わったため、館情報を読み取れませんでした',
  'fetch-failed': '館情報の取得に失敗しました（通信エラー）',
  'invalid-id': 'FA番号が不正です',
};

/**
 * 館情報を取得する（成功時のみキャッシュし、失敗は再試行できるようにする）
 * @param {string} libraryId
 * @returns {Promise<{ ok: boolean, facility?: object, reason?: string }>}
 */
async function requestFacility(libraryId) {
  if (facilityCache.has(libraryId)) return facilityCache.get(libraryId);

  let result;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    result = await chrome.tabs.sendMessage(tab.id, { action: 'getFacilityInfo', libraryId });
    if (!result) result = { ok: false, reason: 'no-content-script' };
  } catch (_) {
    // CiNii 以外のタブでは content script が注入されていない
    result = { ok: false, reason: 'no-content-script' };
  }

  if (result.ok) facilityCache.set(libraryId, result);
  return result;
}

/**
 * 館名ボタンの開閉
 * 所蔵（保存済みのデータ）はすぐに描画し、館情報は取得してから描画する
 * @param {HTMLButtonElement} btn
 */
async function toggleFacility(btn) {
  const detail = btn.closest('li').querySelector('.lib-detail');

  if (!detail.hidden) {
    detail.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    return;
  }

  detail.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  if (detail.dataset.loaded === 'true') return;

  const libraryId = btn.dataset.fa;
  const facilityBox = document.createElement('div');
  const loading = document.createElement('p');
  loading.className = 'lib-detail-note';
  loading.textContent = '館情報を取得中…';
  facilityBox.appendChild(loading);
  detail.replaceChildren(renderLibraryHoldings(libraryId), facilityBox);

  const result = await requestFacility(libraryId);
  renderFacility(facilityBox, libraryId, result);
  if (result.ok) detail.dataset.loaded = 'true';
}

/** 見出し付きのブロック */
function detailBlock(title, className) {
  const block = document.createElement('div');
  block.className = `detail-block ${className || ''}`.trim();
  const h = document.createElement('h5');
  h.className = 'detail-block-title';
  h.textContent = title;
  block.appendChild(h);
  return block;
}

/**
 * その館の、計算対象の各資料の所蔵（年次と所蔵巻号）
 * 末尾の + や年次をそのまま見せ、継続受入の記載が古くないかを確認できるようにする
 * @param {string} libraryId
 * @returns {HTMLElement}
 */
function renderLibraryHoldings(libraryId) {
  const block = detailBlock('所蔵');
  const book = isBookType(currentPageType);

  for (const entry of lastCalc.entries) {
    const holding = hasHoldings(entry) && entry.holdings.find((h) => h.libraryId === libraryId);

    const item = document.createElement('div');
    item.className = 'holding-item';
    const title = document.createElement('p');
    title.className = 'holding-title';
    title.textContent = `${entry.title}［${entryLabel(entry)}］`;
    item.appendChild(title);

    const lines = [];
    for (const record of holding ? holding.records : []) {
      const vols = book ? matchedBookVolumes(record.volumeStrs, entry.targetVolumeLabel) : record.volumeStrs;
      if (vols.length === 0 && !record.years) continue;
      lines.push([record.location, record.years && `[${record.years}]`, vols.join(book ? '、' : ', ')].filter(Boolean).join(' '));
    }
    for (const text of lines) {
      const line = document.createElement('p');
      line.className = 'holding-record';
      line.textContent = text;
      item.appendChild(line);
    }
    if (lines.length === 0) {
      // 旧形式の登録や、巻次の無い図書（単巻本）では所蔵の行が出ない
      const note = document.createElement('p');
      note.className = 'lib-detail-note';
      note.textContent = !holding ? '（旧形式の登録のため所蔵巻号はありません）'
                       : book ? '（巻次の記載なし）' : '（所蔵巻号の記載なし）';
      item.appendChild(note);
    }
    block.appendChild(item);
  }
  return block;
}

/**
 * 館情報の表に固定の順で並べる項目（CiNii の「各種コード」のラベル → 表示名）
 * 2項目ずつ横に並ぶので、各種コードの出現順を保ちつつ最後の行が海外ILLになるようにしてある
 * 「料金相殺」は館情報ではなく所蔵館リストの属性（_type_grp）から取る
 */
const FACILITY_CODE_ROWS = [
  ['機関ID', '機関ID'],
  ['略称', '略称'],
  ['CAT参加', 'CAT参加'],
  ['ILL参加', 'ILL参加'],
  ['図書館間現物貸借サービス', '現物貸借'],
  ['図書館間複写サービス', '複写'],
  ['図書館間FAXサービス', 'FAX'],
  ['料金相殺', '料金相殺'],
  ['日米ILL', '日米ILL'],
  ['日韓ILL', '日韓ILL'],
];

/** 表に出さない項目（図書館ID は一覧に出ている） */
const FACILITY_CODE_SKIP = ['図書館ID'];

/** 可否の値に応じた色分け用クラス */
function valueClass(value) {
  if (value === '可' || value === '参加') return 'ok';
  if (value === '不可' || value === '不参加') return 'ng';
  return '';
}

/**
 * dt/dd の組を dl に足す
 * @param {HTMLElement} dl
 * @param {string} label
 * @param {string|Node} value
 * @param {string} [cls] dd に付けるクラス
 */
function appendPair(dl, label, value, cls) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  if (cls) dd.className = cls;
  dd.append(value);
  dl.append(dt, dd);
}

/**
 * テキスト中の URL をリンクにして要素に追加する
 * @param {HTMLElement} el
 * @param {string} text
 * @param {string[]} [links] 本文に出ていない URL（アンカーのテキストが省略されている場合）
 */
function appendLinkified(el, text, links = []) {
  const parts = text.split(/(https?:\/\/[^\s<>"'()（）]+)/);
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      if (part) el.append(part);
      return;
    }
    el.appendChild(externalLink(part));
  });
  for (const href of links) {
    if (text.includes(href)) continue;
    el.append(' ', externalLink(href));
  }
}

function externalLink(href) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = href;
  return a;
}

/**
 * 館情報を描画する
 * @param {HTMLElement} box
 * @param {string} libraryId
 * @param {{ ok: boolean, facility?: object, reason?: string }} result
 */
function renderFacility(box, libraryId, result) {
  box.replaceChildren();

  if (!result.ok) {
    const msg = document.createElement('p');
    msg.className = 'lib-detail-error';
    msg.textContent = FACILITY_ERRORS[result.reason]
      || `館情報を取得できませんでした（${result.reason}）`;
    box.appendChild(msg);

    // 取得できない主な理由は CiNii 以外のタブでポップアップを開いた場合で、
    // URL自体は生きている。CiNii Books の /library/ は2027年3月に消えるため、
    // 終了後も残る CiNii Research 側を案内する（素のHTML断片が開く）
    const fallback = externalLink(`https://cir.nii.ac.jp/api/facility/${libraryId}`);
    fallback.className = 'lib-detail-fallback';
    fallback.textContent = 'CiNii Research の館情報を別タブで開く';
    box.appendChild(fallback);
    return;
  }

  const f = result.facility;

  // ── 各種コード（どの館も同じ項目なので、位置を固定した表にする）
  const codeBlock = detailBlock('館情報');
  // 一覧では長い館名が … で省略されるため、ここで館名全体を出す
  const fullName = document.createElement('p');
  fullName.className = 'facility-name';
  fullName.textContent = lastCalc.libraries.get(libraryId)?.name || f.name;
  codeBlock.appendChild(fullName);
  const codeMap = new Map(f.codes.map((c) => [c.label, c.value]));
  const grp = lastCalc.libraries.get(libraryId)?.grp;
  codeMap.set('料金相殺', grp === 'A' ? '可' : grp === 'N' ? '不可' : '');

  const codeGrid = document.createElement('dl');
  codeGrid.className = 'info-grid';
  for (const [key, label] of FACILITY_CODE_ROWS) {
    const value = codeMap.get(key) || '—';
    appendPair(codeGrid, label, value, valueClass(value));
  }
  // 想定外の項目も落とさず末尾に出す
  const known = new Set([...FACILITY_CODE_ROWS.map(([key]) => key), ...FACILITY_CODE_SKIP]);
  for (const c of f.codes) {
    if (!known.has(c.label)) appendPair(codeGrid, c.label, c.value, valueClass(c.value));
  }
  codeBlock.appendChild(codeGrid);

  const contact = document.createElement('dl');
  contact.className = 'info-contact';
  const address = [f.zip, f.address].filter(Boolean).join(' ');
  if (address) appendPair(contact, '住所', address);
  if (f.tel) appendPair(contact, 'TEL', f.tel);
  if (f.fax) appendPair(contact, 'FAX', f.fax);
  if (contact.childElementCount) codeBlock.appendChild(contact);
  box.appendChild(codeBlock);

  // ── 利用方法（館ごとに書き方が違うので、項目名と内容に分けて並べるだけにする）
  // 利用案内と ILL への振り分けは lib/holdings.js の groupFacilityParagraphs
  for (const group of groupFacilityParagraphs(f.paragraphs)) {
    const block = detailBlock(group.title, group.ill ? 'block-ill' : 'block-visit');
    const dl = document.createElement('dl');
    dl.className = 'info-lines';
    for (const row of group.rows) {
      const dd = document.createElement('dd');
      appendLinkified(dd, row.value, row.links);
      if (row.key) {
        appendPair(dl, row.key, dd);
      } else {
        dd.className = 'full';
        dl.appendChild(dd);
      }
    }
    block.appendChild(dl);
    box.appendChild(block);
  }
}

calcBtn.addEventListener('click', async () => {
  const entries = await getEntries();
  if (entries.length === 0) return;
  await runCalculation(entries);
});

// ─── 全データクリア（表示中のページ種別のみ） ─────────────────────────────────

clearAllBtn.addEventListener('click', async () => {
  const label = PAGE_TYPE_LABELS[currentPageType] || '';
  if (!confirm(`「${label}」の登録済み資料を全て削除しますか？`)) return;

  const collections = await getCollections();
  delete collections[currentPageType];
  await chrome.storage.local.set({ collections });

  excludedIds.clear();
  await renderJournalList();
  resultEl.replaceChildren();
  showStatus(`「${label}」の登録済み資料を全て削除しました`, 'warning');
});
