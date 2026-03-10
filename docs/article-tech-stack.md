## はじめに

Sui Dev Hubは、Sui開発者のための分散型テクニカルコンテンツプラットフォームです。この記事では、実際にプロダクションで使っている技術スタックの全体像と、各技術の選定理由・実装上のハマりポイントを共有します。

同じようなdAppを作りたい開発者の参考になれば幸いです。

## アーキテクチャ概要

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Next.js 16  │────▶│  Sui Testnet │     │   Walrus    │
│  (Vercel)    │     │  (Move)      │     │  (Storage)  │
└──────┬───────┘     └──────────────┘     └─────────────┘
       │
       ├── @mysten/dapp-kit（ウォレット接続）
       ├── zkLogin + Enoki（Google認証 + ガススポンサー）
       └── React Query（データフェッチ + キャッシュ）
```

**フロントエンド**: Next.js 16 + TypeScript + Tailwind CSS
**スマートコントラクト**: Sui Move（v8、8回のアップグレード）
**コンテンツ保存**: Walrus（分散ストレージ）
**認証**: zkLogin（Googleアカウント）+ ウォレット接続
**ガス代**: Enokiスポンサーシップ（zkLoginユーザーは完全無料）

## 1. スマートコントラクト設計（Sui Move）

### オブジェクトモデル

Suiのオブジェクト指向モデルは、コンテンツプラットフォームと相性が良いです。

```move
public struct Post has key, store {
    id: UID,
    author: address,
    title: vector<u8>,
    content_hash: vector<u8>,  // Walrus blob ID
    tip_balance: u64,
    created_at: u64,
}

public struct Profile has key, store {
    id: UID,
    owner: address,
    username: vector<u8>,
    bio: vector<u8>,
    total_earned: u64,
}
```

`Post`はShared Object、`Profile`はOwned Objectとして設計しています。記事は誰でも読めるべきなので共有、プロフィールは本人だけが編集するので所有です。

### パッケージアップグレード戦略

v1からv8まで8回アップグレードしています。Suiのパッケージアップグレードで重要なのは：

- **structの型はオリジナルのパッケージIDに紐づく**。v8で`create_profile`を呼んでも、返されるオブジェクトの型は`v1::platform::Profile`
- フロントエンドで`getOwnedObjects`のフィルタに使うStructTypeは**オリジナルのパッケージID**を使う必要がある
- 関数の呼び出しは最新のパッケージIDを使う

これを知らないと「保存したはずのデータが取得できない」という罠にハマります（実際にハマりました）。

## 2. zkLogin — Googleアカウントでブロックチェーン

zkLoginは、Sui独自のゼロ知識証明ベースの認証システムです。

**ユーザー体験**: Googleでログイン → 裏側でSuiアドレスが自動生成 → ウォレット不要でトランザクション実行

### 実装フロー

```
1. フロントエンドでephemeral keypairを生成
2. Google OAuthでJWTを取得
3. Enoki ProverにJWT + ephemeral keyを送信
4. ZK proofとSuiアドレスを受け取る
5. トランザクション署名時にZK proofを添付
```

### Enokiガススポンサーシップ

zkLoginユーザーはSUIトークンを持っていないので、ガス代を誰かが払う必要があります。EnokiのSponsored Transactionを使うと：

- バックエンドAPIがEnokiにトランザクションを送信
- Enokiがガス代を立て替えて署名
- ユーザーは完全無料でトランザクション実行

**注意点**: Enokiダッシュボードの**Allowed Move Call Targets**に、許可する関数を全て登録する必要があります。パッケージをアップグレードしたら、新しいパッケージIDの関数も追加し忘れないこと。

## 3. Walrus — 分散型コンテンツストレージ

記事の本文はブロックチェーンに直接保存するにはコストが高すぎます。Walrusを使って分散ストレージに保存し、blob IDだけをオンチェーンに記録しています。

```
投稿フロー:
1. Markdownテキストをwalrus aggregatorにPOST
2. blob IDを受け取る
3. blob IDをcontent_hashとしてPostオブジェクトに保存

閲覧フロー:
1. PostオブジェクトからContent_hashを取得
2. walrus aggregatorからblob IDでコンテンツを取得
3. Markdownをレンダリング
```

Walrusのメリットは、コンテンツがSuiエコシステム内で完結すること。Arweaveなど他チェーンのストレージを使わずに済みます。

## 4. マネタイゼーション設計

### チップ（SUI + TJPYC）

読者から著者へ直接送金。スマートコントラクトが仲介するので、プラットフォーム手数料はゼロです。

### Revenue Sharing（収益分配）

共著者がいる場合、チップを自動分配できます。basis point（10,000 = 100%）で比率を設定：

```move
public fun set_coauthor_config(
    post: &Post,
    co_authors: vector<address>,
    shares_bps: vector<u64>,  // 合計10,000
    ctx: &mut TxContext,
)
```

### Stake-to-Publish（スパム対策）

zkLoginでガス代無料にすると、スパム投稿のリスクがあります。Stake-to-Publishでは、投稿時に1 SUIをReward Poolにデポジット。このSUIはいつでも回収可能ですが、スパマーへの心理的障壁として機能します。

### Read-to-Earn（読者報酬）

Reward Poolから読者に0.05 SUI/記事を還元。良質な記事を読むインセンティブを作り、プラットフォームの活性化を狙っています。

## 5. フロントエンドの工夫

### テストネットインデクサー遅延の回避

Suiテストネットでは、オブジェクト作成後にRPCインデクサーが反映するまで遅延があります。`queryTransactionBlocks`でイベントから直接Post IDを取得し、`multiGetObjects`で一括フェッチすることで回避しています。

### OGP対応

Next.js App Routerの`generateMetadata`を使い、サーバーサイドでSui RPCから記事タイトルを取得。SNSシェア時にカード表示されるようにしています。

## まとめ

Sui Dev Hubで使っている技術を整理すると：

| レイヤー | 技術 | 役割 |
|---------|------|------|
| コントラクト | Sui Move | 記事・プロフィール・チップ・報酬の管理 |
| ストレージ | Walrus | 記事本文の分散保存 |
| 認証 | zkLogin + Enoki | Google認証 + ガスレス |
| フロント | Next.js + dapp-kit | UI + ウォレット接続 |
| デプロイ | Vercel | 自動デプロイ |

全てSuiエコシステム内で完結しているのが特徴です。

質問やフィードバックがあれば、コメントで教えてください。
