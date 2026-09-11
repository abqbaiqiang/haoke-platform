# Project Task Status

## Planning / Design

- [x] PRD
- [x] Data sources & quality
- [x] Data dictionary
- [x] Metric dictionary
- [x] Page & permission matrix
- [x] Technical architecture
- [x] Physical database design
- [x] Development roadmap
- [x] Test & acceptance standard
- [x] Deployment / backup / operations
- [x] AGENTS.md
- [x] Codex start instruction

## Development

- [x] M0 implementation and native automated acceptance
- [ ] M0 Docker startup / container recreation / persistence acceptance — pending NAS or Docker host
- [ ] M0 business-user manual acceptance
- [x] M1 Data center implementation and native automated acceptance
- [ ] M1 business-user reconciliation and finance blank policy confirmation
- [x] M2 Lightweight CRM implementation, native automated acceptance and local delivery
- [ ] M2 business-user manual acceptance
- [x] M3 core sales workbench + sales BI implementation and local delivery
- [ ] M3 full milestone business acceptance and remaining follow-ups
- [ ] M4 Business/finance BI + risks — overview first screen delivered (see below); remaining M4 scope not started
- [ ] M5 Jingdouyun API / AI enhancements

## V1 usage simplification: owner + staff only — 2026-09-11 (ZCode)

User decision: the company runs with the owner and ordinary colleagues only; no manager/finance accounts are needed.

- [x] Owner now performs all day-to-day operations an admin would: data import/confirm, source and staff mapping, finance period confirmation, CRM settings, tag management, BI settings and sales review (backend-enforced; admin role kept for CLI recovery)
- [x] New staff account management (`/api/staff` + 人员管理 page, owner-only): create/edit/deactivate/reset password; Argon2id hashes; deactivation and password reset revoke live sessions; all changes audited
- [x] New staff accounts are sales role with strict self scope; browser-verified end-to-end: owner created account, new colleague signed in and saw only their own (empty) workspace
- [x] 5 new tests; suite total 187 passed; Ruff, TypeScript, production build, secret scan green
- [x] The five-role permission model in code/tests/docs is unchanged — this is a usage decision, not an architectural removal; manager/finance demo accounts remain available but unused

**Current gate:** M3_CORE_LOCAL_PASSED_BUSINESS_DOCKER_PENDING, M4_OVERVIEW_ONLY. On 2026-09-10 the user completed a manual bug-hunting pass (no major issues; UI/button feedback deferred) and authorized continued development. ZCode implemented the owner overview first screen (`/api/bi/overview` + homepage role-based overview per docs/05 §3.7): source sales reconciliation, finance result/balance cards, six-month trend; finance metrics visible only to owner/finance; no fake zeros. 182 pytest, Ruff, TypeScript, production build, browser secret scan, and live three-role browser verification (owner/sales/finance) passed. M4 purchase/inventory/receivable analysis, risk center and alert parameterization are NOT started (source data unverified). M1/M2/M3 manual acceptance, sales/finance policy decisions and Docker/NAS acceptance remain pending.

## M4 overview first screen — 2026-09-10 (ZCode)

- [x] `GET /api/bi/overview`: monthly source sales reconciliation, order/customer counts, MoM, finance revenue/margin/net profit/margins, cash/AR/inventory balances, cash MoM, six-month trend
- [x] Homepage now shows the owner overview instead of the placeholder welcome; sales/finance without visible data get guidance; admin keeps the management entry page
- [x] Metric catalog extended with 10 dictionary-exact entries; `test_metric_descriptions_match_dictionary` guards consistency
- [x] 4 new integration tests (fixed samples, role scope, zero-division → null, unconfirmed period warnings); 182 pytest total
- [x] Live browser verification: owner sees 228,684.00 / 53 orders / 29 customers from real imported data; sales and finance demo accounts correctly see no unauthorized figures
- [x] Verified by ZCode, not Codex; changes committed with test evidence in git history

## M0 verification — 2026-09-08

- [x] Next.js / FastAPI / worker / PostgreSQL skeleton
- [x] Login/logout, Argon2id, session expiry/revocation/rotation
- [x] Five primary roles and backend scope enforcement
- [x] Initial admin and explicit development demo account bootstrap
- [x] Empty PostgreSQL migration, round-trip migration and Alembic model comparison
- [x] 21 unit/deployment-static + 36 PostgreSQL integration/permission tests passed
- [x] 12 browser E2E cases passed (6 desktop + 6 mobile)
- [x] Ruff, TypeScript, frontend production build, browser-bundle secret scan
- [x] Local frontend/backend/worker startup and health verified
- [x] Dockerfiles, Compose, Caddy, persistent mounts and storage initialization prepared
- [x] README, backup/restore scripts, CI definition and Docker acceptance script
- [ ] Actual Docker image build/start/recreation/persistence — 待绿联 NAS/具备 Docker 环境后补验
- [ ] NAS HTTPS and backup/restore exercise — before production launch
- [ ] Remote CI execution — workflow supplied but not triggered

See `docs/13_M0验收报告.md` for evidence, limitations and startup instructions.

## Sample review / M1 preparation — 2026-09-08

- [x] Read-only review of five supplied Jingdouyun exports (customer/product/sales/supplier/purchase)
- [x] Verified workbook structure, source hashes, row partitions, code joins and Decimal reconciliation
- [x] Independently checked sales counts and amounts through OOXML
- [x] Private quality report and source-row review list in ignored `app-data/sample-review-20260908/`
- [x] M1 implementation plan in `docs/14_M1数据中心实施计划.md`
- [x] M1 implementation — see current acceptance below; historical read-only review is superseded
- [x] August 2026 profit/balance samples received and reviewed read-only
- [x] Finance period/unit/row-code mapping, arithmetic and formula-cache review; private supplemental report
- [ ] July finance samples for cross-month verification — may follow later
- [ ] Sales return/void/export-filter clarification

The historical review alone did not change the M0 gate. The subsequent authorized implementation and current results are recorded below. Existing Docker deferral remains in force.

Finance review evidence: 21 arithmetic checks (8 direct, 13 under an explicit blank-as-zero reconciliation scenario), 4 cached formulas independently checked, 18 numeric cells checked through OOXML, original hashes unchanged. Blanks remain null in source evidence. No application tests or database import were performed in this read-only follow-up.

## M1 implementation and native acceptance — 2026-09-08

- [x] Ten M1 tables and Alembic 0002_m1; existing accounts retained
- [x] File persistence, SHA256, XLS/XLSX/CSV bounds, immutable mapping/RAW/batch evidence
- [x] Customer/product upserts, sales head/lines/subtotal validation, newer-version updates and rollback
- [x] Duplicate imports do not duplicate facts; namespaces isolate sources
- [x] Financial month/template/entity/amount checks, nullable facts, explicit replacement and period locking
- [x] Backend owner/team/self/finance/admin enforcement and cross-owner denial
- [x] Data-center upload, precheck, original/error download, history, raw rows and monthly reconciliation
- [x] 95 pytest cases (38 unit/static/parser + 57 PostgreSQL integration/permission), including M0 regression
- [x] 18 desktop/mobile E2E cases; subsequent six data-center cases also passed after presentation/test-helper changes
- [x] Ruff, TypeScript, production build, 20 browser JavaScript assets checked for configured secrets
- [x] Five real M1 files imported twice in isolated acceptance; monthly values match the private source audit
- [x] Local customer/product/sales samples imported; both financial samples prechecked but unconfirmed
- [x] Pre/post-migration offline database snapshots; current local service uses M1
- [x] Native isolated snapshot restore passed (4.01 s); accounts, facts, nine sales months and five upload references/hashes verified
- [x] Private human reconciliation checklist generated; no human acceptance auto-recorded
- [ ] Real finance blank policy and business period confirmation — user decision pending; no period auto-confirmed
- [ ] Sales return/void/export coverage and real staff-to-account mapping
- [ ] Business-user manual check of the local reconciliation page
- [ ] Docker image/start/recreation/persistence — 待绿联 NAS/具备 Docker 环境后补验
- [ ] Remote CI and NAS backup/restore exercise — not executed locally

Report: `docs/15_M1验收报告.md`. Actual file hashes, amounts and local batch identifiers remain in ignored `app-data/`.

## M1 closing instruction — 2026-09-08

The user explicitly stated that manual reconciliation has not yet been performed and requested M1 closing work first. M2 remains not started. Native restore acceptance is complete; Docker/NAS restore and manual business acceptance remain pending. Use `app-data/M1人工核对清单.md` for the business check and `app-data/m1-restore-verification.json` for private restore evidence.

- [x] Current regression: 98 pytest cases passed (41 unit/static/parser/restore guards + 57 PostgreSQL integration/permission)
- [x] Ruff, TypeScript, frontend production build and 20 browser JS secret checks passed
- [x] Application code/UX unchanged; prior 18 browser E2E acceptance remains recorded, not rerun in this closing task
- [ ] User has not yet completed manual reconciliation; finance blank policy and Docker/NAS acceptance remain pending

## M1 user-reported order viewing issue — 2026-09-08

- [x] Reproduced: API returned HTTP 200 and 30 orders, but the heading was below the viewport after nine monthly rows
- [x] Replaced below-page result with an immediately visible modal, paginated list, detail/back navigation and local request states
- [x] Verified on actual local sample: opening, second page, order detail, returning and closing
- [x] 98 pytest, Ruff, TypeScript, production build and browser secret scan passed; schema and business permissions unchanged
- [x] Full 22-case desktop/mobile browser regression passed (3.2 minutes); desktop/mobile screenshots checked
- [x] User confirmed the repaired order-viewing interaction works ("已经可以了")
- [ ] Business manual acceptance remains pending; this fix does not authorize M2

## M1 read-only financial preview — 2026-09-09

- [x] Batch-scoped financial preview API with backend owner/admin/finance access and manager/sales denial
- [x] Monthly reconciliation links to recent pending financial files; selected batch also offers preview
- [x] Profit month/YTD and balance ending/year-opening columns; null remains visibly distinct from zero
- [x] Viewing does not confirm import, change blank policy, alter RAW/normalized evidence or confirm a period; no migration required
- [x] 104 pytest passed (41 unit/static/parser/restore guards + 63 PostgreSQL integration/permission), including M0 regression
- [x] Full 24-case desktop/mobile browser regression, Ruff, TypeScript, production build and 20 browser JS secret checks passed
- [x] Both real financial previews checked against all 85 source metric rows; pending status, blank policy and effective financial facts unchanged
- [x] Actual local desktop/mobile preview screenshots checked, including opening and closing both report types
- [x] Existing local platform restarted with final code; health, login/logout and real desktop/mobile previews reverified without rebuilding the database
- [ ] Business manual sales reconciliation and finance blank policy remain pending; preview availability is not business acceptance
- [ ] Docker/NAS startup, recreation and persistence — 待绿联 NAS/具备 Docker 环境后补验
- [ ] M2 remains not started

## M2 CRM implementation and interrupted-delivery closure — 2026-09-09

The later explicit CRM instruction supersedes the earlier M1-only development gate; historical M1 entries above describe the state at their dates.

- [x] Customer list/360, prospects, ERP binding, contacts, tags, followups, next-step tasks, opportunities, transfer/public pool and audit history
- [x] Five-role backend scope, cross-owner denial, finance process redaction, concurrent claim, transfer/binding history and Decimal/date boundaries
- [x] 144 pytest cases passed on current code; empty migration, migration round trip and model comparison included
- [x] 32 desktop/mobile browser tests passed, including M0/M1 regression; Ruff, TypeScript, production build and 20 browser JS secret checks passed
- [x] Existing local M1 database backed up offline: 1,686 snapshot files checked; Alembic 0002_m1 -> 0004_m2
- [x] Existing business/configuration columns and seven upload hashes unchanged; private evidence in `app-data/m2-local-upgrade.json`
- [x] Frontend/backend/worker started; health HTTP 200; existing owner/sales/admin/finance login/logout and CRM access checked on desktop/mobile
- [x] Both pending real financial previews still readable; smoke checks created no contacts, followups, tasks or opportunities
- [x] README, CHANGELOG and M2 report synchronized; local customer/task screenshots saved privately
- [ ] M2 sales/manager manual workflow acceptance and real staff mapping
- [ ] M1 manual reconciliation and finance blank policy; Docker/NAS and production restore exercise remain pending

This closing task completed verification and local delivery of the existing M2 implementation, without adding M3 features. The first sandbox pytest run encountered a Windows temporary-directory cleanup permission error; the authorized rerun completed successfully. Browser cases passed; cleanup reported a process-tree permission warning, but the helper exited successfully and both isolated service ports (3100/8100) were subsequently confirmed closed.

Report and manual checklist: `docs/16_M2轻量CRM实施与验收.md`. Trial URL on this computer: http://localhost:3000, then “客户与待办”.

## M3 preparation — 2026-09-09

- [x] Reviewed M3 metrics, existing data models, permission model and import boundaries
- [x] Read-only local readiness check: existing sales are unverified and unassigned salespeople remain; private evidence in `app-data/m3-readiness.json`
- [x] Concrete phased implementation and test plan in `docs/17_M3销售工作台与销售BI实施计划.md`
- [ ] M2 manual acceptance or explicit instruction to develop M3 with acceptance deferred
- [ ] M3 implementation has not started; no application or schema changes in this preparation task

Formal operating-sales activation remains conditional on verified valid/return/void/export coverage; unknown rows are neither silently accepted nor displayed as true zero. Unrelated target/calendar/CRM work can proceed after stage scope is confirmed.


## M3 resumed implementation — 2026-09-10

- [x] Monthly targets, work calendar/parameters, individual workbench and team execution
- [x] Scoped sales metrics, daily chart, customer/product/person contribution, source-order drilldown and customer attention
- [x] Explicit sales-scope attestations with import locking, stale-fact invalidation and full-history guards; actual local sales remain unverified
- [x] Alembic 0005_m3 additive migration, empty roundtrip/model comparison and refusal to discard existing M3 data
- [x] 172 pytest passed; Ruff, TypeScript, production build and 21 browser JavaScript secret checks passed
- [x] Browser coverage: 32 M0–M2 cases passed in the full run; all six corrected M3 desktop/mobile cases passed in final rerun
- [x] Offline snapshot: 1,734 files verified; 0004_m2 → 0005_m3; old business columns and seven upload hashes unchanged
- [x] Frontend/backend/worker started; M3 health HTTP 200; five-role desktop/mobile read-only smoke and both pending finance previews passed
- [x] Real sales remain unverified; no local targets/calendar/sales attestations were fabricated; isolated browser ports closed
- [ ] M3 manual acceptance and real sales coverage/status/staff verification
- [ ] Product brand/category source mapping and continuous monthly trend remain follow-ups; CRM shortcuts continued below
- [ ] Production-scale P95 measurement, Docker/NAS and business acceptance remain pending

Report: `docs/18_M3实施与验收.md`. This task does not confirm real sales/financial policy or advance to M4.

## M3 CRM shortcuts — 2026-09-10

- [x] Today/week/overdue task views and open-opportunity navigation preserve the selected workbench person
- [x] Optional CRM assignee/owner/status filters narrow existing backend authorization; five-role and cross-team tests
- [x] Quick followup from customer tasks, including repeated use inside customer detail; task completion remains explicit
- [x] Form focus and initial list loading protection; existing target test selects the intended person's target column
- [x] 178 pytest and Ruff passed; no database schema changes
- [x] Final TypeScript/production build and 21 browser JavaScript secret checks passed
- [ ] Final desktop/mobile browser regression
- [x] Local frontend/backend/worker restarted; HTTP 200 health and fresh worker heartbeat; desktop/mobile read-only shortcut and backend parameter smoke passed
- [ ] Existing manual sales/finance/CRM acceptance and Docker/NAS checks remain pending
