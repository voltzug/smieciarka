SET search_path TO audit;

-- event
CREATE TYPE e_item_event_type AS ENUM (
  'CREATE_ITEM',
  'TRANSFER_ITEM',
  'BURN_ITEM',

  'MOD_ITEM_SN',
  'MOD_ITEM_DETAILS',

  'REGISTER_OFFER',
  'CANCEL_OFFER',
  'PLACE_BID',
  'CANCEL_BID',
  'RESERVE_OFFER',
  'WIN_OFFER'
);
