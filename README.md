# CiNii Holdings Checker (CiNii 共通所蔵館チェッカー)

> A Chrome / FireFox extension that searches the holdings of multiple journals or books on CiNii Books (https://ci.nii.ac.jp/books/) and CiNii Research (https://cir.nii.ac.jp/) and extracts libraries that hold all specified volumes/issues. 

CiNii Books(https://ci.nii.ac.jp/books/) と CiNii Research(https://cir.nii.ac.jp/) で複数の雑誌・図書の所蔵を検索し，指定した巻号（巻次）を全て所蔵している図書館を抽出する Chrome / Firefox の拡張機能です。公式ストアからインストールできます。→ **[Chrome](https://chromewebstore.google.com/detail/cinii-%E5%85%B1%E9%80%9A%E6%89%80%E8%94%B5%E9%A4%A8%E3%83%81%E3%82%A7%E3%83%83%E3%82%AB%E3%83%BC/mlbdikgehmaimgbmcmlnkhdmkaiogjai?authuser=0&hl=ja) / [Firefox](https://addons.mozilla.org/addon/cinii-%E5%85%B1%E9%80%9A%E6%89%80%E8%94%B5%E9%A4%A8%E3%83%81%E3%82%A7%E3%83%83%E3%82%AB%E3%83%BC/)**

## この拡張機能でできること

- 以下の4種類のページ上で機能する
  - [CiNii Books](https://ci.nii.ac.jp/books/) の**雑誌の詳細ページ**（`https://ci.nii.ac.jp/ncid/A…`）
  - [CiNii Books](https://ci.nii.ac.jp/books/) の**図書の詳細ページ**（`https://ci.nii.ac.jp/ncid/B…`）
  - [CiNii Research](https://cir.nii.ac.jp/) の**雑誌の所蔵館情報タブ**（`https://cir.nii.ac.jp/crid/…/holdings`）
  - [CiNii Research](https://cir.nii.ac.jp/) の**図書の所蔵館情報タブ**（`https://cir.nii.ac.jp/crid/…/holdings`）
- **複数の雑誌・図書の指定した巻号（巻次）をすべて所蔵している所蔵館**を一覧で表示する
- 所蔵館の図書館コード(FA番号)をワンクリックでコピーできる
- 一覧の館名をクリックすると，その館の**館情報**（ILL の複写・貸借の受付可否，複写料金，決済・送付方法，開館時間など）をポップアップ内に展開表示する
- 所蔵館検索は**上記の4種類ごとに独立**している（雑誌の作業中に図書の作業をしてもお互いに影響しない）

#### バージョンアップの修正箇所

- 使用権限をHost Permissionsから，activeTabとscriptingに変更した( [v1.1](https://github.com/hellboy84/CiNiiHoldingsChecker/releases/tag/v1.1) )
- 館一覧のソート順を「地域>館名」に変更した( [v1.2](https://github.com/hellboy84/CiNiiHoldingsChecker/releases/tag/v1.2) )
- 登録した雑誌の組み合わせを変更できるチェックボックスを用意した( [v1.3](https://github.com/hellboy84/CiNiiHoldingsChecker/releases/tag/v1.3) )
- CiNii Books の図書，CiNii Research の雑誌・図書に対応した（[v2.0](https://github.com/hellboy84/CiNiiHoldingsChecker/releases/tag/v2.0)）
- 所蔵巻号の区切り文字 `;` を解釈できていなかった不具合を修正した（[v2.0](https://github.com/hellboy84/CiNiiHoldingsChecker/releases/tag/v2.0)）
  - 例：`26-161,163,165-221;222(1-5,8-11,13)`のような表記
- 館名クリックで館情報をポップアップ内に表示するようにした（[v2.1](https://github.com/hellboy84/CiNiiHoldingsChecker/releases/tag/v2.1)）
  - CiNii Books の `https://ci.nii.ac.jp/library/…` へのリンクを廃止し，CiNii Booksのサービス終了後も館情報を参照できるように

<img width="600" alt="スクリーンショット 2026-03-09 141333" src="https://github.com/user-attachments/assets/4f0de2ab-05f4-4f72-a97b-13a1e10c20a8" />

画像はv1.2

## 対応ブラウザ

- Chrome / Firefox

## 公式ストア版のインストール方法
- [Firefox版の公式の拡張機能ストアからインストールできるようになりました](https://addons.mozilla.org/addon/cinii-%E5%85%B1%E9%80%9A%E6%89%80%E8%94%B5%E9%A4%A8%E3%83%81%E3%82%A7%E3%83%83%E3%82%AB%E3%83%BC/) (2026/03/13)
- [Chrome版の公式の拡張機能ストアからインストールできるようになりました](https://chromewebstore.google.com/detail/cinii-%E5%85%B1%E9%80%9A%E6%89%80%E8%94%B5%E9%A4%A8%E3%83%81%E3%82%A7%E3%83%83%E3%82%AB%E3%83%BC/mlbdikgehmaimgbmcmlnkhdmkaiogjai?authuser=0&hl=ja) (2026/03/14)
 
## GitHub版のインストール方法
ストア版と基本的に同一のものですが，ストアの審査通過などのタイミングの関係で，GitHub版の方がストア版より先行して機能実装されている場合があります。

### Chrome：持続的
1. このリポジトリを ZIP でダウンロードして任意の場所に解凍する
2. Chrome のアドレスバーに `chrome://extensions/` を入力して開く
3. 右上の「**デベロッパーモード**」をオンにする
4. 「**パッケージ化されていない拡張機能を読み込む**」をクリック
5. 解凍したフォルダを選択する
6. メニュー「拡張機能 > 拡張機能を管理」から有効化する
7. ツールバーにピン留めする
### FireFox：一時的(ブラウザの再起動で消えます)
1. このリポジトリを ZIP でダウンロードする(解凍不要)（または `git clone`）
2. FireFox のアドレスバーに `about:debugging` を入力して開く
3. 画面左側のメニューにある「**このFireFox**」をクリック
4. 「一時的な拡張機能」という項目の中にある 「**一時的なアドオンを読み込む...**」 ボタンをクリック
5. ZIPファイルを選択する(ツールバーに登録される)

## 使い方

1. CiNii Books または CiNii Research で資料を検索し，詳細ページ / 所蔵館タブを開く
2. Chrome / FireFox のツールバーの本拡張機能アイコンをクリックしてポップアップを開く
3. 雑誌→「確認する巻号」に巻号を，図書→「確認する巻次」に巻次を入力する
4. 「**コレクションに追加**」ボタンをクリック
5. 別の資料の詳細ページ / 所蔵館タブ を開いて手順 2〜4 を繰り返す
6. 「**共通所蔵館を計算**」ボタンをクリックすると，全登録資料の指定巻号（巻次）を所蔵している機関が一覧表示される(地域 > 館名順のソート)
7. 「登録済み資料」のチェックを外すと検索対象から一時的に除外できる (xは削除)
8. 「登録済み資料を全て削除」は**表示中の検索種類の登録資料のみ**を削除する（他の検索の登録は残る）

<img width="423" alt="スクリーンショット 2026-04-23" src="https://github.com/user-attachments/assets/d858b6b9-9d52-439f-8095-51c3d217bb53" />

### 雑誌：巻号検索の仕様

| 入力例 | 動作 |
|--------|------|
| 巻：`12`、号：空白 | 12巻中の号をなにかしら所蔵していればヒット |
| 巻：`12`、号：`3` | 12巻3号を所蔵していればヒット |

### 図書：巻次検索の仕様

| 入力例 | 動作 |
|--------|------|
| 空白 | その書誌のなんらかの巻次を所蔵している館がヒット = 所蔵館すべてがヒット |
| `上` | 「上」を含む巻次の所蔵館がヒット（`上` / `上巻` など） |
| `72` | 「72」を含む巻次の所蔵館がヒット（`1972 / 1972年版` / `1972年版(Vol.14)` など） |
| `上,下` | カンマ区切りで複数指定すると，いずれかを含む巻次を所蔵している館がヒット（OR 条件） |

- 図書の巻次検索は，任意の文字列の手入力，もしくは，候補からの選択で可能
  - 巻次候補は紐づいている巻次を全部リアリタイムで切り出して表示している，ので，基本的に全パターンが網羅されているはず（最近追加された巻次はなんらかの更新が必要，とかってことがない）
- 図書の巻次検索の基本動作は**部分一致**
  - 所蔵館で巻次に表記揺れがあるのでそれに対応できるように
  - 過去から続くVol積み系書誌はたまに巻次の九龍城砦みたいになっている
- カンマ（`,` `，` `、`）で区切ると複数の巻次を，部分一致かつ OR 条件で指定できる
- 巻次を入力した場合，**巻次の情報を持たない館は対象外**になる（単巻本などで巻次が登録されていない書誌は，巻次を空白にして使って）
- 候補は連続して入力するとOR 条件として追加される

## ファイル構成

```
CiNiiHoldingsChecker/
├── manifest.json   # 拡張機能の設定（Manifest V3）
├── content.js      # ページ種別の判定と、CiNii Books / CiNii Research からの所蔵情報・館情報の抽出
├── popup.html      # ポップアップ UI
├── popup.js        # 巻号・巻次パース・所蔵判定・共通館計算ロジック
└── popup.css       # ポップアップのスタイル
```

## プライバシー / Privacy

- データはブラウザのローカルストレージに一時的に保存されるだけで外部への送信などは一切行いません。
- 本拡張機能は、個人を特定できる情報を収集・使用・共有しません。
- そのほか詳細は [プライバシーポリシー / Privacy Policy](PRIVACY_POLICY.md) を御覧ください。

## 謝辞

新潟大学の久田拓未様が2026年3月6日に講演で発表されていたアイデアを参考にして作成させていただきました。  
ご本人ともコンタクトを取らせていただいています。  
非常に役立つアイデアを共有いただきありがとうございます。

## AI利用

この機能の作成はAIによるコーディング支援を受けています。

## ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照してください。


















