## TL;DR

Sui Moveでパッケージをアップグレードすると、**structの型はオリジナル（v1）のパッケージIDに紐づいたまま**になる。フロントエンドの`getOwnedObjects`フィルタに最新のパッケージIDを使うと、オブジェクトが見つからない。

これは公式ドキュメントを読んでも気づきにくく、実際にプロダクションでデータが消えたように見えるバグを引き起こした。

## 背景

Sui Dev Hubでは、スマートコントラクトをv1からv8まで8回アップグレードしている。新機能を追加するたびにパッケージをpublish upgradeし、フロントエンドの`PACKAGE_ID`を最新に差し替えてきた。

```typescript
// lib/sui.ts
export const PACKAGE_ID = "0x036ef..."; // v8 (最新)
export const ORIGINAL_PACKAGE_ID = "0x2a0120c..."; // v1 (初回publish)
```

## 何が起きたか

ある日、ユーザーがプロフィールを保存しても**表示されない**というバグが報告された。

トランザクション自体は成功している。Sui Explorerで確認すると、Profileオブジェクトは確かにオンチェーンに存在する。しかしフロントエンドのUIには何も表示されない。

## 原因の特定

プロフィール取得のコードはこうだった：

```typescript
const { data } = await client.getOwnedObjects({
  owner: address,
  filter: {
    StructType: `${PACKAGE_ID}::platform::Profile`
    //           ^^^^^^^^^^^ v8のパッケージID
  },
  options: { showContent: true },
});
```

一見正しいように見える。`PACKAGE_ID`は最新のv8を指している。`create_profile`もv8のパッケージIDで呼んでいる。

しかし**Suiのパッケージアップグレードでは、structの型はオリジナルのパッケージIDに紐づく**。

つまり：

```
v8::platform::create_profile() を呼んで作成
   ↓
返されるオブジェクトの型は v1::platform::Profile
   ↓
v8::platform::Profile でフィルタしても何もヒットしない
```

## なぜこうなるのか

Suiのパッケージアップグレードの仕組み：

- アップグレードすると**新しいパッケージオブジェクト**が新しいIDで作られる
- 新パッケージは元のパッケージに「リンク」される
- **関数**は新パッケージIDで呼び出す
- **struct（型）**はオリジナルのパッケージIDのまま変わらない

これは型の一貫性を保つための設計だが、フロントエンド開発者にとっては直感に反する。

## 修正

```diff
- filter: { StructType: `${PACKAGE_ID}::platform::Profile` }
+ filter: { StructType: `${ORIGINAL_PACKAGE_ID}::platform::Profile` }
```

1行の修正で解決した。

## 教訓とチェックリスト

Suiでパッケージアップグレードを行う際のチェックリスト：

1. **関数の呼び出し**には最新のパッケージIDを使う
2. **`getOwnedObjects`のStructTypeフィルタ**にはオリジナル（v1）のパッケージIDを使う
3. **Enokiのallowlist**に新パッケージIDの関数を登録する（zkLogin + ガススポンサーを使っている場合）
4. フロントエンドで`PACKAGE_ID`と`ORIGINAL_PACKAGE_ID`を明確に分けて管理する

```typescript
// こう管理すると事故が減る
export const PACKAGE_ID = "0x036ef...";          // 関数呼び出し用
export const ORIGINAL_PACKAGE_ID = "0x2a0120c..."; // 型フィルタ用
```

## 補足: Enoki allowlistも忘れずに

パッケージアップグレード後にzkLoginユーザーだけ操作が失敗する場合、Enokiダッシュボードの**Allowed Move Call Targets**を確認すること。新パッケージIDの関数が登録されていないと、スポンサードトランザクションが`invalid_transaction`で拒否される。

これもパッケージアップグレード時に毎回発生する作業なので、デプロイスクリプトに組み込むか、チェックリストに入れておくべき。
