# CiNii Holdings Checker (CiNii 共通所蔵館チェッカー)

> A Chrome / FireFox extension that searches the holdings of multiple journals or books on CiNii Books (https://ci.nii.ac.jp/books/) and CiNii Research (https://cir.nii.ac.jp/) and extracts libraries that hold all specified volumes/issues. 

CiNii Books(https://ci.nii.ac.jp/books/) と CiNii Research(https://cir.nii.ac.jp/) で複数の雑誌・図書の所蔵を検索し、指定した巻号（巻次）を全て所蔵している図書館を抽出する Chrome / Firefox の拡張機能です。公式ストアからインストールできます。→ **[Chrome](https://chromewebstore.google.com/detail/cinii-%E5%85%B1%E9%80%9A%E6%89%80%E8%94%B5%E9%A4%A8%E3%83%81%E3%82%A7%E3%83%83%E3%82%AB%E3%83%BC/mlbdikgehmaimgbmcmlnkhdmkaiogjai?authuser=0&hl=ja) / [Firefox](https://addons.mozilla.org/addon/cinii-%E5%85%B1%E9%80%9A%E6%89%80%E8%94%B5%E9%A4%A8%E3%83%81%E3%82%A7%E3%83%83%E3%82%AB%E3%83%BC/)**

## この拡張機能でできること

- 次の4パターンの詳細ページ上で機能する
  - [CiNii Books](https://ci.nii.ac.jp/books/) の**雑誌**（`https://ci.nii.ac.jp/ncid/A…`）
  - [CiNii Books](https://ci.nii.ac.jp/books/) の**図書**（`https://ci.nii.ac.jp/ncid/B…`）
  - [CiNii Research](https://cir.nii.ac.jp/) の**雑誌**（`https://cir.nii.ac.jp/crid/…/holdings`）
  - [CiNii Research](https://cir.nii.ac.jp/) の**図書**（同上）
- **複数の雑誌・図書の指定した巻号（巻次）をすべて所蔵している所蔵館**を一覧で表示する
- 所蔵館の図書館コード(FA番号)をワンクリックでコピーできる
- 登録済み資料は**上記の4パターンごとに独立して保存**される（雑誌の作業中に図書を登録しても互いに影響しない）

#### バージョンアップの修正箇所

- 使用権限をHost Permissionsから，activeTabとscriptingに変更した( [v1.1](https://github.com/hellboy84/CiNiiHoldingsChecker/releases/tag/v1.1) )
- 館一覧のソート順を「地域>館名」に変更した( [v1.2](https://github.com/hellboy84/CiNiiHoldingsChecker/releases/tag/v1.2) )
- 登録した雑誌の組み合わせを変更できるチェックボックスを用意した( [v1.3](https://github.com/hellboy84/CiNiiHoldingsChecker/releases/tag/v1.3) )
- CiNii Books の図書、CiNii Research の雑誌・図書に対応した（v2.0）
- 所蔵巻号の区切り文字 `;` を解釈できていなかった不具合を修正した（v2.0）
  - `26-161,163,165-221;222(1-5,8-11,13)` のような表記で、`;` の前後が正しく分離されず所蔵館を取りこぼしていました
- 同じ書誌が `?l=ja` の有無で二重登録される不具合を修正した（v2.0）

<img width="600" alt="スクリーンショット 2026-03-09 141333" src="https://github.com/user-attachments/assets/4f0de2ab-05f4-4f72-a97b-13a1e10c20a8" />

画像はv1.2

## 対応ブラウザ

- Chrome / Firefox
  - Windows / macOS どちらでも動作します
  - Linux でも動作すると思います(Ubuntu 24.04 LTS 検証済)

## 公式ストア版のインストール方法
- [Firefox版の公式の拡張機能ストアからインストールできるようになりました](https://addons.mozilla.org/addon/cinii-%E5%85%B1%E9%80%9A%E6%89%80%E8%94%B5%E9%A4%A8%E3%83%81%E3%82%A7%E3%83%83%E3%82%AB%E3%83%BC/) (2026/03/13)
- [Chrome版の公式の拡張機能ストアからインストールできるようになりました](https://chromewebstore.google.com/detail/cinii-%E5%85%B1%E9%80%9A%E6%89%80%E8%94%B5%E9%A4%A8%E3%83%81%E3%82%A7%E3%83%83%E3%82%AB%E3%83%BC/mlbdikgehmaimgbmcmlnkhdmkaiogjai?authuser=0&hl=ja) (2026/03/14)
 
## GitHub版のインストール方法
ストア版と基本的に同一のものですが、ストアの審査通過などのタイミングの関係で、GitHub版の方がストア版より先行して機能実装されている場合があります。

### Chrome：持続的
1. このリポジトリを ZIP でダウンロードして任意の場所に解凍する
2. Chrome のアドレスバーに `chrome://extensions/` を入力して開く
3. 右上の「**デベロッパーモード**」をオンにする
4. 「**パッケージ化されていない拡張機能を読み込む**」をクリック
5. 解凍したフォルダを選択する
6. メニュー「拡張機能>拡張機能を管理」から有効化する
7. ツールバーにピン留めする
### FireFox：一時的(ブラウザの再起動で消えます)
1. このリポジトリを ZIP でダウンロードする(解凍不要)（または `git clone`）
2. FireFox のアドレスバーに `about:debugging` を入力して開く
3. 画面左側のメニューにある「**このFireFox**」をクリック
4. 「一時的な拡張機能」という項目の中にある 「**一時的なアドオンを読み込む...**」 ボタンをクリック
5. ZIPファイルを選択する(ツールバーに登録される)

## 使い方

1. CiNii Books または CiNii Research で資料を検索し、詳細ページを開く
   - CiNii Research では**「所蔵」タブ**（URL 末尾が `/holdings`）を開いてください。書誌ページには所蔵情報がありません
2. Chrome / FireFox のツールバーの本拡張機能アイコンをクリックしてポップアップを開く
   - 「現在のページ：CiNii Books - 雑誌」のように、どのパターンで動作中かが表示されます
3. 雑誌なら「確認する巻号」に巻号を、図書なら「確認する巻次」に巻次を入力する
4. 「**コレクションに追加**」ボタンをクリック
5. 別の資料の詳細ページを開いて手順 2〜4 を繰り返す
6. 「**共通所蔵館を計算**」ボタンをクリックすると、全登録資料の指定巻号（巻次）を所蔵している図書館が一覧表示される(地域>館名順のソート)
7. 「登録済み資料」の各資料のチェックボックスのチェックを外すと検索対象から一時的に除外できる (xは削除)
8. 「全データをクリア」は**表示中のパターンの登録データのみ**を削除します

<img width="423" alt="スクリーンショット 2026-04-23" src="https://github.com/user-attachments/assets/d858b6b9-9d52-439f-8095-51c3d217bb53" />

### 巻号指定の仕様（雑誌）

| 入力例 | 動作 |
|--------|------|
| 巻：`12`、号：空白 | 12巻を1冊でも所蔵していればヒット |
| 巻：`12`、号：`3` | 12巻3号を所蔵していればヒット |

### 巻次指定の仕様（図書）

| 入力例 | 動作 |
|--------|------|
| 空白 | その書誌の全巻次を所蔵しているものとして扱う（所蔵館すべてがヒット） |
| `上` | 巻次に「上」を含む館がヒット（`上` / `上巻` の両方にヒット） |
| `1972` | 巻次に「1972」を含む館がヒット（`1972年版` / `1972年版(Vol.14)` の両方にヒット） |

- 図書の巻次は**部分一致**で照合します。CiNii の巻次表記は同じ書誌でも館によって `上` / `上巻` / `VOL.下`、`1972年版` / `1972年版(Vol.14)` のように揺れるためです
- 巻次を入力した場合、**巻次の情報を持たない館は対象外**になります（単巻本などで巻次が登録されていない書誌は、巻次を空白にして使ってください）
- 入力欄をクリックすると、**そのページに実在する巻次**が入力候補として表示されます

## ファイル構成

```
CiNiiHoldingsChecker/
├── manifest.json   # 拡張機能の設定（Manifest V3）
├── content.js      # ページ種別の判定と、CiNii Books / CiNii Research からの所蔵情報の抽出
├── popup.html      # ポップアップ UI
├── popup.js        # 巻号・巻次パース・所蔵判定・共通館計算ロジック
└── popup.css       # ポップアップのスタイル
```

## 既知の制限

- 共通所蔵館の館名リンクは `https://ci.nii.ac.jp/library/…` を指しています。CiNii Books は2027年3月にサービス終了予定のため、終了後はこのリンクが利用できなくなります（FA番号のコピー機能は影響を受けません）
- 共通所蔵の計算は同じパターン内でのみ行います（CiNii Books の雑誌と CiNii Research の図書を横断した計算はできません）

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


















