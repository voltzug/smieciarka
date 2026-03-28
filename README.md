# smieciarka
SN-based second-hand electronics trading platform focused on **traceable item history** and **database-level integrity**.

> [!NOTE]
> uses _PostgreSQL_ 16 with `pgcrypto` extension

Shields: [![PostgreSQL 16][pg-shield]][pg]  [![BSD 3-Clause License][bsd-shield]][bsd]

[pg]: https://www.postgresql.org/
[pg-shield]: https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql
[bsd]: https://opensource.org/licenses/BSD-3-Clause
[bsd-shield]: https://img.shields.io/badge/License-BSD%203--Clause-blue?logo=bsd


## Idea
`smieciarka` is designed for marketplaces where each listed electronic device is anchored by a serial number (`SN`) and linked to an auditable event chain.

The core intention is to model and protect:
- user identity and profile consistency
- item identity (_SN_ based) and controlled mutations
- offer/bid negotiation lifecycle
- immutable item-level audit history

Rather than tracking every real-world event around a device, the system tracks **platform transaction history** and state transitions that matter for trust and dispute analysis.


## Functionalities overview
### User lifecycle
- Register user account with uniqueness on login
- Store hashed user-related data for integrity checks
- Change password through controlled routines
- Change email through controlled routines (with integrity hash refresh)
- Deactivate user account with cleanup/deactivation logic

### Item lifecycle
- Register item with unique serial number (`SN`)
- Keep item state (`CREATED`, `VERIFIED`, `BURNT`)
- Update serial number through controlled routines with audit event append
- Update selected item details through controlled routines with audit event append

### Seller flow
- Attach owned item to a market offer
- Maintain offer state flow (`ACTIVE`, `RESERVED`, `PENDING_TRANSACTION`, `CLOSED`)
- Support offer cancellation with business constraints and related bid effects

### Buyer flow
- Place bid on active offers
- Enforce bid-level constraints and status transitions
- Allow controlled cancellation based on offer/bid state rules

### Conversation flow
- Store comments associated with offer/bid context
- Support negotiation before and after bid placement, depending on role and process state

### Audit and traceability
- Initialize per-item chain ledger
- Append item events as state-changing operations occur
- Protect ledger integrity with constraints and trigger-based anti-tampering checks
- Provide chain verification routines for maintenance and forensic validation


## Intentions

> [!IMPORTANT]
> The system is intentionally implemented with strong database-side logic (types, constraints, functions, triggers).  
> This minimizes invalid state transitions regardless of client implementation details.

The database is expected to enforce:
- uniqueness and relational consistency
- legal state transitions
- append-only style behavior for audit trails
- restricted direct writes in sensitive domains

### Assumptions not handled by DB
- Real-world proof that seller physically owns the device
- SN verification against manufacturer or external databases
- Off-platform transaction settlement guarantees
- Fraud detection based on behavioral analytics
- Legal/tax compliance for specific jurisdictions
- Message content moderation and abuse handling policy


## Scope boundaries
### In scope
- Data model and relational consistency
- Domain rules encoded as SQL-level functions/triggers
- Auditable event history for item mutations and market actions
- Maintenance routines for integrity and cleanup

### Out of scope
- Payment processing implementation
- Shipment/logistics orchestration
- Notification delivery
- Identity verification providers and KYC workflows

---

## Map
- [ERD specification and schema implementation details](docs/README.md)
- [SQL source](db/) folders
- [CI Containers](ci/)
- [Simple web API](test/) for testing purposes


## License

<a rel="license" href="https://spdx.org/licenses/BSD-3-Clause.html"><img alt="BSD 3-Clause License" height=47px style="border-width:0" src="https://simpleicons.org/icons/bsd.svg" /></a><br>This work is licensed under the <a rel="license" href="https://opensource.org/licenses/BSD-3-Clause">BSD 3-Clause License</a>.
