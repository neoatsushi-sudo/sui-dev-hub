# デプロイ手順ガイド

テストネットへのコントラクトデプロイを安全に実行するためのガイド。

## デプロイ前チェック

以下をすべて確認してから進める：

1. `sui move build` - ビルド成功
2. `sui move test` - テスト全通過
3. `git status` - 未コミットの変更がないことを確認
4. `git diff` - 意図しない変更がないことを確認

## デプロイ実行

**必ずユーザーに確認してから実行すること。**

```bash
sui client upgrade --upgrade-capability 0xd3e3941278e748fa856e6e23178976ce10ef0722c7f11b12ca120d7b0c1d6797
```

## デプロイ後の更新（3箇所必須）

新しい Package ID を取得したら、以下を更新：

1. **CLAUDE.md** (ルート) - `Package ID vXX (最新)` の値
2. **web/lib/sui.ts** - `PACKAGE_ID` の値
3. **contracts/Published.toml** - `published-at` の値

```bash
# 更新後にビルド確認
cd web && npm run build
cd contracts && sui move build
```

## 注意事項

- UpgradeCapはチェーン管理（v1→...→v13→v14）
- Published.toml の `published-at` が Move.toml より優先される
- compatible upgrade: 既存 public 関数のシグネチャ変更不可
