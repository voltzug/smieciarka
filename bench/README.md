# smieczarka + pgbench

> [!TIP]
> see [official docs](https://www.postgresql.org/docs/current/pgbench.html)

## start
- spin up bench container
  - `-c` – client count
  - `-j` – threads
  - `-T` – duration
  - `-n` – no vacuum

```sh
cd ci/
podman run --name ci_bench_1 --rm -it --network ci_db_net -v ../db:/home \
  postgres:16 \
  pgbench -n -h db -U ${TEST_USER} -c 9 -j 2 -T 30 -f /home/data/TEST.sql smieczarka
```

> [!NOTE]
> [here are results](results/) for different machines

## strategy
### core
- 30% create user via `core.create_user`
- 30% create item via `core.create_item`
- 40% search: offers by item sn/title, list user bids, list user offers

### data
- 0-19 register offer (seller) via `data.register_item_offer`
- 20-34 cancel offer via `data.cancel_item_offer`
- 35-54 place bid (buyer) via `data.place_item_bid`
- 55-64 cancel bid (buyer) via `data.cancel_item_bid`
- ~~65-74 reserve offer~~
- ~~75-84 win offer~~
- 85-99 comment noise via `data.comment_item_offer`

### audit
- pick random item with `ledger_head`
- verify chain via `audit.mi_verify_item_chain`
- append event via `core.change_item_details`
- verify again, commit if ok else rollback
