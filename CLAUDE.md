# Sui Dev Hub - CLAUDE.md

Sui ブロックチェーン上の分散型テクニカルコンテンツプラットフォーム（Mirror.xyz の Sui 版）。

## プロジェクト構成

```
sui-dev-hub/
├── contracts/          # Sui Move スマートコントラクト
│   ├── sources/        # Move ソースコード
│   │   ├── platform.move
│   │   └── contracts.move
│   └── CLAUDE.md       # Move開発ルール
├── web/                # Next.js フロントエンド
│   ├── app/            # App Router ページ
│   ├── components/     # UI コンポーネント
│   ├── context/        # React Context
│   ├── lib/            # ユーティリティ
│   └── CLAUDE.md       # フロントエンド規約
└── .claude/
    └── commands/       # 役割別スラッシュコマンド
```

## テックスタック

- **スマートコントラクト**: Sui Move (edition 2024)
- **フロントエンド**: Next.js 16, TypeScript, Tailwind CSS
- **ウォレット**: @mysten/dapp-kit
- **ネットワーク**: Sui Testnet

## デプロイ情報

- **Package ID v13 (最新)**: `0x0ff874ccde9a069bd6506d71eefb44d420215ce39ae168fa8dbe2364a8a60b1a`
- **Package ID v1 (original)**: `0x2a0120c049a8642953d7adc0d841bc91917e3e42b6029b73d250f3a0194a8b06`
- **RewardPool ID**: `0x6d491f156024ce769f9b1ff878daa6ab84e4795b67132eeb75f701953d02fc42`
- **UpgradeCap ID**: `0xd3e3941278e748fa856e6e23178976ce10ef0722c7f11b12ca120d7b0c1d6797`
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

## コーディング規約

- ファイル命名: PascalCase（コンポーネント）、camelCase（ユーティリティ）
- git commit message: `feat:`, `fix:`, `docs:`, `refactor:` prefix
- パッケージIDは `web/lib/sui.ts` で一元管理（ハードコード禁止）

## ワークフロー

作業に応じてスラッシュコマンドで役割を切り替え：

| コマンド | 用途 |
|---------|------|
| `/contract-dev` | Move コントラクト開発 |
| `/frontend-dev` | Next.js フロントエンド開発 |
| `/content-writer` | 技術記事の執筆 |
| `/reviewer` | コードレビュー・セキュリティチェック |
| `/deploy` | テストネットデプロイ手順 |

## 現在のスプリント

- [ ] [P1] UI/UX 改善（ランディングページ、統計表示）
- [ ] [P1] コンテンツ拡充（10本以上の技術記事）
- [ ] [P2] Sui Foundation グラント応募
- [ ] [P3] メインネット対応

## 実装済み機能

- [x] Walrus 統合（分散型コンテンツストレージ）
- [x] Sponsored transactions（Enoki ガスレスUX）
- [x] オンチェーンプロフィール + SuiNS
- [x] タグ・カテゴリシステム
- [x] コメントシステム
- [x] Read-to-Earn（0.05 SUI/記事）
- [x] Write-to-Earn（0.1 SUI/記事）
- [x] Stake-to-Publish（1 SUI スパム防止）
- [x] プレミアムコンテンツ（SUI 決済）
- [x] レベニューシェアリング（共著者分配）
- [x] zkLogin（Google OAuth）
