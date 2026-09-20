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

// ─── 巻号パース ─────────────────────────────────────────────────────────────

/**
 * カンマ・セミコロン区切りで分割するが，括弧（丸括弧）内の区切り文字は無視する
 * 例: "1-5,12(1-3,5)+,23+" → ["1-5", "12(1-3,5)+", "23+"]
 * 例: "165-221;222(1-5)"   → ["165-221", "222(1-5)"]
 * ※ CiNii の所蔵巻号は所蔵の区切りに ";" を使うことがある（Books / Research 双方で実在）
 * @param {string} str
 * @returns {string[]}
 */
function splitTokens(str) {
  const tokens = [];
  let depth = 0, cur = '';
  for (const ch of str.replace(/\s/g, '')) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if ((ch === ',' || ch === ';') && depth === 0) {
      if (cur) tokens.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/**
 * 数値範囲文字列（"1-3,5,7-10,12+" など）を範囲配列にパースする
 * @param {string} str
 * @returns {{ start: number, end: number }[]}
 */
function parseRanges(str) {
  const ranges = [];
  // 括弧の内側に ";" が来た場合の保険として ";" も区切りとして扱う
  for (const part of str.split(/[,;]/)) {
    if (!part) continue;
    const openEnded = part.endsWith('+');
    const base = openEnded ? part.slice(0, -1) : part;
    const dash = base.indexOf('-');
    if (dash > 0) {
      const s = parseInt(base.slice(0, dash), 10);
      const e = parseInt(base.slice(dash + 1), 10);
      if (!isNaN(s) && !isNaN(e)) ranges.push({ start: s, end: openEnded ? Infinity : e });
    } else {
      const n = parseInt(base, 10);
      if (!isNaN(n)) ranges.push({ start: n, end: openEnded ? Infinity : n });
    }
  }
  return ranges;
}

/** 値が範囲配列に含まれるか */
function inRanges(ranges, n) {
  return ranges.some((r) => n >= r.start && n <= r.end);
}

/**
 * 1トークンをパースする
 * - 括弧なし例: "1-5", "12+", "12"  → { volRanges, issueRanges: null }
 * - 括弧あり例: "12(1-3,5)+", "12(3)" → { volRanges, issueRanges }
 *   括弧外の + は「最後の号範囲を開放端にする」として処理する
 * @param {string} token
 * @returns {{ volRanges: {start:number,end:number}[], issueRanges: {start:number,end:number}[]|null }}
 */
function parseToken(token) {
  const parenMatch = token.match(/^([^(]+)\(([^)]+)\)(\+?)$/);
  if (parenMatch) {
    const volRanges = parseRanges(parenMatch[1]);
    const issueRanges = parseRanges(parenMatch[2]);
    if (parenMatch[3] === '+' && issueRanges.length > 0) {
      issueRanges[issueRanges.length - 1].end = Infinity;
    }
    return { volRanges, issueRanges };
  }
  return { volRanges: parseRanges(token), issueRanges: null };
}

/**
 * 所蔵巻号文字列に (targetVol, targetIssue) が含まれるか判定する
 * @param {string} volumeStr   CiNii の ll-volume.hlv テキスト
 * @param {number} targetVol   検索する巻
 * @param {number|null} targetIssue 検索する号（null なら巻のみで照合）
 * @returns {boolean}
 */
function isHeld(volumeStr, targetVol, targetIssue) {
  for (const token of splitTokens(volumeStr)) {
    const { volRanges, issueRanges } = parseToken(token);
    if (!inRanges(volRanges, targetVol)) continue;
    // 巻がマッチした
    if (targetIssue === null) return true;           // 号不問 → YES
    if (issueRanges === null) return true;           // 当該巻は全号所蔵 → YES
    if (inRanges(issueRanges, targetIssue)) return true; // 号もマッチ → YES
  }
  return false;
}

// ─── 巻次パース（図書） ───────────────────────────────────────────────────────

/**
 * 巻次文字列を比較用に正規化する（全半角・大小文字・空白のゆれを吸収）
 * @param {string} s
 * @returns {string}
 */
function normalizeVol(s) {
  return (s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/**
 * 入力された巻次をカンマ区切りで分割する（全角カンマ・読点も区切りとして扱う）
 * 例: "上, 上巻、下巻" → ["上", "上巻", "下巻"]
 * @param {string} target
 * @returns {string[]}
 */
function splitVolumeTargets(target) {
  return (target || '').split(/[,，、]/).map((s) => s.trim()).filter((s) => s);
}

/**
 * 図書の巻次を部分一致で照合する（複数指定した場合は OR 条件）
 * 同一書誌でも館によって "上" / "上巻" / "VOL.下" のように表記が揺れるため部分一致とする
 * @param {string[]} volumeStrs 館が持つ巻次の一覧
 * @param {string} target       入力された巻次（空文字なら巻次不問／カンマ区切りで複数可）
 * @returns {boolean}
 */
function matchesBookVolume(volumeStrs, target) {
  const targets = splitVolumeTargets(target);
  if (targets.length === 0) return true;     // 未入力 → その書誌の全巻次を所蔵とみなす
  if (volumeStrs.length === 0) return false; // 巻次情報を持たない館は除外
  const normalized = volumeStrs.map(normalizeVol);
  return targets.some((t) => {
    const n = normalizeVol(t);
    return normalized.some((v) => v.includes(n));
  });
}

/** 同一条件の判定に使うキー（順番や区切り記号の違いを吸収する） */
function volumeTargetKey(target) {
  return splitVolumeTargets(target).map(normalizeVol).sort().join(',');
}

/** 登録時に確定する表示用の巻次ラベル */
function volumeTargetLabel(target) {
  const targets = splitVolumeTargets(target);
  return targets.length === 0 ? '巻次指定なし' : targets.join('・');
}

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
    journalTitleEl.textContent = data.title;
    fillVolumeOptions(data);
    showStatus(`${data.libraries.length}館の所蔵情報を検出しました`, 'success');
    addBtn.disabled = false;
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
}

/** 図書の場合、そのページに実在する巻次を入力候補として提示する */
function fillVolumeOptions(data) {
  volumeCandidates = [];
  volumeOptionsRenderedBase = null;
  volumeOptionsEl.replaceChildren();
  if (!isBookType(data.pageType)) return;

  const values = new Set();
  for (const lib of data.libraries) {
    for (const v of libVolumeStrs(lib)) values.add(v);
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
});

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

/** 旧形式（volumeStr）の content.js が応答した場合にも対応する */
function libVolumeStrs(lib) {
  if (Array.isArray(lib.volumeStrs)) return lib.volumeStrs;
  return lib.volumeStr ? [lib.volumeStr] : [];
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

  const book = isBookType(currentPageType);

  let targetVolume = null;
  let targetIssue = null;
  let targetVolumeLabel = '';
  let label = '';

  if (book) {
    targetVolumeLabel = targetVolumeInput.value.trim();
    label = volumeTargetLabel(targetVolumeLabel);
  } else {
    targetVolume = parseInt(targetVolumeInput.value, 10);
    if (isNaN(targetVolume) || targetVolume < 1) {
      alert('巻（1以上の整数）を入力してください');
      return;
    }
    const targetIssueRaw = parseInt(targetIssueInput.value, 10);
    targetIssue = (!isNaN(targetIssueRaw) && targetIssueRaw >= 1) ? targetIssueRaw : null;
    label = targetIssue != null ? `${targetVolume}巻${targetIssue}号` : `${targetVolume}巻`;
  }

  // ライブラリIDでグループ化（同館複数エントリに対応）
  const libraryMap = new Map();
  for (const lib of currentPageData.libraries) {
    if (!libraryMap.has(lib.libraryId)) {
      libraryMap.set(lib.libraryId, {
        name: lib.name,
        libraryId: lib.libraryId,
        region: lib.region || '',
        volumeStrs: [],
      });
    }
    libraryMap.get(lib.libraryId).volumeStrs.push(...libVolumeStrs(lib));
  }

  // 対象巻号（巻次）を所蔵する館を抽出
  const qualifiedLibraries = [];
  for (const libInfo of libraryMap.values()) {
    const held = book
      ? matchesBookVolume(libInfo.volumeStrs, targetVolumeLabel)
      : libInfo.volumeStrs.some((vs) => isHeld(vs, targetVolume, targetIssue));
    if (held) {
      qualifiedLibraries.push({
        name: libInfo.name,
        libraryId: libInfo.libraryId,
        region: libInfo.region,
      });
    }
  }

  // storage に保存（同一URLかつ同一巻号（巻次）の場合は上書き、異なれば別エントリとして追加）
  const entries = await getEntries();
  const existingIdx = entries.findIndex((e) => {
    if (e.url !== currentPageData.url) return false;
    return book
      ? volumeTargetKey(e.targetVolumeLabel || '') === volumeTargetKey(targetVolumeLabel)
      : e.targetVolume === targetVolume && e.targetIssue === targetIssue;
  });

  const entry = {
    id: existingIdx >= 0 ? entries[existingIdx].id : Date.now().toString(),
    title: currentPageData.title,
    url: currentPageData.url,
    label,
    targetVolume,
    targetIssue,
    targetVolumeLabel,
    libraries: qualifiedLibraries,
  };

  if (existingIdx >= 0) {
    entries[existingIdx] = entry;
  } else {
    entries.push(entry);
  }

  await setEntries(entries);
  await renderJournalList();
  resultEl.replaceChildren();

  if (book) {
    // 次の巻次を選び直せるよう、選択済みの巻次を空にして候補も戻す
    targetVolumeInput.value = '';
    renderVolumeOptions();
  }

  const action = existingIdx >= 0 ? '更新' : '追加';
  showStatus(
    `${action}完了：${label}を所蔵している館は ${qualifiedLibraries.length}館です`,
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

    const metaSpan = document.createElement('span');
    metaSpan.className = 'journal-meta';
    metaSpan.textContent = `${entryLabel(entry)} ／ ${entry.libraries.length}館所蔵`;

    infoDiv.appendChild(titleLink);
    infoDiv.appendChild(metaSpan);

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

async function deleteEntry(id) {
  excludedIds.delete(id);
  const entries = await getEntries();
  await setEntries(entries.filter((e) => e.id !== id));
  await renderJournalList();
  resultEl.replaceChildren();
}

// ─── 共通所蔵館の計算 ─────────────────────────────────────────────────────────

async function runCalculation(entries) {
  const activeEntries = entries.filter((e) => !excludedIds.has(e.id));
  if (activeEntries.length === 0) {
    resultEl.replaceChildren();
    return;
  }

  // 各資料の所蔵館IDの集合を作り、積集合を求める
  const librarySets = activeEntries.map((e) => new Set(e.libraries.map((l) => l.libraryId)));
  let commonIds = new Set(librarySets[0]);
  for (let i = 1; i < librarySets.length; i++) {
    for (const id of commonIds) {
      if (!librarySets[i].has(id)) commonIds.delete(id);
    }
  }

  // 館名・地域コードを引く（最初に見つかったエントリを使用）
  const nameMap = new Map();
  const regionMap = new Map();
  for (const entry of activeEntries) {
    for (const lib of entry.libraries) {
      if (!nameMap.has(lib.libraryId)) nameMap.set(lib.libraryId, lib.name);
      if (!regionMap.has(lib.libraryId)) regionMap.set(lib.libraryId, lib.region || '');
    }
  }

  const commonLibraries = [...commonIds]
    .map((id) => ({ id, name: nameMap.get(id) || id, region: regionMap.get(id) || '' }))
    .sort((a, b) => {
      const ra = parseInt(a.region, 10);
      const rb = parseInt(b.region, 10);
      const aIsNum = !isNaN(ra);
      const bIsNum = !isNaN(rb);
      if (aIsNum && bIsNum && ra !== rb) return ra - rb;
      if (aIsNum && !bIsNum) return -1;
      if (!aIsNum && bIsNum) return 1;
      return a.name.localeCompare(b.name, 'ja');
    });

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

  const resultHeader = document.createElement('div');
  resultHeader.className = 'result-header';

  const conditionP = document.createElement('p');
  conditionP.className = 'result-condition';
  conditionP.textContent = '対象資料：';
  resultHeader.appendChild(conditionP);

  const conditionList = document.createElement('ul');
  conditionList.className = 'condition-list';
  for (const entry of activeEntries) {
    const li = document.createElement('li');
    li.textContent = `${entry.title}（${entryLabel(entry)}）`;
    conditionList.appendChild(li);
  }
  resultHeader.appendChild(conditionList);
  resultEl.appendChild(resultHeader);

  const heading = document.createElement('h3');
  heading.textContent = `共通所蔵館（${commonLibraries.length}件）`;
  resultEl.appendChild(heading);

  const libList = document.createElement('ul');
  libList.className = 'common-libraries-list';
  for (const lib of commonLibraries) {
    const li = document.createElement('li');

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.dataset.fa = lib.id;
    copyBtn.title = 'FA番号をコピー';
    copyBtn.textContent = 'copy';

    const faSpan = document.createElement('span');
    faSpan.className = 'lib-fa-id';
    faSpan.textContent = lib.id;

    const libLink = document.createElement('a');
    libLink.href = `https://ci.nii.ac.jp/library/${lib.id}`;
    libLink.target = '_blank';
    libLink.textContent = lib.name;

    li.appendChild(copyBtn);
    li.appendChild(faSpan);
    li.appendChild(libLink);
    libList.appendChild(li);
  }
  resultEl.appendChild(libList);

  // copyボタン — イベント委譲
  libList.addEventListener('click', async (e) => {
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
