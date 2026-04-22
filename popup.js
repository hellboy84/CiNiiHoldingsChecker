/**
 * CiNii 共通所蔵館チェッカー - Popup Script
 */

// ─── 巻号パース ─────────────────────────────────────────────────────────────

/**
 * カンマ区切りで分割するが，括弧（丸括弧）内のカンマは無視する
 * 例: "1-5,12(1-3,5)+,23+" → ["1-5", "12(1-3,5)+", "23+"]
 * @param {string} str
 * @returns {string[]}
 */
function splitTokens(str) {
  const tokens = [];
  let depth = 0, cur = '';
  for (const ch of str.replace(/\s/g, '')) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
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
  for (const part of str.split(',')) {
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

// ─── DOM 要素 ────────────────────────────────────────────────────────────────

const statusDiv = document.getElementById('status');
const journalTitleEl = document.getElementById('journal-title');
const targetVolumeInput = document.getElementById('target-volume');
const targetIssueInput = document.getElementById('target-issue');
const addBtn = document.getElementById('add-btn');
const journalListEl = document.getElementById('journal-list');
const calcBtn = document.getElementById('calc-btn');
const resultEl = document.getElementById('result');
const clearAllBtn = document.getElementById('clear-all-btn');

// ─── 状態 ────────────────────────────────────────────────────────────────────

/** @type {{ journalTitle: string, journalUrl: string, libraries: Array }|null} */
let currentPageData = null;

/** セッション内で計算から一時除外する journal.id の集合（ポップアップを閉じるとリセット） */
const excludedIds = new Set();

// ─── 初期化 ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentPage();
  await renderJournalList();
});

// ─── 現在ページからデータ取得 ─────────────────────────────────────────────────

async function loadCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      showStatus('CiNii Booksの雑誌詳細ページを開いてください', 'warning');
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });

    const data = await chrome.tabs.sendMessage(tab.id, { action: 'getHoldingsData' });

    if (!data) {
      showStatus('ページからデータを取得できませんでした', 'error');
      return;
    }

    currentPageData = data;
    journalTitleEl.textContent = data.journalTitle;
    showStatus(`${data.libraries.length}館の所蔵情報を検出しました`, 'success');
    addBtn.disabled = false;
  } catch (_e) {
    showStatus('CiNii Booksの雑誌詳細ページを開いてください', 'warning');
  }
}

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}

// ─── コレクションに追加 ───────────────────────────────────────────────────────

addBtn.addEventListener('click', async () => {
  if (!currentPageData) return;

  const targetVolume = parseInt(targetVolumeInput.value, 10);
  if (isNaN(targetVolume) || targetVolume < 1) {
    alert('巻（1以上の整数）を入力してください');
    return;
  }
  const targetIssueRaw = parseInt(targetIssueInput.value, 10);
  const targetIssue = (!isNaN(targetIssueRaw) && targetIssueRaw >= 1) ? targetIssueRaw : null;

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
    libraryMap.get(lib.libraryId).volumeStrs.push(lib.volumeStr);
  }

  // 対象巻・号を所蔵する館を抽出
  const qualifiedLibraries = [];
  for (const libInfo of libraryMap.values()) {
    if (libInfo.volumeStrs.some((vs) => isHeld(vs, targetVolume, targetIssue))) {
      qualifiedLibraries.push({ name: libInfo.name, libraryId: libInfo.libraryId, region: libInfo.region });
    }
  }

  // storage に保存（同一URLかつ同一巻号の場合は上書き、巻号が異なれば別エントリとして追加）
  const { journals = [] } = await chrome.storage.local.get('journals');
  const existingIdx = journals.findIndex(
    (j) => j.url === currentPageData.journalUrl
         && j.targetVolume === targetVolume
         && j.targetIssue === targetIssue
  );

  const volIssueLabel = targetIssue != null
    ? `${targetVolume}巻${targetIssue}号`
    : `${targetVolume}巻`;

  const entry = {
    id: existingIdx >= 0 ? journals[existingIdx].id : Date.now().toString(),
    title: currentPageData.journalTitle,
    url: currentPageData.journalUrl,
    targetVolume,
    targetIssue,
    libraries: qualifiedLibraries,
  };

  if (existingIdx >= 0) {
    journals[existingIdx] = entry;
  } else {
    journals.push(entry);
  }

  await chrome.storage.local.set({ journals });
  await renderJournalList();
  resultEl.replaceChildren();

  const action = existingIdx >= 0 ? '更新' : '追加';
  showStatus(
    `${action}完了：${volIssueLabel}を所蔵している館は ${qualifiedLibraries.length}館です`,
    'success'
  );
});

// ─── 登録済み雑誌リスト描画 ───────────────────────────────────────────────────

function updateCalcBtnState(journals) {
  const activeCount = journals.length - excludedIds.size;
  calcBtn.disabled = (activeCount === 0);
}

async function renderJournalList() {
  const { journals = [] } = await chrome.storage.local.get('journals');

  if (journals.length === 0) {
    journalListEl.replaceChildren();
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-message';
    emptyMsg.textContent = '登録済みの雑誌はありません';
    journalListEl.appendChild(emptyMsg);
    updateCalcBtnState(journals);
    return;
  }

  journalListEl.replaceChildren();

  for (const journal of journals) {
    const item = document.createElement('div');
    item.className = 'journal-item';
    if (excludedIds.has(journal.id)) item.classList.add('excluded');

    const infoDiv = document.createElement('div');
    infoDiv.className = 'journal-info';

    const titleLink = document.createElement('a');
    titleLink.href = journal.url;
    titleLink.target = '_blank';
    titleLink.className = 'journal-title-link';
    titleLink.title = journal.title;
    titleLink.textContent = journal.title;

    const metaSpan = document.createElement('span');
    metaSpan.className = 'journal-meta';
    const issueText = journal.targetIssue != null ? `${journal.targetIssue}号` : '';
    metaSpan.textContent = `${journal.targetVolume}巻${issueText} ／ ${journal.libraries.length}館所蔵`;

    infoDiv.appendChild(titleLink);
    infoDiv.appendChild(metaSpan);

    const excludeCheck = document.createElement('input');
    excludeCheck.type = 'checkbox';
    excludeCheck.className = 'exclude-check';
    excludeCheck.checked = !excludedIds.has(journal.id);
    excludeCheck.title = '計算対象に含める';
    excludeCheck.addEventListener('change', async () => {
      if (excludeCheck.checked) {
        excludedIds.delete(journal.id);
      } else {
        excludedIds.add(journal.id);
      }
      item.classList.toggle('excluded', !excludeCheck.checked);
      updateCalcBtnState(journals);
      await runCalculation(journals);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.dataset.id = journal.id;
    deleteBtn.title = '削除';
    deleteBtn.textContent = '×';

    item.appendChild(infoDiv);
    item.appendChild(excludeCheck);
    item.appendChild(deleteBtn);
    journalListEl.appendChild(item);
  }

  updateCalcBtnState(journals);

  journalListEl.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deleteJournal(btn.getAttribute('data-id'));
    });
  });
}

async function deleteJournal(id) {
  excludedIds.delete(id);
  const { journals = [] } = await chrome.storage.local.get('journals');
  await chrome.storage.local.set({ journals: journals.filter((j) => j.id !== id) });
  await renderJournalList();
  resultEl.replaceChildren();
}

// ─── 共通所蔵館の計算 ─────────────────────────────────────────────────────────

async function runCalculation(journals) {
  const activeJournals = journals.filter((j) => !excludedIds.has(j.id));
  if (activeJournals.length === 0) {
    resultEl.replaceChildren();
    return;
  }

  // 各雑誌の所蔵館IDの集合を作り、積集合を求める
  const librarySets = activeJournals.map((j) => new Set(j.libraries.map((l) => l.libraryId)));
  let commonIds = new Set(librarySets[0]);
  for (let i = 1; i < librarySets.length; i++) {
    for (const id of commonIds) {
      if (!librarySets[i].has(id)) commonIds.delete(id);
    }
  }

  // 館名・地域コードを引く（最初に見つかったエントリを使用）
  const nameMap = new Map();
  const regionMap = new Map();
  for (const journal of activeJournals) {
    for (const lib of journal.libraries) {
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
    noResult.textContent = '全ての雑誌の対象巻号を所蔵している機関はありません';
    resultEl.appendChild(noResult);
    return;
  }

  // result DOM構築
  resultEl.replaceChildren();

  const resultHeader = document.createElement('div');
  resultHeader.className = 'result-header';

  const conditionP = document.createElement('p');
  conditionP.className = 'result-condition';
  conditionP.textContent = '対象雑誌：';
  resultHeader.appendChild(conditionP);

  const conditionList = document.createElement('ul');
  conditionList.className = 'condition-list';
  for (const j of activeJournals) {
    const label = j.targetIssue != null
      ? `${j.targetVolume}巻${j.targetIssue}号`
      : `${j.targetVolume}巻`;
    const li = document.createElement('li');
    li.textContent = `${j.title}（${label}）`;
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
  const { journals = [] } = await chrome.storage.local.get('journals');
  if (journals.length === 0) return;
  await runCalculation(journals);
});

// ─── 全データクリア ───────────────────────────────────────────────────────────

clearAllBtn.addEventListener('click', async () => {
  if (!confirm('登録済みの全データを削除しますか？')) return;
  await chrome.storage.local.remove('journals');
  excludedIds.clear();
  await renderJournalList();
  resultEl.replaceChildren();
  showStatus('全データをクリアしました', 'warning');
});
