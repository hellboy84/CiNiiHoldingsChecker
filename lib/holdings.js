/**
 * CiNii 共通所蔵館チェッカー - 所蔵判定ロジック
 * 所蔵巻号（巻次）の解釈・照合、地域の対応表、館情報の「利用方法」の振り分けをまとめる。
 * DOM に依存しないため、popup からは <script> で、テストからは node の require で読み込む。
 */

// ─── 雑誌の所蔵巻号 ─────────────────────────────────────────────────────────
//
// CiNii の所蔵巻号（hlv）の例：
//   "26-161,163,165-221;222(1-5,8-11,13)"   区切りは "," と ";"
//   "139-140(1-4,7)"          括弧は直前の巻（140）だけに掛かる。139 は全号所蔵
//   "137(2-12)-138(1-10,12)"  括弧はそれぞれ隣の巻に掛かる。間の巻があれば全号所蔵
//   "12()-15()"               空の括弧は「一部所蔵・号は不明」
//   "22-153+"                 末尾の + は継続受入中。記載の最後の巻号より後も所蔵とみなす

/**
 * カンマ・セミコロン区切りで分割するが，括弧（丸括弧）内の区切り文字は無視する
 * 例: "1-5,12(1-3,5),23" → ["1-5", "12(1-3,5)", "23"]
 * @param {string} str
 * @returns {string[]}
 */
function splitTokens(str) {
  const tokens = [];
  let depth = 0, cur = '';
  for (const ch of str) {
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
 * 号の並び（"1-3,5,7-10"）を範囲配列にパースする。数字以外（"suppl" など）は無視する
 * 端が省略された "-12"（実在する）は 1-12 として扱う
 * @param {string} str
 * @returns {{ start: number, end: number }[]}
 */
function parseRanges(str) {
  const ranges = [];
  for (const part of str.split(/[,;]/)) {
    const m = part.match(/^(\d*)(-?)(\d*)$/);
    if (!m || (!m[1] && !m[3])) continue;
    const s = m[1] ? parseInt(m[1], 10) : 1;
    const e = !m[2] ? s : m[3] ? parseInt(m[3], 10) : Infinity;
    ranges.push({ start: Math.min(s, e), end: Math.max(s, e) });
  }
  return ranges;
}

/** 値が範囲配列に含まれるか */
function inRanges(ranges, n) {
  return ranges.some((r) => n >= r.start && n <= r.end);
}

/** 1区切り分：「巻」「巻(号)」「巻(号)-巻(号)」（括弧はどちらも省略可） */
const HOLDING_TOKEN_RE = /^(\d+)(?:\(([^()]*)\))?(?:-(\d+)(?:\(([^()]*)\))?)?$/;

/**
 * 所蔵巻号文字列を巻の範囲ごとの所蔵に分解する
 * issues が null の範囲は全号所蔵、[] は一部所蔵（号は不明）
 * @param {string} volumeStr CiNii の ll-volume.hlv テキスト
 * @returns {{ entries: { start: number, end: number, issues: {start:number,end:number}[]|null }[], open: boolean }}
 */
function parseHoldings(volumeStr) {
  let str = (volumeStr || '').normalize('NFKC').replace(/\s/g, '');
  const open = str.endsWith('+');
  // + は末尾にだけ付く想定だが、念のため途中のものも取り除く
  str = str.replace(/\+/g, '');

  const issuesOf = (paren) => (paren === undefined ? null : parseRanges(paren));
  const entries = [];
  for (const token of splitTokens(str)) {
    const m = token.match(HOLDING_TOKEN_RE);
    // 巻が数字でない表記（"suppl" など）は照合できないので無視する
    if (!m) continue;

    const a = parseInt(m[1], 10);
    if (m[3] === undefined) {
      entries.push({ start: a, end: a, issues: issuesOf(m[2]) });
      continue;
    }

    const b = parseInt(m[3], 10);
    if (b < a) continue;
    if (a === b) {
      // "5(2)-5(6)" のように同じ巻の中で号をまたぐ範囲 → 5(2-6)
      const from = issuesOf(m[2]), to = issuesOf(m[4]);
      const issues = !from && !to ? null : [{
        start: from && from.length ? Math.min(...from.map((r) => r.start)) : 1,
        end: to && to.length ? Math.max(...to.map((r) => r.end)) : Infinity,
      }];
      entries.push({ start: a, end: a, issues });
      continue;
    }
    // 括弧は隣の巻だけに掛かり、間の巻は全号所蔵
    entries.push({ start: a, end: a, issues: issuesOf(m[2]) });
    if (b - a > 1) entries.push({ start: a + 1, end: b - 1, issues: null });
    entries.push({ start: b, end: b, issues: issuesOf(m[4]) });
  }
  return { entries, open };
}

/**
 * 所蔵巻号文字列に (targetVol, targetIssue) が含まれるか判定する
 * @param {string} volumeStr     CiNii の ll-volume.hlv テキスト
 * @param {number} targetVol     検索する巻
 * @param {number|null} targetIssue 検索する号（null なら巻のみで照合）
 * @returns {boolean}
 */
function isHeld(volumeStr, targetVol, targetIssue) {
  const { entries, open } = parseHoldings(volumeStr);

  for (const e of entries) {
    if (targetVol < e.start || targetVol > e.end) continue;
    if (targetIssue === null) return true;          // 号不問 → 一部所蔵でも YES
    if (e.issues === null) return true;             // 当該巻は全号所蔵
    if (inRanges(e.issues, targetIssue)) return true;
  }

  // 継続受入中（末尾 +）：記載の最後の巻号より後ろは所蔵とみなす
  if (open && entries.length > 0) {
    const last = entries[entries.length - 1];
    if (targetVol > last.end) return true;
    if (targetVol === last.end && targetIssue !== null && last.issues && last.issues.length > 0) {
      const maxIssue = Math.max(...last.issues.map((r) => r.end));
      if (targetIssue > maxIssue) return true;
    }
  }
  return false;
}

// ─── 図書の巻次 ─────────────────────────────────────────────────────────────

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
 * 図書の巻次のうち、入力に部分一致するものを返す（複数指定した場合は OR 条件）
 * 同一書誌でも館によって "上" / "上巻" / "VOL.下" のように表記が揺れるため部分一致とする
 * @param {string[]} volumeStrs 館が持つ巻次の一覧
 * @param {string} target       入力された巻次（空文字なら巻次不問／カンマ区切りで複数可）
 * @returns {string[]}
 */
function matchedBookVolumes(volumeStrs, target) {
  const targets = splitVolumeTargets(target).map(normalizeVol);
  if (targets.length === 0) return volumeStrs;
  return volumeStrs.filter((v) => {
    const n = normalizeVol(v);
    return targets.some((t) => n.includes(t));
  });
}

/**
 * 図書の巻次を照合する
 * @param {string[]} volumeStrs
 * @param {string} target
 * @returns {boolean}
 */
function matchesBookVolume(volumeStrs, target) {
  if (splitVolumeTargets(target).length === 0) return true; // 未入力 → その書誌の全巻次を所蔵とみなす
  return matchedBookVolumes(volumeStrs, target).length > 0;   // 巻次情報を持たない館は除外
}

/** 同一条件の判定に使うキー（順番や区切り記号の違いを吸収する） */
function volumeTargetKey(target) {
  return splitVolumeTargets(target).map(normalizeVol).sort().join(',');
}

/** 表示用の巻次ラベル */
function volumeTargetLabel(target) {
  const targets = splitVolumeTargets(target);
  return targets.length === 0 ? '巻次指定なし' : targets.join('・');
}

// ─── 条件に合う館の抽出 ─────────────────────────────────────────────────────

/**
 * 1館分の所蔵が条件を満たすか
 * @param {{ records: { volumeStrs: string[] }[] }} holding
 * @param {{ book: boolean, targetVolume: number|null, targetIssue: number|null, targetVolumeLabel: string }} cond
 * @returns {boolean}
 */
function holdingMatches(holding, cond) {
  const volumeStrs = holding.records.flatMap((r) => r.volumeStrs);
  return cond.book
    ? matchesBookVolume(volumeStrs, cond.targetVolumeLabel)
    : volumeStrs.some((vs) => isHeld(vs, cond.targetVolume, cond.targetIssue));
}

/**
 * ページの館一覧（同じ館が複数行に分かれていることがある）を館ごとにまとめる
 * @param {{ libraryId: string, name: string, region: string, grp?: string, years?: string, location?: string, volumeStrs: string[] }[]} libraries
 * @returns {{ libraryId: string, name: string, region: string, grp: string, records: { years: string, location: string, volumeStrs: string[] }[] }[]}
 */
function groupHoldings(libraries) {
  const map = new Map();
  for (const lib of libraries) {
    if (!map.has(lib.libraryId)) {
      map.set(lib.libraryId, {
        libraryId: lib.libraryId,
        name: lib.name,
        region: lib.region || '',
        grp: lib.grp || '',
        records: [],
      });
    }
    map.get(lib.libraryId).records.push({ years: lib.years || '', location: lib.location || '', volumeStrs: lib.volumeStrs || [] });
  }
  return [...map.values()];
}

// ─── 地域 ───────────────────────────────────────────────────────────────────
//
// 所蔵館リストの _kc 属性は CiNii の地域コード。
// 対応表は CiNii Books の地域選択（select#sopt17）の選択肢と同じにしてある。

const REGIONS = [
  { name: '北海道', codes: ['01'] },
  { name: '東北', codes: ['02', '03', '04', '05', '06', '07'] },
  { name: '関東', codes: ['08', '09', '10', '11', '12', '13', '14'] },
  { name: '北陸・甲信越', codes: ['15', '16', '17', '18', '19', '20'] },
  { name: '東海', codes: ['21', '22', '23', '24'] },
  { name: '関西', codes: ['25', '26', '27', '28', '29', '30'] },
  { name: '中国・四国', codes: ['31', '32', '33', '34', '35', '36', '37', '38', '39'] },
  { name: '九州・沖縄', codes: ['40', '41', '42', '43', '44', '45', '46', '47'] },
  { name: 'アジア', codes: ['151', '152', '153'] },
  { name: 'ヨーロッパ', codes: ['254', '255', '256', '257', '258', '259', '260', '261'] },
  { name: '北米', codes: ['362'] },
  { name: 'その他海外', codes: ['__'] },
];

const PREFECTURES = {
  '01': '北海道', '02': '青森', '03': '岩手', '04': '宮城', '05': '秋田', '06': '山形', '07': '福島',
  '08': '茨城', '09': '栃木', '10': '群馬', '11': '埼玉', '12': '千葉', '13': '東京', '14': '神奈川',
  '15': '新潟', '16': '富山', '17': '石川', '18': '福井', '19': '山梨', '20': '長野',
  '21': '岐阜', '22': '静岡', '23': '愛知', '24': '三重',
  '25': '滋賀', '26': '京都', '27': '大阪', '28': '兵庫', '29': '奈良', '30': '和歌山',
  '31': '鳥取', '32': '島根', '33': '岡山', '34': '広島', '35': '山口',
  '36': '徳島', '37': '香川', '38': '愛媛', '39': '高知',
  '40': '福岡', '41': '佐賀', '42': '長崎', '43': '熊本', '44': '大分', '45': '宮崎', '46': '鹿児島', '47': '沖縄',
  '151': '韓国', '152': '中国', '153': 'タイ',
  '254': 'イギリス', '255': 'ドイツ', '256': 'スイス', '257': 'フランス',
  '258': 'ベルギー', '259': 'オランダ', '260': 'スウェーデン', '261': 'ノルウェー',
  '362': 'アメリカ',
};

/**
 * 地域コードから地域名・都道府県（国）名と並び順を引く
 * @param {string} code _kc 属性の値
 * @returns {{ region: string, pref: string, order: number }}
 */
function regionOf(code) {
  const c = (code || '').trim();
  const idx = REGIONS.findIndex((r) => r.codes.includes(c));
  if (idx < 0) return { region: '地域不明', pref: '', order: REGIONS.length };
  return { region: REGIONS[idx].name, pref: PREFECTURES[c] || '', order: idx };
}

/**
 * 館の一覧を「地域 > 都道府県 > 館名」の順に並べ替える
 * @param {{ name: string, region: string }[]} libraries
 * @returns {Array} 並べ替えた新しい配列
 */
function sortLibraries(libraries) {
  const codeNum = (c) => (/^\d+$/.test(c || '') ? parseInt(c, 10) : Infinity);
  return [...libraries].sort((a, b) =>
    regionOf(a.region).order - regionOf(b.region).order
    || codeNum(a.region) - codeNum(b.region)
    || a.name.localeCompare(b.name, 'ja'));
}

// ─── 館情報の「利用方法」 ────────────────────────────────────────────────────
//
// 館が自由に書く日本語の案内と、NACSIS の英語の ILL 欄（"ILL-Org:…" など）が混ざっている。
// ILL 欄が先に来る館（日大医）や、"ILL:Staff:…" と書く館（阪大 生命科学）もある。

/**
 * 「利用方法」の1行を項目名と内容に分ける（"閲覧受付時間: 平日9:00-…" など）
 * 項目名の無い行（英語の館名・住所など）は key を空にする
 * @param {string} text
 * @returns {{ key: string, value: string }}
 */
function splitParagraph(text) {
  // ILL 欄は "ILL-Org:…" と "ILL:Staff:…" の2通りの書き方があるので、項目名を "ILL-Org" の形にそろえる
  const ill = text.match(/^ILL\s*[-:]\s*([^:：]+?)\s*[:：]\s*(.*)$/i);
  if (ill) return { key: `ILL-${ill[1]}`, value: ill[2] };

  const m = text.match(/^([^:：]{1,24}?)\s*[:：]\s*(.*)$/);
  // "http://…" の ":" で切ってしまわないようにする
  if (!m || /https?$/i.test(m[1])) return { key: '', value: text };
  return { key: m[1], value: m[2] };
}

/**
 * 「利用方法」の行を「利用案内」と「ILL」の枠に振り分ける
 * 出てくる順番によらず1行ずつ判定し、枠の中では元の順番を保つ
 * 「===== 複写 =====」のような区切り行は、利用案内側の新しい枠の見出しにする
 * @param {{ text: string, links: string[] }[]} paragraphs
 * @returns {{ title: string, ill: boolean, rows: { key: string, value: string, links: string[] }[] }[]}
 *          行の無い枠は含めない
 */
function groupFacilityParagraphs(paragraphs) {
  const visitGroups = [{ title: '利用案内', ill: false, rows: [] }];
  const illGroup = { title: 'ILL', ill: true, rows: [] };
  for (const para of paragraphs) {
    const headingMatch = para.text.match(/^=+\s*(.+?)\s*=+$/);
    if (headingMatch) {
      visitGroups.push({ title: headingMatch[1], ill: false, rows: [] });
      continue;
    }
    const row = { ...splitParagraph(para.text), links: para.links || [] };
    const group = /^ILL-/i.test(row.key) ? illGroup : visitGroups[visitGroups.length - 1];
    group.rows.push(row);
  }
  return [...visitGroups, illGroup].filter((g) => g.rows.length > 0);
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    splitTokens, parseRanges, parseHoldings, isHeld,
    normalizeVol, splitVolumeTargets, matchedBookVolumes, matchesBookVolume,
    volumeTargetKey, volumeTargetLabel,
    holdingMatches, groupHoldings,
    regionOf, sortLibraries,
    splitParagraph, groupFacilityParagraphs,
  };
}
