-- pgbench audit chain verify + append (hardened)
SET search_path TO audit, core, data, pg_temp;

-- scalable range
\set items_max greatest(1, 100000 * :scale)

-- pick random item (best-effort by id)
\set item_id random(1, :items_max)
\set i_id 0
\set i_creator_id 0
\set i_ledger_head 0
SELECT i.id, i.creator_id, i.ledger_head
  FROM core.items i
 WHERE i.id >= :item_id
   AND i.ledger_head IS NOT NULL
 ORDER BY i.id
 LIMIT 1
\gset i_

\if :i_id is null
SELECT i.id, i.creator_id, i.ledger_head
  FROM core.items i
 WHERE i.id < :item_id
   AND i.ledger_head IS NOT NULL
 ORDER BY i.id DESC
 LIMIT 1
\gset i_
\endif

BEGIN;

-- ensure we have valid item + ledger_head
\if :i_id = 0 or :i_ledger_head = 0
  ROLLBACK;
\else
  -- verify chain before (force numeric for pgbench \if)
  SELECT CASE WHEN audit.mi_verify_item_chain(:i_id) THEN 1 ELSE 0 END AS chain_ok \gset

  \if :chain_ok = 1
    -- append event via dedicated function (item detail change)
    \set r random(1, 1000000000)
    SELECT format('Bench %s-%s', :client_id, :r) AS new_title \gset
    SELECT core.change_item_details(:i_id, ':new_title', :i_creator_id);

    -- verify chain after (force numeric)
    SELECT CASE WHEN audit.mi_verify_item_chain(:i_id) THEN 1 ELSE 0 END AS chain_ok2 \gset

    \if :chain_ok2 = 1
      COMMIT;
    \else
      ROLLBACK;
    \endif
  \else
    ROLLBACK;
  \endif
\endif
