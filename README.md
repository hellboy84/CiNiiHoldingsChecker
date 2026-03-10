# CiNii Holdings Checker (CiNii所蔵チェッカー)

> **A Chrome / FireFox extension that searches the holdings of multiple journals on CiNii Books (https://ci.nii.ac.jp/books/) and extracts libraries that hold all specified volumes/issues. No data is ever sent to any external server.**

CiNii Books(https://ci.nii.ac.jp/books/) で複数の雑誌の所蔵を検索し、指定した巻号を全て所蔵している図書館を抽出する Chrome / FireFox の拡張機能です。外部サーバーへのデータ送信は一切行いません。

## この拡張機能でできること

- CiNii Books の雑誌詳細ページを開いた状態で、確認したい巻号を指定して所蔵館をコレクションに追加
- 複数の雑誌について繰り返すことで、**全雑誌の指定巻号をすべて所蔵している共通所蔵館**を一覧表示
- 所蔵館の図書館コード（FA番号）のワンクリックコピー
- データはブラウザのローカルストレージに保存（外部への送信なし）

<img width="600" alt="スクリーンショット 2026-03-09 141333" src="https://github.com/user-attachments/assets/4f0de2ab-05f4-4f72-a97b-13a1e10c20a8" />

## 対応ブラウザ

Chrome（Chromium 系ブラウザ全般）/ FireFox
- Windows / macOS どちらでも動作します

## インストール方法(Chrome：持続的)

1. このリポジトリを ZIP でダウンロードして任意の場所に解凍する
2. Chrome のアドレスバーに `chrome://extensions/` を入力して開く
3. 右上の「**デベロッパーモード**」をオンにする
4. 「**パッケージ化されていない拡張機能を読み込む**」をクリック
5. 解凍したフォルダを選択する
6. メニュー「拡張機能>拡張機能を管理」から有効化する
7. ツールバーにピン留めする

## インストール方法(FireFox：一時的(ブラウザの再起動で消えます))

1. このリポジトリを ZIP でダウンロードする(解凍不要)（または `git clone`）
2. FireFox のアドレスバーに `about:debugging` を入力して開く
3. 画面左側のメニューにある「**このFireFox**」をクリック
4. 「一時的な拡張機能」という項目の下にある 「**一時的なアドオンを読み込む...**」 ボタンをクリック
5. ZIPファイルを選択する(ツールバーに登録される)

## 使い方

1. CiNii Books で雑誌を検索し、雑誌の詳細ページを開く
2. Chrome / FireFox のツールバーの本拡張機能アイコンをクリックしてポップアップを開く
3. 「確認する巻号」に巻号を入力（巻だけでも検索可能）
4. 「**コレクションに追加**」ボタンをクリック
5. 別の雑誌の詳細ページを開いて手順 2〜4 を繰り返す
6. 「**共通所蔵館を計算**」ボタンをクリックすると、全登録雑誌の指定巻号を所蔵している図書館が一覧表示される

### 巻号指定の仕様

| 入力例 | 動作 |
|--------|------|
| 巻：`12`、号：空白 | 12巻を1冊でも所蔵していればヒット |
| 巻：`12`、号：`3` | 12巻3号を所蔵していればヒット |

## ファイル構成

```
CiNiiHoldings_extension/
├── manifest.json   # 拡張機能の設定（Manifest V3）
├── content.js      # CiNii Books ページから所蔵情報を抽出
├── popup.html      # ポップアップ UI
├── popup.js        # 巻号パース・所蔵判定・共通館計算ロジック
└── popup.css       # ポップアップのスタイル
```

## プライバシー / Privacy

詳細は [プライバシーポリシー / Privacy Policy](PRIVACY_POLICY.md) をご覧ください。

## 謝辞

新潟大学の久田拓未様が講演で発表されていたアイデアを参考にして作成させていただきました。  
ご本人ともコンタクトを取らせていただいています。  
非常に役立つアイデアを共有いただきありがとうございます。

## AI利用

この機能の作成はAIによるコーディング支援を受けています。

## ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照してください。





















