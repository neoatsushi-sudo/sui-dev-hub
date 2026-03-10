## はじめに

ブロックチェーン開発に興味はあるけれど、どこから始めればいいかわからない。Solidity は聞いたことがあるけれど、Sui Move は初めて。そんな方に向けて、この記事では Sui Move の基礎を実践的なコード例とともに解説します。

Sui Move が注目される理由は明確です。

- **オブジェクト中心のモデル**: 従来のブロックチェーンがグローバルな状態ツリーを共有するのに対し、Sui はすべてをオブジェクトとして扱います。NFT、トークン、ゲームアイテム、どれもオブジェクトです。
- **並列実行**: オブジェクト同士が独立しているため、トランザクションを並列処理できます。これが Sui の圧倒的なスループットの秘密です。
- **安全性**: Move 言語はリソースの二重使用やダングリング参照をコンパイル時に防止します。「うっかりトークンを消失させる」といったバグが構造的に起きません。
- **所有権モデル**: 誰がオブジェクトを所有しているかがプロトコルレベルで管理されるため、アクセス制御のロジックがシンプルになります。

この記事を読み終える頃には、Sui Move でスマートコントラクトを書き、テストし、デプロイする一連の流れが理解できるようになります。


## 前提条件

### Sui CLI のインストール

Sui Move の開発には `sui` CLI が必要です。以下のいずれかの方法でインストールしてください。

**Homebrew（macOS / Linux）:**

```bash
brew install sui
```

**Cargo（Rust がインストール済みの場合）:**

```bash
cargo install --locked --git https://github.com/MystenLabs/sui.git --branch testnet sui
```

**Windows:**

公式リリースページ（https://github.com/MystenLabs/sui/releases）からバイナリをダウンロードするか、WSL2 環境で上記の方法を使ってください。

インストール後、バージョンを確認します。

```bash
sui --version
# sui 1.x.x のように表示されればOK
```

### プロジェクトの作成

新しい Move プロジェクトを作成します。

```bash
sui move new my_first_contract
cd my_first_contract
```

これで以下のディレクトリ構造が生成されます。

```
my_first_contract/
├── Move.toml          # パッケージ設定
├── sources/           # Move ソースコード
│   └── my_first_contract.move
└── tests/             # テストコード
```

`Move.toml` を開くと、エディションが `2024.beta` に設定されていることを確認できます。この記事のコード例はすべて edition 2024 の構文を使います。


## Move の基本概念

Sui Move を理解するために、3つの核となる概念を押さえましょう。

### オブジェクト（Object）

Sui においてオンチェーンに存在するデータはすべて「オブジェクト」です。各オブジェクトは一意の ID を持ち、所有者が存在します。

```move
public struct Greeting has key, store {
    id: UID,
    message: vector<u8>,
}
```

`key` アビリティを持つ構造体はオンチェーンオブジェクトになります。`id: UID` フィールドは必須で、Sui ランタイムがオブジェクトを識別するために使います。

### 所有権（Ownership）

Sui のオブジェクトには3種類の所有形態があります。

| 所有形態 | 説明 | 例 |
|---------|------|-----|
| **アドレス所有** | 特定のアドレスだけが操作可能 | ウォレット内の NFT |
| **共有オブジェクト** | 誰でもトランザクションで参照可能 | DEX の流動性プール |
| **不変オブジェクト** | 一度作ったら変更不可 | パッケージ自体 |

```move
// アドレス所有にする（特定のアドレスに転送）
transfer::transfer(obj, recipient);

// 共有オブジェクトにする（誰でもアクセス可能）
transfer::share_object(obj);

// 不変オブジェクトにする（以降変更不可）
transfer::freeze_object(obj);
```

### アビリティ（Abilities）

Move の型には4種類のアビリティを付与できます。

| アビリティ | 意味 |
|-----------|------|
| `key` | オンチェーンオブジェクトとして保存可能。`id: UID` が必須。 |
| `store` | 他のオブジェクトのフィールドに格納可能。`transfer::public_transfer` にも必要。 |
| `copy` | 値をコピーできる。デフォルトでは Move の値はムーブセマンティクス。 |
| `drop` | スコープ終了時に自動破棄される。これがないと明示的に処理が必要。 |

リソースの安全性を理解するポイントは `drop` です。`drop` アビリティを持たない構造体は、使い終わったら明示的に消費するか転送しなければコンパイルエラーになります。これにより、トークンやレシートが「うっかり消える」ことを防げます。


## 最初のスマートコントラクト

それでは実際にコードを書いてみましょう。「Greeting」オブジェクトを作成し、好きなメッセージを保存するシンプルなコントラクトです。

```move
module my_first_contract::greeting {

    // ===== オブジェクト定義 =====

    /// オンチェーンに保存される挨拶メッセージ
    public struct Greeting has key, store {
        id: UID,
        message: vector<u8>,
        author: address,
    }

    // ===== 公開関数 =====

    /// 新しい Greeting オブジェクトを作成し、送信者に転送する
    public fun create(message: vector<u8>, ctx: &mut TxContext) {
        let greeting = Greeting {
            id: object::new(ctx),
            message,
            author: ctx.sender(),
        };
        transfer::transfer(greeting, ctx.sender());
    }

    /// メッセージを更新する（所有者のみ実行可能）
    public fun update_message(greeting: &mut Greeting, new_message: vector<u8>) {
        greeting.message = new_message;
    }

    /// Greeting オブジェクトを削除する
    public fun destroy(greeting: Greeting) {
        let Greeting { id, message: _, author: _ } = greeting;
        object::delete(id);
    }

    // ===== ビュー関数 =====

    /// メッセージを取得する
    public fun message(greeting: &Greeting): &vector<u8> {
        &greeting.message
    }

    /// 作成者のアドレスを取得する
    public fun author(greeting: &Greeting): address {
        greeting.author
    }
}
```

このコントラクトのポイントを解説します。

### モジュール宣言

```move
module my_first_contract::greeting {
```

`パッケージ名::モジュール名` の形式で宣言します。1つのパッケージに複数のモジュールを含めることができます。edition 2024 では、`use` 文を省略しても `sui::object`、`sui::transfer`、`sui::tx_context` などの基本モジュールが自動的にインポートされます。

### オブジェクトの作成

```move
let greeting = Greeting {
    id: object::new(ctx),
    message,
    author: ctx.sender(),
};
```

`object::new(ctx)` で新しい一意の ID を生成します。`ctx.sender()` はトランザクションの送信者アドレスを返します。edition 2024 では `tx_context::sender(ctx)` の代わりにメソッド構文 `ctx.sender()` が使えます。

### 所有権の移転

```move
transfer::transfer(greeting, ctx.sender());
```

作成したオブジェクトを送信者のアドレスに転送します。`transfer::transfer` は `key` アビリティを持つオブジェクトを特定アドレスに送る関数です。`store` アビリティも持っている場合は `transfer::public_transfer` も使えます。


## オブジェクト操作

もう少し実践的な例として、シンプルなカウンターを実装してみましょう。共有オブジェクトの使い方を学べます。

```move
module my_first_contract::counter {

    // ===== エラーコード =====
    const ENotOwner: u64 = 1;

    // ===== オブジェクト定義 =====

    /// 共有カウンター。誰でもインクリメントできるが、リセットはオーナーのみ。
    public struct Counter has key {
        id: UID,
        value: u64,
        owner: address,
    }

    // ===== 初期化 =====

    /// カウンターを作成し、共有オブジェクトとして公開する
    public fun create_shared(ctx: &mut TxContext) {
        let counter = Counter {
            id: object::new(ctx),
            value: 0,
            owner: ctx.sender(),
        };
        // 共有オブジェクトにすると、誰でもトランザクションで参照できる
        transfer::share_object(counter);
    }

    // ===== 公開関数 =====

    /// カウンターを1増やす（誰でも実行可能）
    public fun increment(counter: &mut Counter) {
        counter.value = counter.value + 1;
    }

    /// カウンターの値を指定した分だけ増やす
    public fun increment_by(counter: &mut Counter, amount: u64) {
        counter.value = counter.value + amount;
    }

    /// カウンターをリセットする（オーナーのみ）
    public fun reset(counter: &mut Counter, ctx: &TxContext) {
        assert!(counter.owner == ctx.sender(), ENotOwner);
        counter.value = 0;
    }

    // ===== ビュー関数 =====

    /// 現在の値を取得する
    public fun value(counter: &Counter): u64 {
        counter.value
    }
}
```

### 共有オブジェクトのポイント

`transfer::share_object(counter)` を呼ぶと、そのオブジェクトは共有オブジェクトになります。共有オブジェクトには重要な特性があります。

- **誰でもトランザクションで参照できる**: `increment` 関数は `&mut Counter` を受け取りますが、所有権チェックはありません。共有オブジェクトなので、任意のアドレスからミュータブル参照を取得できます。
- **一度共有したら戻せない**: 共有オブジェクトをアドレス所有に戻すことはできません。設計時に慎重に判断しましょう。
- **コンセンサスが必要**: 共有オブジェクトへの書き込みは Sui のコンセンサスプロトコルを経由するため、アドレス所有オブジェクトの操作より若干遅くなります。

### アクセス制御パターン

```move
public fun reset(counter: &mut Counter, ctx: &TxContext) {
    assert!(counter.owner == ctx.sender(), ENotOwner);
    counter.value = 0;
}
```

`assert!` マクロで条件を検証し、失敗時にはエラーコード `ENotOwner` で中断します。Sui Move では数値のエラーコードを使うのが慣例です。エラーコードを定数として定義しておくと、フロントエンドでのエラーハンドリングが楽になります。


## テストの書き方

Move にはビルトインのテストフレームワークがあります。`#[test]` アトリビュートを関数に付けるだけでテスト関数になります。

```move
#[test_only]
module my_first_contract::greeting_tests {
    use my_first_contract::greeting;

    #[test]
    fun test_create_and_read() {
        // テスト用のシナリオを作成
        let mut ctx = tx_context::dummy();

        // Greeting を作成
        let msg = b"Hello, Sui!";
        let greeting = greeting::Greeting {
            id: object::new(&mut ctx),
            message: msg,
            author: ctx.sender(),
        };

        // メッセージを検証
        assert!(*greeting::message(&greeting) == b"Hello, Sui!");
        assert!(greeting::author(&greeting) == ctx.sender());

        // テスト後にオブジェクトを破棄
        greeting::destroy(greeting);
    }

    #[test]
    fun test_update_message() {
        let mut ctx = tx_context::dummy();

        let mut greeting = greeting::Greeting {
            id: object::new(&mut ctx),
            message: b"Original",
            author: ctx.sender(),
        };

        // メッセージを更新
        greeting::update_message(&mut greeting, b"Updated!");
        assert!(*greeting::message(&greeting) == b"Updated!");

        greeting::destroy(greeting);
    }
}
```

### テストのポイント

**`#[test_only]` モジュール**: テスト専用のモジュールに `#[test_only]` を付けると、本番ビルドには含まれません。テストヘルパー関数やモックもここに定義できます。

**`tx_context::dummy()`**: テスト用のダミートランザクションコンテキストを生成します。実際のブロックチェーン環境をシミュレートします。

**オブジェクトの破棄**: テスト終了時にオブジェクトを破棄しないとコンパイルエラーになります。`drop` アビリティを持たないオブジェクトは `destroy` 関数を呼ぶか、`sui::test_utils::destroy` を使って明示的に破棄する必要があります。

カウンターのテストも見てみましょう。

```move
#[test_only]
module my_first_contract::counter_tests {
    use my_first_contract::counter;
    use sui::test_utils;

    #[test]
    fun test_increment() {
        let mut ctx = tx_context::dummy();

        let mut ctr = counter::Counter {
            id: object::new(&mut ctx),
            value: 0,
            owner: ctx.sender(),
        };

        // 3回インクリメント
        counter::increment(&mut ctr);
        counter::increment(&mut ctr);
        counter::increment(&mut ctr);
        assert!(counter::value(&ctr) == 3);

        // 指定値でインクリメント
        counter::increment_by(&mut ctr, 10);
        assert!(counter::value(&ctr) == 13);

        // テストオブジェクトの破棄（test_utils::destroy は任意の型を破棄可能）
        test_utils::destroy(ctr);
    }

    #[test]
    fun test_reset_by_owner() {
        let mut ctx = tx_context::dummy();

        let mut ctr = counter::Counter {
            id: object::new(&mut ctx),
            value: 0,
            owner: ctx.sender(),
        };

        counter::increment_by(&mut ctr, 42);
        assert!(counter::value(&ctr) == 42);

        // オーナーがリセット
        counter::reset(&mut ctr, &ctx);
        assert!(counter::value(&ctr) == 0);

        test_utils::destroy(ctr);
    }

    #[test]
    #[expected_failure(abort_code = counter::ENotOwner)]
    fun test_reset_by_non_owner_fails() {
        let mut ctx = tx_context::dummy();

        let mut ctr = counter::Counter {
            id: object::new(&mut ctx),
            value: 0,
            owner: @0xCAFE,  // オーナーは別アドレス
        };

        counter::increment(&mut ctr);

        // 送信者（dummy の @0x0）はオーナーではないので失敗するはず
        counter::reset(&mut ctr, &ctx);

        test_utils::destroy(ctr);
    }
}
```

### テスト実行

```bash
sui move test
```

出力例:

```
Running Move unit tests
[ PASS    ] my_first_contract::greeting_tests::test_create_and_read
[ PASS    ] my_first_contract::greeting_tests::test_update_message
[ PASS    ] my_first_contract::counter_tests::test_increment
[ PASS    ] my_first_contract::counter_tests::test_reset_by_owner
[ PASS    ] my_first_contract::counter_tests::test_reset_by_non_owner_fails
Test result: OK. Total tests: 5; passed: 5; failed: 0
```

`#[expected_failure]` アトリビュートを使えば、特定のエラーコードで失敗することを検証できます。これは異常系テストを書くときに非常に便利です。


## 発展的なトピック

ここまでの基礎を踏まえて、実際のプロダクション開発で使われるパターンをいくつか紹介します。

### イベント（Event）

オフチェーンのインデクサーやフロントエンドにデータを通知するには、イベントを発行します。

```move
use sui::event;

public struct GreetingCreated has copy, drop {
    greeting_id: ID,
    author: address,
    message: vector<u8>,
}

public fun create_with_event(message: vector<u8>, ctx: &mut TxContext) {
    let greeting = Greeting {
        id: object::new(ctx),
        message,
        author: ctx.sender(),
    };

    // イベントを発行
    event::emit(GreetingCreated {
        greeting_id: object::id(&greeting),
        author: ctx.sender(),
        message,
    });

    transfer::transfer(greeting, ctx.sender());
}
```

イベント用の構造体には `copy` と `drop` アビリティが必要です。`key` は不要です（オンチェーンオブジェクトではないため）。

### Coin の扱い

SUI トークンの送受信は `Coin<SUI>` オブジェクトで行います。

```move
use sui::coin::{Self, Coin};
use sui::sui::SUI;

/// SUI を受け取って処理する例
public fun donate(payment: Coin<SUI>, recipient: address) {
    // Coin の残高を確認
    let amount = coin::value(&payment);
    assert!(amount > 0, 0);

    // そのまま転送
    transfer::public_transfer(payment, recipient);
}
```

`Coin<SUI>` は `store` アビリティを持つので `public_transfer` で転送できます。`coin::value` で残高（MIST 単位、1 SUI = 1,000,000,000 MIST）を取得できます。

### Dynamic Fields

オブジェクトに動的にフィールドを追加するパターンです。コンパイル時に構造体を変更せず、実行時にキーバリューペアを追加・削除できます。

```move
use sui::dynamic_field;

public struct Registry has key {
    id: UID,
}

/// 動的フィールドとしてデータを追加
public fun register(registry: &mut Registry, name: vector<u8>, value: u64) {
    dynamic_field::add(&mut registry.id, name, value);
}

/// 動的フィールドの存在チェック
public fun is_registered(registry: &Registry, name: vector<u8>): bool {
    dynamic_field::exists_(&registry.id, name)
}
```

Dynamic Fields はアップグレード可能なコントラクトで特に威力を発揮します。既存の構造体を変更せずに新しいデータを付加できるため、互換性を保ったままの機能拡張が可能です。


## まとめ

この記事では Sui Move の基礎を一通り学びました。

- **オブジェクトモデル**: `key` と `store` アビリティ、UID によるオブジェクト管理
- **所有権**: アドレス所有、共有オブジェクト、不変オブジェクトの使い分け
- **関数の書き方**: `&T`（読み取り）、`&mut T`（変更）、`T`（消費）の参照パターン
- **アクセス制御**: `assert!` とエラーコードによるガード
- **テスト**: `#[test]` と `#[expected_failure]` による単体テスト
- **発展パターン**: イベント、Coin 操作、Dynamic Fields

Sui Move の最大の特徴は、リソースの安全性がコンパイル時に保証されることです。Solidity で頻繁に発生するリエントランシー攻撃や、トークンの消失バグは、Move の型システムが構造的に防止します。

次のステップとしておすすめのリソースを紹介します。

- **Sui 公式ドキュメント**: https://docs.sui.io - コンセプトから API リファレンスまで網羅的
- **Move Book**: https://move-book.com - Move 言語の詳細な解説
- **Sui Examples**: https://github.com/MystenLabs/sui/tree/main/examples - 公式のサンプルコード集
- **Sui Dev Hub**: https://sui-dev-hub-tau.vercel.app - 実際のプロダクションコードを読めるオープンソースプラットフォーム

最初はシンプルなオブジェクトの作成から始めて、徐々に共有オブジェクトや Dynamic Fields を使った複雑なパターンに進んでいくのがおすすめです。Sui のオブジェクト中心のモデルに慣れると、従来のアカウントベースのブロックチェーンとはまったく違う設計の自由度が得られます。

ぜひ手を動かして、最初のスマートコントラクトをテストネットにデプロイしてみてください。
