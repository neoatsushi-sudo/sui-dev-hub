module sui_content_platform::platform {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;

    // ===== Errors =====
    const ENotAuthor: u64 = 1;
    const EInsufficientTip: u64 = 2;
    const EInsufficientPayment: u64 = 3;
    const EPremiumAlreadyFree: u64 = 4;

    // ===== Constants =====
    // Default premium price: 0.5 SUI
    const DEFAULT_PREMIUM_PRICE_MIST: u64 = 500_000_000;

    // ===== Objects =====

    public struct Profile has key, store {
        id: UID,
        owner: address,
        username: vector<u8>,
        bio: vector<u8>,
        total_earned: u64,
    }

    // Original Post struct preserved (compatible upgrade)
    public struct Post has key, store {
        id: UID,
        author: address,
        title: vector<u8>,
        content_hash: vector<u8>,  // Walrus blob ID for full content
        tip_balance: u64,
        created_at: u64,
    }

    // NEW v3: Comment Object
    public struct Comment has key, store {
        id: UID,
        post_id: ID,
        author: address,
        content: vector<u8>,
        created_at: u64,
    }

    // NEW v3: Like receipt (one per liker per post)
    public struct LikeReceipt has key, store {
        id: UID,
        post_id: ID,
        from: address,
    }

    // NEW v5: Premium content unlock receipt
    // Owning this object proves payment was made to read premium content
    public struct PremiumUnlock has key, store {
        id: UID,
        post_id: ID,
        unlocked_by: address,
    }

    // NEW v5: Premium post price info (stored off-chain - contract just handles payments)
    // Author calls set_premium_price to store price, readers call unlock_premium to pay
    public struct PremiumConfig has key, store {
        id: UID,
        post_id: ID,
        author: address,
        price_mist: u64,  // price in MIST (1 SUI = 1_000_000_000 MIST)
    }

    // NEW v6: Revenue Sharing config
    // Stores the co-authors and their share in basis points (100 = 1%, 10000 = 100%)
    // e.g., co_authors = [alice, bob], shares = [7000, 3000] means 70% to alice, 30% to bob
    public struct CoAuthorConfig has key, store {
        id: UID,
        post_id: ID,
        primary_author: address,   // must be the Post.author
        co_authors: vector<address>,
        shares_bps: vector<u64>,   // basis points, must sum to 10000
    }

    // ===== Events =====

    public struct ProfileCreated has copy, drop {
        profile_id: ID,
        owner: address,
        username: vector<u8>,
    }

    public struct ProfileUpdated has copy, drop {
        profile_id: ID,
        owner: address,
        username: vector<u8>,
    }

    public struct PostCreated has copy, drop {
        post_id: ID,
        author: address,
        title: vector<u8>,
    }

    public struct TipSent has copy, drop {
        post_id: ID,
        from: address,
        to: address,
        amount: u64,
    }

    public struct PostDeleted has copy, drop {
        post_id: ID,
        author: address,
    }

    // v3 Events
    public struct PostLiked has copy, drop {
        post_id: ID,
        from: address,
    }

    public struct CommentCreated has copy, drop {
        comment_id: ID,
        post_id: ID,
        author: address,
    }

    // v5 Events
    public struct PremiumLocked has copy, drop {
        post_id: ID,
        author: address,
        price_mist: u64,
    }

    public struct PremiumUnlocked has copy, drop {
        post_id: ID,
        unlocked_by: address,
        amount_paid: u64,
    }

    // v6 Events
    public struct CoAuthorConfigSet has copy, drop {
        config_id: ID,
        post_id: ID,
        primary_author: address,
        co_authors: vector<address>,
        shares_bps: vector<u64>,
    }

    public struct RevenueSplit has copy, drop {
        post_id: ID,
        from: address,
        total_amount: u64,
    }

    // ===== Functions =====


    public fun create_profile(
        username: vector<u8>,
        bio: vector<u8>,
        ctx: &mut TxContext,
    ): Profile {
        let profile_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&profile_id);
        let profile = Profile {
            id: profile_id,
            owner: ctx.sender(),
            username: username,
            bio: bio,
            total_earned: 0,
        };
        event::emit(ProfileCreated {
            profile_id: id_copy,
            owner: ctx.sender(),
            username: profile.username,
        });
        profile
    }

    public fun edit_profile(
        profile: &mut Profile,
        new_username: vector<u8>,
        new_bio: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(profile.owner == ctx.sender(), ENotAuthor);
        profile.username = new_username;
        profile.bio = new_bio;
        event::emit(ProfileUpdated {
            profile_id: object::id(profile),
            owner: ctx.sender(),
            username: profile.username,
        });
    }

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

    // v3: Like a post
    public fun like_post(
        post: &Post,
        ctx: &mut TxContext,
    ) {
        let like_id = object::new(ctx);
        let receipt = LikeReceipt {
            id: like_id,
            post_id: object::id(post),
            from: ctx.sender(),
        };
        event::emit(PostLiked {
            post_id: object::id(post),
            from: ctx.sender(),
        });
        transfer::transfer(receipt, ctx.sender());
    }

    // v3: Comment on a post
    public fun add_comment(
        post: &Post,
        content: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let comment_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&comment_id);
        let comment = Comment {
            id: comment_id,
            post_id: object::id(post),
            author: ctx.sender(),
            content,
            created_at: ctx.epoch(),
        };
        event::emit(CommentCreated {
            comment_id: id_copy,
            post_id: object::id(post),
            author: ctx.sender(),
        });
        transfer::share_object(comment);
    }

    // v5: Author locks a post as premium with a price
    public fun lock_as_premium(
        post: &Post,
        price_mist: u64,
        ctx: &mut TxContext,
    ) {
        assert!(post.author == ctx.sender(), ENotAuthor);
        let cfg_id = object::new(ctx);
        let cfg = PremiumConfig {
            id: cfg_id,
            post_id: object::id(post),
            author: ctx.sender(),
            price_mist,
        };
        event::emit(PremiumLocked {
            post_id: object::id(post),
            author: ctx.sender(),
            price_mist,
        });
        transfer::share_object(cfg);
    }

    // v5: Reader pays to unlock premium content, receives PremiumUnlock receipt
    public fun unlock_premium(
        cfg: &PremiumConfig,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount >= cfg.price_mist, EInsufficientPayment);
        // Transfer payment to author
        transfer::public_transfer(payment, cfg.author);

        // Issue unlock receipt to buyer
        let unlock_id = object::new(ctx);
        let receipt = PremiumUnlock {
            id: unlock_id,
            post_id: cfg.post_id,
            unlocked_by: ctx.sender(),
        };
        event::emit(PremiumUnlocked {
            post_id: cfg.post_id,
            unlocked_by: ctx.sender(),
            amount_paid: amount,
        });
        transfer::transfer(receipt, ctx.sender());
    }

    public fun tip(
        post: &mut Post,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EInsufficientTip);
        post.tip_balance = post.tip_balance + amount;
        event::emit(TipSent {
            post_id: object::id(post),
            from: ctx.sender(),
            to: post.author,
            amount,
        });
        transfer::public_transfer(payment, post.author);
    }

    public fun withdraw_tips(
        profile: &mut Profile,
        ctx: &mut TxContext,
    ) {
        assert!(profile.owner == ctx.sender(), ENotAuthor);
    }

    public fun delete_post(post: Post, ctx: &mut TxContext) {
        assert!(post.author == ctx.sender(), ENotAuthor);
        let Post { id, author, title: _, content_hash: _, tip_balance: _, created_at: _ } = post;
        event::emit(PostDeleted {
            post_id: object::uid_to_inner(&id),
            author,
        });
        object::delete(id);
    }

    // ===== View Functions =====
    public fun get_post_info(post: &Post): (address, vector<u8>, u64) {
        (post.author, post.title, post.tip_balance)
    }

    public fun premium_price(cfg: &PremiumConfig): u64 {
        cfg.price_mist
    }

    // v6: Author sets up revenue sharing among co-authors
    // shares_bps must sum to 10000 (basis points), one entry per co_author
    public fun set_coauthor_config(
        post: &Post,
        co_authors: vector<address>,
        shares_bps: vector<u64>,
        ctx: &mut TxContext,
    ) {
        assert!(post.author == ctx.sender(), ENotAuthor);
        assert!(vector::length(&co_authors) == vector::length(&shares_bps), ENotAuthor);

        // Validate shares sum to 10000 bps (= 100%)
        let mut total: u64 = 0;
        let mut i = 0;
        while (i < vector::length(&shares_bps)) {
            total = total + *vector::borrow(&shares_bps, i);
            i = i + 1;
        };
        assert!(total == 10000, ENotAuthor);

        let cfg_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&cfg_id);
        let shares_copy = copy shares_bps;
        let authors_copy = copy co_authors;
        let cfg = CoAuthorConfig {
            id: cfg_id,
            post_id: object::id(post),
            primary_author: ctx.sender(),
            co_authors,
            shares_bps,
        };
        event::emit(CoAuthorConfigSet {
            config_id: id_copy,
            post_id: object::id(post),
            primary_author: ctx.sender(),
            co_authors: authors_copy,
            shares_bps: shares_copy,
        });
        transfer::share_object(cfg);
    }

    // v6: Tip with automatic revenue sharing
    // Payment is automatically split between co-authors per their shares_bps
    public fun tip_with_sharing(
        post: &mut Post,
        cfg: &CoAuthorConfig,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        assert!(cfg.post_id == object::id(post), ENotAuthor);
        let total_amount = coin::value(&payment);
        assert!(total_amount > 0, EInsufficientTip);

        post.tip_balance = post.tip_balance + total_amount;

        event::emit(RevenueSplit {
            post_id: object::id(post),
            from: ctx.sender(),
            total_amount,
        });

        // Split and distribute to all co-authors
        let n = vector::length(&cfg.co_authors);
        let mut remaining = payment;
        let mut i = 0;
        while (i < n - 1) {
            let share_bps = *vector::borrow(&cfg.shares_bps, i);
            let amount = (total_amount * share_bps) / 10000;
            let split_coin = coin::split(&mut remaining, amount, ctx);
            let recipient = *vector::borrow(&cfg.co_authors, i);
            transfer::public_transfer(split_coin, recipient);
            i = i + 1;
        };
        // Send remainder to last co-author (collects any rounding dust)
        let last_recipient = *vector::borrow(&cfg.co_authors, n - 1);
        transfer::public_transfer(remaining, last_recipient);
    }
}
