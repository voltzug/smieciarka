- [x] script
- [x] erd
- [x] seed
- [x] test web API


## users
- [x] ALL
  - [x] prevent direct users/items/offers update
  - [x] prevent direct item_ledger insert/update/delete
- [x] elephant (safe internal without login for functions)
- [x] moder
- [x] app
  - [x] prevent calling private functions (start with `_`)
- [x] app_test


## core
- [x] users
  - [x] uq login
  - [x] hash_data
  - [x] functions
    - [x] `_user_data_hash` -|no-side-eff|-> bytea
    - [x] `create_user` (calls `_user_data_hash`, `data._init_user_details`)
    - [x] `change_user_password`
    - [x] `change_user_email` (calls `_user_data_hash`, `data._change_user_email`)
    - [x] `deactivate_user` (status = 'DELETED', deactivate password, delete user_details)
  - [x] types
    - [x] e_user_status: PENDING (default), ACTIVE, DELETED

- [x] items
  - [x] uq sn
  - [x] functions
    - [x] `_item_hash` -|time-dependent|-> bytea
    - [x] `create_item` (generete genesis_hash, calls `audit._init_item_chain`)
    - [x] `change_item_sn` (calls `audit.append_item_event` MOD_ITEM_SN)
    - [x] `change_item_details` (calls `audit.append_item_event` MOD_ITEM_DETAILS for title, value)
  - [x] types
    - [x] e_item_status: CREATED (default), VERIFIED, BURNT
    - [x] t_created_updated: 2x timestamptz


## data
- [x] user_details
  - [x] uq email
  - [x] functions
    - [x] `_init_user_details`
    - [x] `_change_user_email`
    - [x] `change_user_details` (without email)

- [x] offers
  - [x] constraints
    - [x] 1 offer per 1 user-item
    - [x] price > 0
  - [x] functions
    - [x] `register_item_offer` (checks for existing with CLOSED status and update OR insert new, calls `audit.append_item_event` REGISTER_OFFER)
    - [x] `cancel_item_offer` (allow cancelling only ACTIVE/RESERVED offers, cascade cancel related bids, calls `audit.append_item_event` CANCEL_OFFER)
  - [x] types
    - [x] e_offer_status: ACTIVE (default), RESERVED, PENDING_TRANSACTION, CLOSED

- [x] bids
  - [x] constraints
    - [x] 1 bid per 1 user-offer (bidder only can update value for existing bid)
    - [x] cascade bids on offer deletion
  - [x] functions
    - [x] `place_item_bid` (allow placing only on ACTIVE offers, calls `audit.append_item_event` PLACE_BID)
    - [x] `cancel_item_bid` (allow cancelling only PENDING bid AND on ACTIVE/RESERVED offers, calls `audit.append_item_event` CANCEL_BID)
  - [x] triggers
    - [x] `trg_validate_bid_value_ge_offer_price` (value >= offer.price)
  - [x] types
    - [x] e_bid_status: PENDING (default), CANCELLED, FINISHED

- [x] conversations
  - [x] constraints
    - [x] cascade conversations on offer deletion
  - [x] functions
    - [x] `comment_item_offer`


## audit
- [x] constraints
  - [x] uq indexes `uq_IL_standard_prev_id` and `uq_IL_genesis_item_id`
- [x] funstions
  - [x] `_chain_hash` -|no-side-eff|-> bytea
  - [x] `_init_item_chain`
  - [x] `append_item_event`
- [ ] triggers
  - [x] `trg_protect_item_ledger_update`
  - [x] `trg_protect_item_ledger_delete`
  - [ ] `trg_protect_item_ledger_insert` [defined but not enabled]
- [x] types
  - [x] `e_item_event_type`


## maintainance
- [x] cleanup
  - [x] offers (+bids+conversations)
    - [x] `mc_drop_offers` (cascade delete offers where .status=='CLOSED' AND .stamp.updated_at is older that certain date)
- [x] integrity
  - [x] item_ledger
    - [x] `mi_verify_item_chain` -> boolean
