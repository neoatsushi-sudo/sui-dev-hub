# Sui Dev Hub - グラント応募に向けた1-2週間ロードマップ

## 背景・戦略
- **目標**: Sui Foundation グラント審査に1-2週間以内に応募
- **課題**: プラットフォーム上のコンテンツ不足
- **ビジョン**: Web3的な分散型コンテンツプラットフォーム（Mirror.xyz の Sui 版）
- **フロー**: テストネットでユーザー獲得 → グラント応募 → 審査通過 → メインネットローンチ → 加速

## 現在の実装状況（既に動いている機能）
- スマートコントラクト v8（8回アップグレード済み）
- 投稿/プロフィール/チップ/コメント/いいね/プレミアム/レベニューシェア/Read-to-Earn/Stake-to-Publish
- zkLogin (Google OAuth) + Enoki ガスレスUX
- Walrus 分散ストレージ
- 検索/タグフィルター/ソート/OGP
- ライブデモ: https://sui-dev-hub-tau.vercel.app

---

## 確定方針
- **Write-to-Earn を実装する**（投稿すれば即報酬、シンプル設計）
- **コンテンツ・UI・機能をバランスよく進める**
- **1-2週間でグラント応募**

---

## 実行プラン

### Week 1: 開発 + コンテンツ基盤

**Day 1-2: Write-to-Earn 実装**
- [ ] コントラクト v9: `claim_writing_reward(pool, post)` 追加
  - 投稿者が自分の記事に対して即時報酬請求可能（1記事1回）
  - 報酬額: 0.1 SUI（Read-to-Earn の倍）
  - WriteReceipt で重複防止
  - WritingRewardClaimed イベント発行
  - 対象ファイル: `contracts/sources/platform.move`
- [ ] フロントエンド: WriteToEarnButton コンポーネント追加
  - 対象ディレクトリ: `web/components/`
- [ ] CreatePost or PostDetail に「報酬を受け取る」ボタン統合
- [ ] テストネットにデプロイ + 動作確認

**Day 3-4: UI/UX 磨き込み**
- [ ] ランディングページ改善（プラットフォームの価値提案を明確に）
  - 対象: `web/app/page.tsx`
- [ ] 統計表示（総投稿数、総ユーザー数、RewardPool 残高）
- [ ] 重複コンポーネント整理（ReadToEarnButton / ReadToEarn 統合）
- [ ] モバイル対応確認

**Day 5: コンテンツ投稿**
- [ ] `docs/` の技術記事2本をプラットフォームに投稿（publish スクリプト活用）
- [ ] 追加記事を 3-5 本作成・投稿（Sui 開発入門、zkLogin 解説など）

### Week 2: コンテンツ拡充 + グラント準備

**Day 6-8: コンテンツ追加 + 仕上げ**
- [ ] 合計 10 本程度の記事を目指す
- [ ] SNS での宣伝開始（Twitter で記事を共有）
- [ ] README / CLAUDE.md のロードマップ更新
- [ ] 未コミットファイル整理・コミット

**Day 9-10: グラント申請準備**
- [ ] Sui Foundation グラント申請書の作成
  - プロダクト概要・差別化ポイント
  - 技術スタック・アーキテクチャ
  - ロードマップ（メインネット、トークノミクス）
  - チーム・実績
- [ ] デモ動画 or スクリーンショット準備

---

## Write-to-Earn 設計詳細

### 仕様
```
投稿者が記事を公開 → 即座に報酬請求可能
報酬: 0.1 SUI（RewardPool から支払い）
1記事につき1回のみ（WriteReceipt + dynamic field で管理）
スパム防止: Stake-to-Publish (1 SUI) > 報酬 (0.1 SUI) なので経済的にスパムは割に合わない
```

### 実装箇所
1. **Move コントラクト** (`contracts/sources/platform.move`)
   - 新定数: `WRITING_REWARD_MIST: u64 = 100_000_000` (0.1 SUI)
   - 新構造体: `WriteReceipt { id, post_id, author }`
   - 新関数: `claim_writing_reward(pool: &mut RewardPool, post: &Post, ctx: &mut TxContext)`
   - 新イベント: `WritingRewardClaimed { post_id, author, amount }`
   - 既存の `ClaimKey` dynamic field パターンを再利用して重複防止

2. **フロントエンド** (`web/components/WriteToEarnButton.tsx`)
   - PostDetail ページに配置
   - 投稿者本人にのみ表示
   - 請求済みかどうかイベントで確認
   - `web/lib/sui.ts` にパッケージID v9 追加

---

## 検証方法
- `sui move test` でコントラクトテスト
- `npm run build` でフロントエンドビルド確認
- テストネットにデプロイして Write-to-Earn を動作確認
- ライブデモサイトで記事投稿→報酬請求のフロー確認
