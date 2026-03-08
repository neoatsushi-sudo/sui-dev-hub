module sui_content_platform::platform {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;

    // ===== Errors =====
    const ENotAuthor: u64 = 1;
    const EInsufficientTip: u64 = 2;

    // ===== Objects =====

    public struct Profile has key, store {
        id: UID,
        owner: address,
        username: vector<u8>,
        bio: vector<u8>,
        total_earned: u64,
    }

    public struct Post has key, store {
        id: UID,
        author: address,
        title: vector<u8>,
        content_hash: vector<u8>,  // Walrus blob ID
        tip_balance: u64,
        created_at: u64,
    }

    // ===== Events =====

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

    // ===== Functions =====

    public fun create_profile(
        username: vector<u8>,
        bio: vector<u8>,
        ctx: &mut TxContext,
    ): Profile {
        Profile {
            id: object::new(ctx),
            owner: ctx.sender(),
            username,
            bio,
            total_earned: 0,
        }
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
        // tips are sent directly to author in tip(), so nothing to withdraw here
        // this function is for future use with escrow pattern
    }

    // ===== View Functions =====

    public fun get_post_info(post: &Post): (address, vector<u8>, u64) {
        (post.author, post.title, post.tip_balance)
    }
}
