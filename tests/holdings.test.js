/**
 * lib/holdings.js のテスト
 * 実行: node tests/holdings.test.js （外部ライブラリ不要）
 * 所蔵巻号の例の多くは CiNii に実在する表記（日本醫師會雜誌 AN00185446 など）
 */
const assert = require('node:assert/strict');
const H = require('../lib/holdings.js');

let failed = 0;
function check(volumeStr, vol, issue, expected) {
  const actual = H.isHeld(volumeStr, vol, issue);
  const label = `${JSON.stringify(volumeStr)} ${vol}巻${issue ?? ''}${issue == null ? '' : '号'}`;
  if (actual === expected) {
    console.log(`  ok   ${label} → ${actual}`);
  } else {
    failed++;
    console.log(`  NG   ${label} → ${actual}（期待値 ${expected}）`);
  }
}

console.log('基本');
check('50-59', 52, 1, true);
check('50-59', 60, null, false);
check('26-161,163,165-221;222(1-5,8-11,13)', 222, 8, true);
check('26-161,163,165-221;222(1-5,8-11,13)', 222, 6, false);
check('26-161,163,165-221;222(1-5,8-11,13)', 164, null, false);
check('50(2-6),51(2-6),52-59', 50, 1, false);
check('50(2-6),51(2-6),52-59', 50, null, true);

console.log('範囲の後ろの括弧は最後の巻だけに掛かる');
check('1-12(1-11,13)', 5, 12, true);
check('1-12(1-11,13)', 12, 12, false);
check('1-12(1-11,13)', 12, 13, true);
check('139-140(1-4,7)', 139, 9, true);
check('139-140(1-4,7)', 140, 5, false);
check('76-155(1-7)+', 100, 11, true);

console.log('巻をまたぐ範囲（括弧はそれぞれ隣の巻に掛かる）');
check('43(1)-44(2)', 44, 5, false);
check('43(1)-44(2)', 44, 2, true);
check('43-44(2)', 43, 5, true);
check('43(3)-45', 43, 1, false);
check('43(3)-45', 44, 1, true);
check('43(1-2)-44', 44, 1, true);
check('43(1-2)-44', 43, 2, true);
check('120(1-7,9-12)-125', 120, 8, false);
check('120(1-7,9-12)-125', 123, 8, true);
check('137(2-12)-138(1-10,12)', 138, 11, false);
check('137(2-12)-138(1-10,12)', 137, 5, true);
check('5(2)-5(6)', 5, 4, true);
check('5(2)-5(6)', 5, 7, false);

console.log('空の括弧（一部所蔵・号は不明）');
check('12()-15(),16-18', 12, null, true);
check('12()-15(),16-18', 12, 3, false);
check('12()-15(),16-18', 13, 3, true);

console.log('末尾 +（継続受入中）は記載の最後の巻号より後も所蔵');
check('21(5-8),22-153+', 160, 1, true);
check('21(5-8),22-153+', 21, 1, false);
check('12(1-3)+', 12, 9, true);
check('12(1-3)+', 13, 1, true);
check('12(1-3)+', 11, null, false);
check('12(9-12),13,14(1-7),15-18,22-153(1-10,12),154,155(1)+', 155, 6, true);
check('12(9-12),13,14(1-7),15-18,22-153(1-10,12),154,155(1)+', 153, 11, false);
check('12(9-12),13,14(1-7),15-18,22-153(1-10,12),154,155(1)+', 19, null, false);

console.log('号範囲の端の省略');
check('127(1-7),128(-12),129(1-6)', 128, 12, true);
check('127(1-7),128(-12),129(1-6)', 128, 13, false);

console.log('数字以外の巻は無視');
check('suppl,1-3', 2, null, true);
check('suppl', 1, null, false);

console.log('図書の巻次');
assert.equal(H.matchesBookVolume(['上巻', '下巻'], '上'), true);
assert.equal(H.matchesBookVolume(['VOL.下'], '上,下'), true);
assert.equal(H.matchesBookVolume([], '上'), false);
assert.equal(H.matchesBookVolume([], ''), true);
assert.deepEqual(H.matchedBookVolumes(['1', '2', '別冊'], '別冊'), ['別冊']);
console.log('  ok');

console.log('地域');
assert.deepEqual(H.regionOf('02'), { region: '東北', pref: '青森', order: 1 });
assert.deepEqual(H.regionOf('__'), { region: 'その他海外', pref: '', order: 11 });
assert.equal(H.regionOf('').region, '地域不明');
assert.deepEqual(
  H.sortLibraries([
    { name: 'い', region: '13' }, { name: 'あ', region: '13' },
    { name: 'う', region: '02' }, { name: 'え', region: '362' }, { name: 'お', region: '' },
  ]).map((l) => l.name),
  ['う', 'あ', 'い', 'え', 'お']);
console.log('  ok');

console.log('館情報の「利用方法」の行の分割');
const split = (t) => H.splitParagraph(t);
assert.deepEqual(split('閲覧受付時間: 平日9:00-22:00'), { key: '閲覧受付時間', value: '平日9:00-22:00' });
assert.deepEqual(split('ILL-Org:Hirosaki University Medical Library'), { key: 'ILL-Org', value: 'Hirosaki University Medical Library' });
// 阪大 生命科学（FA002859）は "ILL:項目:内容" と書く
assert.deepEqual(split('ILL:Staff:Akai, Noriaki'), { key: 'ILL-Staff', value: 'Akai, Noriaki' });
assert.deepEqual(split('ILL:Copy-Charge:PHOTOCOPY::50YEN per sheet'), { key: 'ILL-Copy-Charge', value: 'PHOTOCOPY::50YEN per sheet' });
// 日大医（FA006306）は ":" の前後に空白がある
assert.deepEqual(split('ILL-Org : Nihon University School of Medicine'), { key: 'ILL-Org', value: 'Nihon University School of Medicine' });
// 内容の中の ":" で切らない
assert.deepEqual(split('ILL-Commun1:E-mail:x@y.ac.jp'), { key: 'ILL-Commun1', value: 'E-mail:x@y.ac.jp' });
// 日本語の項目名に ILL が含まれていても ILL 欄ではない
assert.deepEqual(split('ILL受付窓口:管理担当'), { key: 'ILL受付窓口', value: '管理担当' });
// 項目名の無い行・URL だけの行
assert.deepEqual(split('Hirosaki University Medical Library'), { key: '', value: 'Hirosaki University Medical Library' });
assert.deepEqual(split('http://www.ul.hirosaki-u.ac.jp/'), { key: '', value: 'http://www.ul.hirosaki-u.ac.jp/' });
console.log('  ok');

console.log('館情報の「利用方法」の枠への振り分け');
const group = (texts) => H.groupFacilityParagraphs(texts.map((text) => ({ text, links: [] })))
  .map((g) => `${g.title}: ${g.rows.map((r) => r.key || '-').join(',')}`);
// 弘前大 医（FA001357）：日本語が先、ILL が後
assert.deepEqual(group(['Hirosaki University Medical Library', '閲覧受付時間: 平日', 'ILL-Org:Hirosaki', 'ILL-Note:copies']),
  ['利用案内: -,閲覧受付時間', 'ILL: ILL-Org,ILL-Note']);
// 日大医（FA006306）：ILL が先、日本語が後
assert.deepEqual(group(['ILL-Org : Nihon', 'ILL-ZIP : 173-8610', 'URL : https://www.med.nihon-u.ac.jp/', '閲覧受付時間 : 10:00~17:00']),
  ['利用案内: URL,閲覧受付時間', 'ILL: ILL-Org,ILL-ZIP']);
// 阪大 生命科学（FA002859）："ILL:" と "ILL-" が混在
assert.deepEqual(group(['ILL受付窓口:管理担当', 'ILL:Staff:Akai', 'ILL-Org:Life Sciences', 'ILL:Note:copies', '休館日:祝日']),
  ['利用案内: ILL受付窓口,休館日', 'ILL: ILL-Staff,ILL-Org,ILL-Note']);
// 区切り行は利用案内側の見出しになる。行の無い枠は返さない
assert.deepEqual(group(['===== 複写 =====', '複写時間:9:00-16:30']), ['複写: 複写時間']);
assert.deepEqual(group([]), []);
console.log('  ok');

if (failed) {
  console.log(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
