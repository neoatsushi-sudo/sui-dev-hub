# Sui Dev Hub - CLAUDE.md

Sui ブロックチェーン上の分散型テクニカルコンテンツプラットフォーム（Mirror.xyz の Sui 版）。

## プロジェクト構成

```
sui-content-platform/
├── contracts/          # Sui Move スマートコントラクト
│   ├── sources/        # Move ソースコード
│   │   ├── platform.move
│   │   └── contracts.move
│   └── Move.toml
└── web/                # Next.js フロントエンド
    ├── app/            # App Router ページ
    ├── components/     # UI コンポーネント
    ├── context/        # React Context
    └── lib/            # ユーティリティ
```

## テックスタック

- **スマートコントラクト**: Sui Move (edition 2024)
- **フロントエンド**: Next.js 16, TypeScript, Tailwind CSS
- **ウォレット**: @mysten/dapp-kit
- **ネットワーク**: Sui Testnet

## デプロイ情報

- **Package ID (Testnet)**: `0x2a0120c049a8642953d7adc0d841bc91917e3e42b6029b73d250f3a0194a8b06`
- **ライブデモ**: https://sui-dev-hub-tau.vercel.app

## 自律動作ルール

以下は確認なしで進めてよい：
- ファイルの読み込み・調査・分析
- コードの実装・編集
- ローカルビルド・テスト実行 (`sui move test`, `npm run build` など)
- エラーの調査と修正

以下は必ず確認する：
- `sui client publish` (コントラクトのデプロイ)
- `git push` / PR 作成
- 外部APIへの書き込み操作

## 開発方針

- エラーが出たら自分で原因を調査して修正する
- 実装が終わったらビルドを走らせて動作確認する
- 問題が解決したら結果を報告する
- コメントは日本語でOK

## ロードマップ（未実装）

- [ ] Walrus 統合（分散型コンテンツストレージ）
- [ ] Sponsored transactions（ガスレスUX）
- [ ] オンチェーンプロフィール
- [ ] タグ・カテゴリシステム
- [ ] コメントシステム
