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
- [ ] M2 Lightweight CRM
- [ ] M3 Sales workbench + sales BI
- [ ] M4 Business/finance BI + risks
- [ ] M5 Jingdouyun API / AI enhancements

**Current gate:** M1_LOCAL_PASSED_BUSINESS_DOCKER_PENDING. The user's subsequent continue instructions authorized M1. M0 remains regression-tested; the explicit Docker deferral remains in force. Do not enter M2 without M1 business acceptance and a new instruction.

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
