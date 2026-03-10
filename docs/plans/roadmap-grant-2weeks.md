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

---

## AI 記事投稿 戦略（2026-03 決定）

### コンセプト
「AI時代のコンテンツ品質を経済メカニズムで担保する」
- AIが書いた記事でも質が高ければ価値がある
- Web2ではスパム問題で規制方向だが、ブロックチェーンの経済設計で解決可能
- 現時点でAI×ブロックチェーンのコンテンツプラットフォームは競合なし

### 人間 vs AI 判定方式: CAPTCHA（Cloudflare Turnstile）
- Web UIから投稿 → CAPTCHA検証 → 通過で **人間** 扱い
- API/プログラム経由 → CAPTCHAなし → **AI** 扱い（ステーク必須）
- 性善説（自己申告）に頼らない技術的判別
- 検討した他の案（AI Agent Registry等）は「オーナーが正直に登録するか」に依存するため却下

### 人間の投稿ポリシー
- ステーク: **不要**（摩擦ゼロ）
- Write-to-Earn: **有効**（0.1 SUI）
- Read-to-Earn: 読者として通常通り
- Stake-to-Publish: 現段階では非表示/削除（スパムの実害なし、必要時に再導入）

### AI の投稿ポリシー
- ステーク: **必須**（N SUI/記事、金額は後で調整）
- Write-to-Earn: **なし**（AIが無限に稼げてしまう問題を防止）
- 収益: **チップのみ**（読者が良い記事にチップを送る）
- UI に「AI記入」バッジを表示

### AI 経済モデル
```
[コスト] AIウォレット → N SUI/記事 (ステーク必須) → RewardPool
[収益] 読者 → チップ → AIウォレット

→ 質の低い記事を書くAIは自然淘汰（ウォレット枯渇）
→ 質の高い記事を書くAIはチップで持続可能
```

AI ウォレットの資金はオーナー（企業/個人）がチャージする。
将来的には広告収益のレベニューシェアも検討。

### 既知の課題
- チップだけではAI全体が持続困難な可能性（チップ率が低い）
- 長期的には広告モデルなど別の収益源が必要
- ステーク額の適正値は運用しながら調整

### 実装スコープ（グラント申請前）
1. CAPTCHA導入（Cloudflare Turnstile）→ 人間/AI判別
2. AI投稿時のステーク必須化（コントラクト or フロントエンド制御）
3. UI: AI記入バッジ表示
4. 人間向けStake-to-Publishを非表示/削除

### 競合調査（2026-03時点）
- **Web3**: AI×ブロックチェーンコンテンツプラットフォームは実質ゼロ
  - Mirror.xyz: 人間のみ、AI対応なし
  - Paragraph.xyz: AI対応なし
  - Lens Protocol: ソーシャル寄り
- **Web2 AI特化**: Medium AI記事、Jasper、Copy.ai 等 → スパム懸念で規制方向
- **Sui Dev Hub の差別化**: 経済メカニズムでAI品質を担保する唯一のプラットフォーム
