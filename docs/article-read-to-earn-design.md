## はじめに --- なぜ Read-to-Earn なのか

Web3 時代のコンテンツプラットフォームが解決すべき根本的な問題がある。それは「読者の貢献が経済的に評価されない」ということだ。

従来の Web2 プラットフォーム（Medium、note、Qiita など）では、広告収益モデルが支配的だ。読者はコンテンツを消費するが、そこから生まれる価値（PV、エンゲージメント、データ）は全てプラットフォーム運営者に吸い上げられる。書き手にはわずかな収益分配があるものの、読者には何も還元されない。

これは非対称だ。良質なコンテンツには良質な読者が必要であり、読者のエンゲージメント（最後まで読む、共有する、議論する）こそがコンテンツの真の価値を決定する。

Sui Dev Hub では、この問題に対して **Read-to-Earn**（読了報酬）と **Write-to-Earn**（執筆報酬）を組み合わせた二方向のインセンティブ設計を実装した。本記事では、Sui Move で実装したオンチェーン報酬メカニズムの経済設計、スパム対策、スマートコントラクトの具体的な実装を解説する。

---

## 経済設計 --- RewardPool とトークノミクス

### 報酬パラメータ

Sui Dev Hub の報酬体系はシンプルな固定報酬モデルを採用している。

| アクション | 報酬額 | 対象 |
|-----------|--------|------|
| Read-to-Earn | 0.05 SUI | 記事を読んだ読者 |
| Write-to-Earn | 0.1 SUI | 記事を公開した著者 |
| Stake-to-Publish | 1 SUI（デポジット） | 投稿時にプールへ寄付 |

これらの定数は Move コントラクト内で以下のように定義されている。

```move
// 読了報酬 0.05 SUI (= 50,000,000 MIST)
const READING_REWARD_MIST: u64 = 50_000_000;
// 投稿ステーク最低額 1 SUI (= 1,000,000,000 MIST)
const STAKE_AMOUNT_MIST: u64 = 1_000_000_000;
// 執筆報酬 0.1 SUI (= 100,000,000 MIST)
const WRITING_REWARD_MIST: u64 = 100_000_000;
```

Sui の最小単位は MIST であり、1 SUI = 1,000,000,000 MIST（10^9）だ。コントラクト内では全てMIST単位で計算することで、浮動小数点の問題を回避している。

### RewardPool --- 共有オブジェクトとしての報酬プール

報酬の原資となるのが `RewardPool` だ。これは Sui の **shared object** として実装されており、全てのユーザーが参照・操作できる。

```move
public struct RewardPool has key {
    id: UID,
    balance: Balance<SUI>,
    total_claimed: u64,
    total_funded: u64,
}
```

設計上のポイントは以下の通りだ。

- **`balance`**: `Coin<SUI>` ではなく `Balance<SUI>` を使用している。`Balance` はオブジェクトとしての ID を持たない軽量な型で、プール内での分割・結合が効率的に行える。
- **`total_claimed` / `total_funded`**: 累計の請求額と入金額を追跡する。これにより、プールの健全性をオンチェーンで監視できる。
- **shared object**: `transfer::share_object(pool)` によって共有オブジェクト化されるため、任意のトランザクションから参照可能だ。ただし、shared object への書き込みは Sui のコンセンサスを経由するため、単純な owned object よりもレイテンシが高い点はトレードオフである。

### 資金の流れ

RewardPool の資金循環は以下のように設計されている。

```
[入金]                              [出金]
プラットフォーム運営 --fund--> RewardPool --claim_reading_reward--> 読者 (0.05 SUI)
投稿者 (Stake 1 SUI) --deposit-->    |   --claim_writing_reward--> 著者 (0.1 SUI)
誰でも --fund_reward_pool-->         |
```

重要なのは、Stake-to-Publish のデポジット（1 SUI）がそのまま RewardPool の原資になる点だ。つまり、1回の投稿が理論上 20回分の読了報酬（0.05 SUI x 20）、または 10回分の執筆報酬（0.1 SUI x 10）を賄える。投稿者が「消費者」であると同時に「原資提供者」でもあるという循環構造を実現している。

---

## スパム対策 --- Stake-to-Publish の設計

### なぜステーキングが必要か

Read-to-Earn の最大のリスクは **Sybil攻撃**（複数アカウントによる報酬の不正取得）だ。報酬を得るために低品質な記事を大量投稿されると、プールが急速に枯渇する。

Stake-to-Publish はこの問題に対する経済的抑止力だ。投稿時に 1 SUI をプールに寄付することで、以下の効果を得る。

1. **コスト障壁**: スパム投稿のコストが 1 SUI/記事となり、大量投稿の経済的合理性が低下する
2. **プール維持**: デポジットが直接報酬原資になるため、投稿が増えるほどプールが潤う
3. **品質シグナル**: 1 SUI を支払ってでも公開したいコンテンツは、著者自身が一定の品質を認識している証拠になる

### コントラクト実装

```move
public fun create_post_with_pool(
    pool: &mut RewardPool,
    title: vector<u8>,
    content_hash: vector<u8>,
    deposit: Coin<SUI>,
    ctx: &mut TxContext,
) {
    let amount = coin::value(&deposit);
    assert!(amount >= STAKE_AMOUNT_MIST, EInsufficientStake);

    // Post作成
    let post_uid = object::new(ctx);
    let post_id = object::uid_to_inner(&post_uid);
    let title_copy = title;
    let post = Post {
        id: post_uid,
        author: ctx.sender(),
        title: title_copy,
        content_hash,
        tip_balance: 0,
        created_at: ctx.epoch(),
    };
    event::emit(PostCreated {
        post_id,
        author: ctx.sender(),
        title: post.title,
    });
    transfer::share_object(post);

    // デポジットをプールに寄付する
    pool.total_funded = pool.total_funded + amount;
    balance::join(&mut pool.balance, coin::into_balance(deposit));
    event::emit(RewardPoolFunded {
        pool_id: object::id(pool),
        funder: ctx.sender(),
        amount,
        new_total: balance::value(&pool.balance),
    });
}
```

`assert!(amount >= STAKE_AMOUNT_MIST, EInsufficientStake)` により、1 SUI 未満のデポジットはトランザクションレベルで拒否される。`coin::into_balance(deposit)` で `Coin<SUI>` を `Balance<SUI>` に変換し、プールの `balance` に `join` する。この操作は不可逆であり、デポジットは即座にプールの一部となる。

---

## スマートコントラクト実装 --- 報酬請求のしくみ

### Read-to-Earn: `claim_reading_reward`

読了報酬の請求関数は以下の通りだ。

```move
public fun claim_reading_reward(
    pool: &mut RewardPool,
    post: &Post,
    ctx: &mut TxContext,
) {
    // プール残高チェック
    assert!(
        balance::value(&pool.balance) >= READING_REWARD_MIST,
        EInsufficientPool
    );

    pool.total_claimed = pool.total_claimed + READING_REWARD_MIST;

    // 報酬を読者へ送金
    let reward_coin = coin::from_balance(
        balance::split(&mut pool.balance, READING_REWARD_MIST),
        ctx,
    );
    transfer::public_transfer(reward_coin, ctx.sender());

    event::emit(ReadRewardClaimed {
        pool_id: object::id(pool),
        post_id: object::id(post),
        claimer: ctx.sender(),
        amount: READING_REWARD_MIST,
    });
}
```

処理の流れは以下の通りだ。

1. **残高チェック**: `balance::value(&pool.balance)` でプール残高を確認。不足していれば `EInsufficientPool` でアボート
2. **統計更新**: `total_claimed` を加算して累計請求額を記録
3. **報酬送金**: `balance::split` でプールから報酬分を切り出し、`coin::from_balance` で `Coin<SUI>` オブジェクトに変換、`transfer::public_transfer` で呼び出し元（`ctx.sender()`）に送金
4. **イベント発行**: `ReadRewardClaimed` イベントにより、オフチェーンでの追跡とインデクシングが可能

### Write-to-Earn: `claim_writing_reward`

執筆報酬はオンチェーンでの重複防止が組み込まれている点が異なる。

```move
public fun claim_writing_reward(
    pool: &mut RewardPool,
    post: &Post,
    ctx: &mut TxContext,
): WriteReceipt {
    // 投稿者本人のみ請求可能
    assert!(post.author == ctx.sender(), ENotAuthor);
    // プール残高チェック
    assert!(
        balance::value(&pool.balance) >= WRITING_REWARD_MIST,
        EInsufficientPool
    );
    // 重複請求の防止（オンチェーン）
    let key = ClaimKey { post_id: object::id(post), claimer: ctx.sender() };
    assert!(!dynamic_field::exists_(&pool.id, key), EAlreadyClaimed);
    dynamic_field::add(&mut pool.id, key, true);

    pool.total_claimed = pool.total_claimed + WRITING_REWARD_MIST;

    // 報酬を著者へ送金
    let reward_coin = coin::from_balance(
        balance::split(&mut pool.balance, WRITING_REWARD_MIST),
        ctx,
    );
    transfer::public_transfer(reward_coin, ctx.sender());

    event::emit(WritingRewardClaimed {
        pool_id: object::id(pool),
        post_id: object::id(post),
        author: ctx.sender(),
        amount: WRITING_REWARD_MIST,
    });

    WriteReceipt {
        id: object::new(ctx),
        post_id: object::id(post),
        author: ctx.sender(),
    }
}
```

Read-to-Earn との違いは 3 点だ。

1. **著者認証**: `post.author == ctx.sender()` により、記事の著者本人のみが請求可能
2. **オンチェーン重複防止**: `ClaimKey` + `dynamic_field` パターンで二重請求を不可能にする（後述）
3. **Receipt 返却**: `WriteReceipt` オブジェクトを返り値として生成し、呼び出し元に転送する。これが執筆報酬受領の永続的な証明となる

---

## 重複チェック --- イベントベース vs Dynamic Field

### 二つの戦略

Sui Dev Hub では、報酬の重複請求防止に二つの異なるアプローチを採用している。

#### 戦略 1: イベントベース（Read-to-Earn）

`claim_reading_reward` はコントラクト内に重複チェックロジックを持たない。代わりに、フロントエンドが `ReadRewardClaimed` イベントを検索して判定する。

```typescript
// フロントエンド側の重複チェック
const { data: claimEvents } = useSuiClientQuery(
  "queryEvents",
  {
    query: {
      MoveEventType: `${PACKAGE_ID}::platform::ReadRewardClaimed`,
    },
    limit: 50,
    order: "descending",
  },
  { enabled: !!currentAddress && !!postId }
);

useEffect(() => {
  if (!claimEvents || !currentAddress) return;
  const alreadyClaimed = claimEvents.data.some((e: any) => {
    const j = e.parsedJson;
    return j?.post_id === postId && j?.claimer === currentAddress;
  });
  if (alreadyClaimed) setClaimed(true);
}, [claimEvents, currentAddress, postId]);
```

この方式のメリットは、コントラクトのストレージコスト（dynamic field の追加）が不要な点だ。デメリットは、悪意あるユーザーがフロントエンドを迂回して直接コントラクトを呼び出せば、理論上は二重請求が可能という点だ。

#### 戦略 2: Dynamic Field（Write-to-Earn）

`claim_writing_reward` では `ClaimKey` を dynamic field として RewardPool に記録する。

```move
public struct ClaimKey has copy, drop, store {
    post_id: ID,
    claimer: address,
}

// claim_writing_reward 内
let key = ClaimKey { post_id: object::id(post), claimer: ctx.sender() };
assert!(!dynamic_field::exists_(&pool.id, key), EAlreadyClaimed);
dynamic_field::add(&mut pool.id, key, true);
```

`(post_id, claimer)` の組み合わせをキーとし、値として `true` (bool) を格納する。同じキーが既に存在すれば `EAlreadyClaimed` (エラーコード 5) でトランザクション全体がアボートされる。

この方式は **完全にオンチェーンで強制** されるため、コントラクトを直接呼び出しても回避できない。ただし、1請求あたり dynamic field のストレージコスト（約 76 bytes + Sui のストレージ rebate 計算）が発生する。

### なぜ使い分けるのか

| 観点 | Read-to-Earn (イベント) | Write-to-Earn (Dynamic Field) |
|------|------------------------|-------------------------------|
| セキュリティ | フロントエンド依存 | オンチェーン強制 |
| ストレージコスト | なし | dynamic field 追加分 |
| スケーラビリティ | イベントクエリの上限に依存 | ストレージ増加 |
| リスク | 二重請求の理論的可能性 | なし |

Read-to-Earn は報酬額が 0.05 SUI と小さく、Sybil攻撃のコスト対効果が低い。一方、Write-to-Earn は 0.1 SUI と高額で、かつ著者認証（`post.author == ctx.sender()`）が既にあるため、追加のオンチェーン保護が合理的と判断した。

将来的には、Read-to-Earn にも `ClaimKey` パターンを導入し、完全なオンチェーン重複防止に移行する予定だ。ビューヘルパー関数 `has_claimed_reward` は既にこれに対応している。

```move
public fun has_claimed_reward(
    pool: &RewardPool,
    post_id: ID,
    claimer: address,
): bool {
    let key = ClaimKey { post_id, claimer };
    dynamic_field::exists_(&pool.id, key)
}
```

---

## 課題と今後の改善

### 1. レート制限

現在の設計では、1ユーザーが短時間に大量の記事を読んで報酬を請求することを制限するメカニズムがない。対策として以下を検討している。

- **Epoch ベースの制限**: `ctx.epoch()` を活用し、1エポック（約24時間）あたりの請求回数を制限する
- **Cooldown パターン**: 前回の請求からの経過時間を `Clock` オブジェクトで検証する

```move
// 将来の実装イメージ
public struct RateLimit has copy, drop, store {
    claimer: address,
    epoch: u64,
}
// 1エポックあたり最大 N 記事まで
```

### 2. 動的報酬額

固定報酬モデルはシンプルだが、プール残高が少なくなると枯渇リスクが高まる。動的報酬の導入により、プール残高に応じて報酬額を自動調整できる。

```
報酬額 = base_reward * (pool_balance / target_balance)
```

プール残高が `target_balance`（例: 100 SUI）を上回っていれば満額、下回っていれば比例的に減額する。これにより、プールの持続可能性が大幅に向上する。

### 3. DAO ガバナンス

現在、報酬パラメータ（金額、ステーク要件）はコントラクトのコンパイル時定数として固定されている。将来的には、プラットフォームトークンを用いた DAO ガバナンスにより、コミュニティがパラメータを投票で決定する仕組みを実装したい。

- 報酬額の変更提案と投票
- プール資金の使途決定
- 新機能の優先順位付け

### 4. コンテンツ品質スコアリング

Read-to-Earn の持続可能性には、コンテンツの質を評価する仕組みが不可欠だ。現在検討中のアプローチとして以下がある。

- **読了率ベース**: 実際に最後まで読んだかどうかをオフチェーンで検証し、オラクル経由でオンチェーンに反映
- **ソーシャルシグナル**: Like数、コメント数、チップ額を組み合わせた品質スコア
- **ステーキング量による重み付け**: 著者のステーク額が大きいほど、読者への報酬も増額

### 5. Read-to-Earn のオンチェーン重複防止

前述の通り、Read-to-Earn のイベントベース重複チェックはフロントエンド迂回に対して脆弱だ。次期アップグレードでは `claim_reading_reward` にも `ClaimKey` + `dynamic_field` パターンを導入し、Write-to-Earn と同等のセキュリティレベルに引き上げる。既に `has_claimed_reward` ビュー関数はこのキー構造に対応しており、移行は比較的容易だ。

---

## まとめ

Sui Dev Hub の Read-to-Earn / Write-to-Earn メカニズムは、以下の設計原則に基づいている。

1. **二方向インセンティブ**: 読者と書き手の両方に経済的報酬を提供し、プラットフォーム全体のエンゲージメントを促進する
2. **自己持続的な資金循環**: Stake-to-Publish のデポジットが RewardPool の原資となり、投稿が増えるほどプールが潤う構造
3. **段階的セキュリティ**: リスクに応じてイベントベース（軽量）とオンチェーン強制（堅牢）を使い分ける
4. **Sui の特性活用**: shared object、dynamic field、Balance 型など、Sui Move 固有の機能を最大限に活用した設計

Web3 コンテンツプラットフォームにおけるトークノミクス設計は、まだ試行錯誤の段階だ。しかし、ブロックチェーンの透明性とプログラマビリティを活かすことで、従来の広告モデルとは根本的に異なる、参加者全員が価値を共有する仕組みを構築できる。

Sui Dev Hub のコントラクトコードは全てオープンソースであり、Sui Testnet 上で実際に動作している。興味のある開発者は、ぜひ自分のプロジェクトに Read-to-Earn パターンを応用してみてほしい。

---

**参考リンク**

- Sui Dev Hub ライブデモ: https://sui-dev-hub-tau.vercel.app
- Sui Move ドキュメント: https://docs.sui.io/concepts/sui-move-concepts
- Sui Dynamic Fields: https://docs.sui.io/concepts/dynamic-fields
