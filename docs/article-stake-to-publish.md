## はじめに

パーミッションレスなプラットフォームは、Web3 の根幹をなす設計思想である。誰でも自由にコンテンツを投稿でき、検閲に耐性を持つ。しかし、この自由には代償が伴う――スパムの問題だ。

従来の Web2 プラットフォームでは、運営会社がコンテンツを審査・削除することでスパムを制御してきた。しかし、分散型プラットフォームでは管理者が存在しない。一度オンチェーンに書き込まれたデータは、誰にも削除できない。これは検閲耐性というメリットであると同時に、スパム投稿が永続するというデメリットでもある。

Sui Dev Hub は、Sui ブロックチェーン上の分散型テクニカルコンテンツプラットフォームとして、この課題に正面から取り組んだ。本記事では、私たちが採用した **Stake-to-Publish** メカニズムの設計思想、Move による実装、そしてゲーム理論的な裏付けを解説する。

## 既存のスパム対策手法

パーミッションレスなプラットフォームにおけるスパム対策として、これまでさまざまなアプローチが試みられてきた。

### CAPTCHA / Proof of Humanity

最も一般的な手法だが、Bot の技術進歩により突破が容易になりつつある。特に大規模言語モデル（LLM）の登場以降、テキストベースの CAPTCHA はほぼ無意味化した。加えて、オンチェーンのトランザクションに CAPTCHA を組み込むことは技術的に困難である。

### レピュテーションシステム

投稿者の過去の行動履歴に基づいてスコアリングし、低スコアのユーザーを制限する方式。効果的ではあるが、新規ユーザーの参入障壁が高くなるという課題がある。また、Sybil 攻撃（大量の偽アカウント作成）に対して脆弱だ。

### モデレーション（人力審査）

中央集権的な運営が介入する方式で、分散型プラットフォームの理念に反する。DAO による分散型モデレーションも考えられるが、投票コストが高く、スパムの量に対してスケールしない。

### Proof of Work / 計算コスト

Hashcash のように投稿時に計算コストを要求する方式。効果的だが、モバイルデバイスのユーザーに不利であり、UX を著しく損なう。

### 経済的ステーキング

投稿時に一定額のトークンをロックし、一定期間後に回収可能にする方式。これがまさに Stake-to-Publish のアプローチであり、以下の利点を持つ：

- **永続的なコスト負担なし**: ステークは回収可能
- **Sybil 耐性**: 大量投稿には大量の資本が必要
- **UX の損失が少ない**: 正規ユーザーは投稿後にステークを回収するだけ
- **完全にオンチェーン**: スマートコントラクトだけで実装可能

## Stake-to-Publish の設計

Sui Dev Hub における Stake-to-Publish は、次のシンプルなルールに基づく。

1. **投稿時に 1 SUI をステーク**: 著者は記事を公開する際に、1 SUI（= 1,000,000,000 MIST）をデポジットとして拠出する
2. **デポジットは RewardPool に入金**: ステークされた SUI は、Read-to-Earn や Write-to-Earn の報酬原資として RewardPool に蓄積される
3. **いつでも回収可能（PostStake 方式）**: 初期設計では PostStake オブジェクトとして著者が所有し、任意のタイミングで `reclaim_stake()` を呼んで全額回収できた

この設計のポイントは、**正規ユーザーにとっての実質コストがゼロ**であることだ。1 SUI をステークしても、記事の投稿後すぐに回収できる。一方でスパマーにとっては、大量投稿のために大量の SUI を同時にロックする必要があり、攻撃コストが線形に増加する。

### アーキテクチャの進化

実装は2つのバージョンを経て進化した：

**v8（PostStake 方式）**: デポジットは `PostStake` オブジェクトとして著者に転送され、著者がいつでも回収可能。スパム対策としては機能するが、RewardPool の原資にはならない。

**現行版（Pool 統合方式）**: `create_post_with_pool()` では、デポジットが直接 RewardPool に入金される。著者のステークはプラットフォーム全体の Read-to-Earn / Write-to-Earn 報酬の原資となり、エコシステムの循環型経済を形成する。

## スマートコントラクト実装

### データ構造

まず、PostStake 構造体を見てみよう。これは v8 の設計で使われたもので、著者がデポジットを自分で管理するパターンだ：

```move
/// 投稿デポジット: スパム対策のため著者がロックするSUI（著者が所有）
public struct PostStake has key, store {
    id: UID,
    post_id: ID,
    author: address,
    amount: u64,
    balance: Balance<SUI>,
}
```

`PostStake` は `key` と `store` の両方の ability を持つ。`key` によりオンチェーンのオブジェクトとして存在し、`store` によりトランスファー可能になる。`balance` フィールドに実際の SUI がロックされ、`author` フィールドで回収権限を管理する。

### イベント定義

Stake-to-Publish に関連するイベントは2種類定義されている：

```move
public struct PostStaked has copy, drop {
    post_id: ID,
    author: address,
    stake_amount: u64,
}

public struct StakeReclaimed has copy, drop {
    post_id: ID,
    author: address,
    amount: u64,
}
```

これらのイベントはオフチェーンのインデクサーやフロントエンドが購読し、ステーキング状態の変化をリアルタイムに追跡するために使用される。

### 投稿関数（Pool 統合版）

現行の主要な投稿関数 `create_post_with_pool()` は、投稿の作成とデポジットの RewardPool 入金を一つのトランザクションで行う：

```move
/// Stake-to-Publish: プールへの入金付きで投稿（スパム対策）
/// デポジットはそのままRewardPoolの原資になる
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
    let post = Post {
        id: post_uid,
        author: ctx.sender(),
        title: title,
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

注目すべきポイントがいくつかある：

1. **`assert!` による最低額チェック**: `STAKE_AMOUNT_MIST`（1 SUI = 1,000,000,000 MIST）未満の場合、`EInsufficientStake` エラーでトランザクションが abort する
2. **`share_object` による Post の公開**: 投稿は shared object として全員がアクセス可能
3. **デポジットの即時入金**: `coin::into_balance()` と `balance::join()` により、デポジットが RewardPool に直接統合される

### ステーク回収関数

v8 方式の PostStake を持つユーザーが、ステークを回収する関数も引き続き利用可能だ：

```move
/// ステークを著者へ返還（いつでも回収可能）
public fun reclaim_stake(stake: PostStake, ctx: &mut TxContext) {
    assert!(stake.author == ctx.sender(), ENotAuthor);
    let PostStake { id, post_id, author: _, amount, balance } = stake;
    let coin = coin::from_balance(balance, ctx);
    event::emit(StakeReclaimed {
        post_id,
        author: ctx.sender(),
        amount,
    });
    object::delete(id);
    transfer::public_transfer(coin, ctx.sender());
}
```

この関数は Move のパターンマッチング（分解代入）を使い、PostStake オブジェクトを完全に分解する。`object::delete(id)` で UID を削除し、ロックされていた Balance を Coin に変換してから `public_transfer` で著者に返却する。`assert!` で `stake.author == ctx.sender()` を検証しているため、著者本人以外が回収することは不可能だ。

### フロントエンド統合

フロントエンドからの呼び出しは、`@mysten/dapp-kit` の Transaction Block を使って行う：

```typescript
const STAKE_AMOUNT_MIST = 1_000_000_000;

// Coinの分割とトランザクション構築
const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(STAKE_AMOUNT_MIST)]);
tx.moveCall({
  target: `${PACKAGE_ID}::platform::create_post_with_pool`,
  arguments: [
    tx.object(REWARD_POOL_ID),
    tx.pure.vector('u8', Array.from(new TextEncoder().encode(title))),
    tx.pure.vector('u8', Array.from(new TextEncoder().encode(contentHash))),
    depositCoin,
  ],
});
```

`splitCoins` で gas coin から 1 SUI を分割し、それを `create_post_with_pool` の `deposit` 引数として渡す。Sui の PTB（Programmable Transaction Block）により、コイン分割と関数呼び出しがアトミックに実行される。

## ゲーム理論的分析

Stake-to-Publish のスパム抑止効果を、ゲーム理論の観点から分析する。

### スパマーのコスト構造

スパマーが $n$ 件の記事を投稿する場合を考える。

- **Pool 統合方式（現行）**: $n \times 1$ SUI が RewardPool に入金される。これは回収不可能な実質コストとなる
- **PostStake 方式（v8）**: $n \times 1$ SUI が同時にロックされる。全て回収可能だが、攻撃中は $n$ SUI の資本が拘束される

いずれの方式でも、1,000件のスパム投稿には最低 1,000 SUI が必要になる。Pool 統合方式ではこれが完全に失われるため、より強力な抑止力となる。

### 正規ユーザーへの影響

正規ユーザーの視点では：

- 記事を1本書くごとに 1 SUI を拠出する
- Pool 統合方式では、その 1 SUI が Read-to-Earn（0.05 SUI/読者）や Write-to-Earn（0.1 SUI/投稿）の報酬原資になる
- 質の高い記事を書けば、Write-to-Earn 報酬として 0.1 SUI を回収でき、さらに読者からのチップも期待できる
- 実質的な負担は 1 SUI だが、エコシステムへの「投資」として正当化できる

### ナッシュ均衡

このメカニズムの下では、以下のナッシュ均衡が成立する：

- **正規ユーザー**: 質の高い記事を投稿し、Write-to-Earn 報酬とチップで投資を回収する。支配戦略は「質の高い記事を書く」
- **スパマー**: 1記事あたり 1 SUI のコストが、スパムの期待利得（通常ゼロに近い）を上回る。支配戦略は「スパムを送らない」

重要なのは、ステーク額がスパムの期待利得を上回るように設定されていることだ。テクニカルコンテンツプラットフォームにおいて、スパム記事から得られる利益（フィッシングリンクのクリック率 × 被害額 × 成功確率）は極めて低い。1 SUI（テストネット上では無価値だが、メインネットでは実価値を持つ）のステーク要求は、この期待利得を十分に上回る抑止力となる。

### Sybil 攻撃耐性

Sybil 攻撃（大量の偽アカウントによる攻撃）に対しても、Stake-to-Publish は効果的だ。アカウントをいくら作成しても、各アカウントから投稿するたびに 1 SUI が必要になる。攻撃の規模はアカウント数ではなく、攻撃者の資本量によって制約される。

## zkLogin ユーザーへの対応

Sui の zkLogin は、Google OAuth などの既存の Web2 認証を使って Sui アドレスを生成する仕組みだ。Sui Dev Hub では Enoki（Mysten Labs 提供の zkLogin SDK）を統合しており、ユーザーは Google アカウントでログインするだけでウォレットを持てる。

しかし、zkLogin ユーザーは多くの場合 SUI を保有していない。これは Stake-to-Publish と相性が悪い。

### Sponsored Transaction による解決

Sui の Sponsored Transaction 機能を使えば、ガス代をスポンサー（プラットフォーム運営者）が負担できる。しかし、ステーク自体を肩代わりすることは、スパム対策の目的に反する。

Sui Dev Hub では、zkLogin ユーザー向けに2段階のアプローチを取っている：

1. **ガス代のスポンサリング**: Enoki を通じてトランザクションのガス代をプラットフォームが負担。ユーザーは SUI を保有せずともトランザクションを実行できる
2. **ステークなし投稿の提供**: `create_post()` 関数はステーク不要で投稿可能。zkLogin ユーザーはこちらを利用する

```move
public fun create_post(
    title: vector<u8>,
    content_hash: vector<u8>,
    ctx: &mut TxContext,
) {
    let post_id = object::new(ctx);
    let id_copy = object::uid_to_inner(&post_id);
    let post = Post {
        id: post_id,
        author: ctx.sender(),
        title: title,
        content_hash,
        tip_balance: 0,
        created_at: ctx.epoch(),
    };
    event::emit(PostCreated {
        post_id: id_copy,
        author: ctx.sender(),
        title: post.title,
    });
    transfer::share_object(post);
}
```

この関数はデポジットを一切要求しないため、zkLogin + Sponsored Transaction の組み合わせで完全にガスレスな投稿が可能になる。

### トレードオフの管理

ステークなし投稿を許可すると、当然スパムのリスクが高まる。これに対しては以下の補完策を検討している：

- **レート制限**: zkLogin ユーザーのスポンサードトランザクションに1日あたりの投稿数上限を設ける
- **段階的アンロック**: 初回投稿はステークなし、2回目以降はステーク必須とする
- **オフチェーンレピュテーション**: Google アカウントの信頼度スコアに基づいてステーク要件を動的に調整する

完全なパーミッションレス性と完全なスパム耐性は両立しない。Stake-to-Publish は、この2つのバランスを取るための実践的な解法であり、zkLogin 対応はユーザーのオンボーディングを優先した現実的な妥協点だ。

## まとめ

Stake-to-Publish は、分散型プラットフォームにおけるスパム対策として、シンプルかつ効果的なメカニズムだ。その本質は、「投稿という行為に経済的コストを付与し、スパムの期待利得を下回らせる」というゲーム理論的アプローチにある。

Sui Dev Hub の実装では、Move 言語のオブジェクトモデルを活用し、PostStake による著者管理型ステーキングと、RewardPool 統合型の2つのパターンを実現した。特に Pool 統合方式では、スパム対策のデポジットがそのままエコシステムの報酬原資になるという循環型経済を構築している。

また、zkLogin ユーザーへの配慮として、ステークなし投稿との二重構造を採用し、パーミッションレス性とスパム耐性のバランスを取っている。

Web3 プラットフォームを設計する開発者にとって、Stake-to-Publish は低コストで実装可能かつ効果の高いスパム対策パターンとして、検討に値するだろう。ソースコードは [Sui Dev Hub の GitHub リポジトリ](https://github.com/) で公開しているので、ぜひ参考にしていただきたい。

**関連リソース:**

- [Sui Move ドキュメント](https://docs.sui.io/concepts/sui-move-concepts)
- [Sui Dev Hub ライブデモ](https://sui-dev-hub-tau.vercel.app)
- [Enoki (zkLogin SDK)](https://docs.enoki.mystenlabs.com/)
