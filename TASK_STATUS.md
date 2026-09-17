# Project Task Status

## 2026-09-17 Product margin report (Route A, per owner decision)

- [x] Sales import now parses the 最近一次采购价 column (100% filled in real exports; 参考成本/预估毛利 columns are empty in current exports) into the reserved actual_cost_amount column (line cost = price × quantity; no migration)
- [x] New GET /api/bi/product-margins: per-product sales/cost/profit/margin with totals, margin-rate sort, pager, cost_coverage; visible to owner (all), manager (team), sales (own) via existing two-level scope; metrics SALE_COST_AMOUNT / SALE_GROSS_PROFIT / SALE_GROSS_MARGIN added to docs/04 dictionary + catalog (guard green)
- [x] Zero/empty purchase price treated as "cost not maintained" (excluded from cost/profit; shows —) to avoid fake 100% margins
- [x] Backfilled via sanctioned re-import of stored files: 2332/2332 active lines now carry cost (the 2026-09-12 older export correctly rejected by out-of-order protection). Real-data check: Sept sales 410,249.40 − cost 321,051.95 = profit 89,197.45 (21.74%)
- [x] Regression: ruff clean, pytest 267 (3 new tests: parser optional column ×2, integration cost/report/scope/422), tsc/build/bundle green, E2E 38 passed / 10 skipped
- [ ] Boss to maintain 最近一次采购价 in Jingdouyun product master for new products (6 unmatched product codes lm1202–1207 were new products; product-master re-import fills them)
- [ ] Route B (purchase-order import → supplier/payables/inventory analysis) not started; gross margin is reference-cost caliber, not FIFO/outbound cost — noted in dictionary

# Project Task Status

## 2026-09-17 Business acceptance decisions applied (docs/30, owner decisions via chat)

- [x] Owner decisions recorded in docs/30: ① no returns to consider (imports are deals only); ② 12 unmapped orders → 李延伟 (mapping 安佰强→李延伟 saved on test_src; 4 orders take effect on re-import, 8 empty-salesperson orders of 420 元 cannot auto-map); ③ customer assignment plan A executed; ④ data review deferred until the delete-and-reupload capability exists (review locks imports); ⑤ finance: 1–7 月 uploads coming, blanks stay blank, uploaded data is treated as verified
- [x] Executed: 183 of 226 order-mapped customers batch-assigned (夏方鹏 57 / 李延伟 51 / 肖昌兴 75; 124 previously-claimed customers keep their claims); assignment plan in app-data/assignment-plan.json
- [x] docs/30 corrected: distinct order-bearing customers are 226 (not 312; 50 customers have 2 salespeople, 18 have 3); 288 no-order customers stay in pool; 43 pending customers listed in docs/30 附录 A (blocked by batch-assign because they carry in-flight CRM work — owner decides per customer, then transfer)
- [ ] Pending owner: assign the 43 customers (docs/30 附录 A); decide whether to clear stale import-era owner marks on ~321 pool customers; walkthrough meeting (docs/30 第 7 节)
- [ ] New feature approved in principle, to implement: source-level "delete sales data & re-upload" for owner — deletes a source's sales facts (orders/lines) while keeping raw import evidence and audit trail; CRM is unaffected (no CRM table references orders); re-upload rebuilds idempotently and invalidates stale sales reviews. Customer data must NOT get a delete function (CRM history references customers) — use existing deactivation + corrected re-import instead
- [ ] Note: the final E2E run re-created its own test sources (normal); rerun scripts/dev_db_cleanup.py when the suite slows again

## 2026-09-17 Dev DB test-data cleanup (owner-authorized)

- [x] Removed 955 test-pattern data sources (e2e_/bi_/cockpit_/sw_/assign_) and all dependents in one transaction: 8018 customers, 1985 import batches, 26174 raw rows, 358 orders + 590 lines, 358 products, 7598 assignment histories, 123 claims, 114 followups, 234 tasks, 109 financial periods + 9265 metrics, 112 sales reviews, 1985 field mappings
- [x] Real business data preserved and verified: test_src with 514 customers (pool + 404 claims), 1771 orders (sum 4,205,296.19), 12 import batches; demo accounts/settings/targets untouched
- [x] Offline snapshot backup before cleanup: app-data/backups/pre-e2e-cleanup-postgres-20260917-141346 (2682 files + sha256 manifest); VACUUM ANALYZE after
- [x] New scripts: dev_db_cleanup.py (dry-run default, dev-only guard) and dev_backend.py (single-instance backend launcher)
- [x] /api/bi/team latency 7.66s → 2.27s; full E2E 38 passed / 10 skipped on the cleaned DB
- [ ] Remaining: /api/bi/team per-person×per-source compute pattern still needs batching/SQL aggregation (2.27s is pure CPU for 10 demo users) — separate task
- [ ] Note: repeated E2E runs will re-accumulate test sources; rerun scripts/dev_db_cleanup.py (dry-run first) when the suite slows again

## 2026-09-17 C4-3 sales.tsx/crm.tsx split and long-line formatting (docs/29 task book complete, awaiting owner acceptance)

- [x] sales.tsx (228→65 lines): split into app/sales/ — ui (Icon/Empty/Panel/Pager/Modal/yoySpan/money), perf-chart, quick-follow, sales-dialog, recent-table, four screens (workbench/customers/tasks/performance), shared types, four data modals; main file keeps routing and state orchestration only
- [x] crm.tsx (375→144 lines): split into app/crm/ — api wrapper, shared types, display helpers, Editor+ProductPicker, TagPicker/TagManager, TaskList/OppList/FollowList, and detail/ (derive + summary + overview + sections); main file keeps data loading and tab orchestration
- [x] Formatting rule honored (改到哪、格式化到哪): only touched/moved code reformatted (2000+ char single-line JSX expanded); untouched lines kept; DOM/className/E2E selectors unchanged; no business/API/permission changes; detail JSX verified segment-by-segment against HEAD via normalized comparison (15/15 segments identical)
- [x] 12 independent commits, each with full regression: ruff clean, pytest 264 passed (known flake test_opportunity_products_roundtrip_and_recent_list failed twice in full runs, passed on isolated reruns per task-book rule), tsc/next build/bundle scan passed, E2E 38 passed / 10 skipped
- [x] E2E stability: bi.spec M3 target-save case given test.setTimeout 90s and a 30s team-row assertion. Root cause: dev DB accumulated 335 order-bearing data sources (334 single-order leftovers from historical E2E/cockpit runs); /api/bi/team computes workbench metrics per person × per source (~7.6s), exceeding the default 5s assertion timeout — pre-existing scalability item (M3 "production-scale P95" follow-up), not introduced by C4-3
- [x] Local environment: two orphaned uvicorn instances (SO_REUSEADDR double-bind on :8000) found during triage and replaced with a single healthy instance
- [ ] New follow-up: /api/bi/team per-person×per-source N+1-style metric computation degrades with data volume — needs batching or SQL aggregation before production-scale use (separate task)
- [ ] Known flake (pre-existing): test_opportunity_products_roundtrip_and_recent_list — continue watching
- [ ] Owner review of C2-4 dictionary wording (stage/result labels) still open
- [ ] Docker acceptance and real-business owner sign-off remain separate

## 2026-09-17 C4-2 dead CSS cleanup + stale metadata (docs/29 task book, awaiting owner acceptance)

- [x] 19 dead CSS classes from audit §7.2 deleted after per-class grep verification (tsx/ts + e2e zero references): visually-hidden, contribution-table, team-value, login-layout/intro/intro-footer, login-panel, sales-home-grid/sales-stack, sales-kpis/sales-period/sales-target-self/sales-attention/sales-panel-footer/sales-muted/sales-transactions, legend-old/legend-new, cockpit-fold; dead members removed from shared selector lists; live `--sales-muted` variable and `.sales-order-detail` kept
- [x] Metadata refresh (P2-24/P3-07): MANIFEST.txt regenerated as a 38-file SHA256 snapshot with generation note (sha256sum -c verified); StatusView.milestone M3→V1.1; frontend version strings v0.5.0→v1.1 (aligned with v1.1-sales tag); cockpit.css stale "forest green" comment corrected (P3-09)
- [x] Full regression per commit: ruff clean, pytest 264 passed, tsc/next build passed, E2E 38 passed / 10 skipped
- [ ] C4-3 (final docs/29 item) remains: sales.tsx/crm.tsx split and long-line formatting (改到哪、格式化到哪)
- [ ] Owner review of C2-4 dictionary wording (stage/result labels) still open

# Project Task Status

## 2026-09-16 C2 frontend common layer + C4 bi_service split (docs/29 task book, awaiting owner acceptance)

- [x] C2-1 `app/lib/format.ts`: unified money (placeholder/negatives/thousands/2-decimals/optional ¥) and Asia/Shanghai date-time helpers; migrated 8 money + 7 time sites; sales amounts now always show 2 decimals
- [x] C2-2 `app/lib/api.ts`: unified `api` + `useData` (AbortController kept, retry added); migrated 6 sites (sales init-style call sites, crm/staff/data-center thin wrappers, bi request/useLoad, customer-analytics)
- [x] C2-3 `app/lib/types.ts`: mirrored backend crm/bi/sales schemas; drift fixed: Contact.decision_role union (user/introducer), customer_status literals, Followup.is_effective, Task.priority, AttentionPage.counts; 7 pages use shared types
- [x] C2-4 `app/lib/labels.ts`: role/stage/enum labels converged on docs/03 dictionary wording (opportunity stages, contact_result good=沟通顺利 waiting=等待反馈, interaction methods, lifecycle prospect=潜客); customer status follows newer CRM wording; sales followup validation copy synced with backend 422 message
- [x] C4-1 bi_service.py (913 lines) split: bi_access (装载 186) + bi_caliber (口径 50) + bi_insights (指标 704); DTO stays in bi_schemas; bi_service kept as pure re-export facade — bi_api/sales_workspace call sites unchanged
- [x] Test sync: test_m3 fixed-clock patch covers the three new modules; metric-code catalog guard reads bi_insights.py; fixed date-drift in test_performance_last_year_yoy_gated_by_coverage (coverage order fell inside last-year September window from the 17th of each month onward)
- [x] Every step committed independently with full regression: ruff clean, pytest 264 passed, tsc + next build passed, E2E 38 passed / 10 skipped
- [ ] Known flake (pre-existing): test_opportunity_products_roundtrip_and_recent_list failed once in a full run, passed 3/3 in isolation with identical code — continue watching during C4 remainder
- [ ] C4 remainder left for next session: dead CSS classes (~20, grep-verified deletion), MANIFEST/version-string metadata refresh, sales.tsx/crm.tsx split and long-line formatting (改到哪、格式化到哪)
- [ ] Docker acceptance and real-business owner sign-off remain separate; UI wording changes from C2-4 (stage/enum labels) need owner review

# Project Task Status

## 2026-09-16 Customer detail workbench redesign (docs/29 spec, awaiting owner acceptance)

- [x] Overview tab rebuilt as sales workbench: summary card, 5 KPI cards, left main (next action / current opportunity / recent followups + transactions), right rail (contacts / customer info / note); full lists preserved under dedicated tabs
- [x] Backend migration 0010: opportunity current_blocker/next_promotion columns (nullable, reversible), applied to local dev DB; decision_role enum extended (boss/key_relationship) via schema only; CustomerView exposes created_at
- [x] Business decisions recorded: status wording unchanged (prospect/active/dormant/lost); customer stage = existing customer_status surfaced in UI; no channel/region fields (owner decision)
- [x] Regression: ruff clean, pytest 264 passed, tsc clean, next build passed, E2E 38 passed / 10 skipped; 1440/1280 widths verified without horizontal overflow
- [ ] Known gaps: icon library not unified, YoY sub-value on KPI shows em dash, drawers replaced by existing form panels, other pages still on old visual language

# Project Task Status

## 2026-09-16 C1 guardrails + C3 backend common layer (per docs/29 task book, awaiting owner acceptance)

- [x] C1 guardrails (4 commits): metric-code bidirectional catalog guard (5 unregistered emit codes added to catalog + dictionary), full-width parenthesis duplicate-name regression (P1-05), run_e2e APP_ENV=development check (P2-28), storage_init minimal unit test (P1-15)
- [x] C3 backend common layer (4 commits): app/deps.py consolidates DB/Actor/Current and removes service->API reverse dependency plus main.py trailing noqa imports (P2-09); app/constants.py role/status/level/target-type literals (P3-08); timezone reads settings.app_timezone, 4 hardcoded Asia/Shanghai removed (P2-03); bi_service finance-period None-safe attribute chain fixed (P2-08)
- [x] Every step ran full regression: ruff clean, pytest 264 passed, E2E 38 passed / 10 skipped; each step committed independently for rollback
- [ ] C2 frontend common layer and C4 file split (C1 prerequisite satisfied) remain open; one flaky observation: test_opportunity_products_roundtrip_and_recent_list failed once in a full run, passed on re-runs with identical code — watch during C4
- [ ] Docker acceptance and real-business owner sign-off remain separate

# Project Task Status

## 2026-09-15 Audit findings fixed and acceptance re-run

- [x] P1 fixed with regressions: monthly targets read with target_type='monthly'; identical re-import reactivates deactivated CRM-referenced masters; BI workbench process stats include claimed pool customers
- [x] P2 fixed: sales search state follows the route; pool hides inapplicable level/tag filters and resets them on toggle; unified control heights with ~44px touch targets; sticky operations column and sticky pager on mobile; contrast darkened to AA (primary #0b62d8, muted text >= 4.5:1)
- [x] Ruff clean; full pytest 252 passed (3 new regressions); TypeScript and production build passed
- [x] Browser suite repaired and re-run: stale nav/menu/form/selectors fixed, fixtures aligned with actual config (username-based staff lookup, import-to-pool-to-claim seeding); 5 legacy prospect-creation cases marked test.fixme citing the closed-feature decision
- [x] Final acceptance via scripts/run_e2e.py (desktop + mobile, 48 cases): 38 passed, 10 skipped (5 documented fixme), 0 failed
- [ ] Docker acceptance and real-business owner sign-off remain separate

## 2026-09-15 Code and UI audit

- [x] Read-only code review and owner/sales UI checks at 1440/768/390 px; report in docs/25_代码与界面审查_20260915.md
- [x] Three business defects reproduced in isolated PostgreSQL schemas: quarterly/monthly target mixing, claimed-customer BI omission, inactive master skipped on identical re-import
- [x] 249 existing pytest cases passed after using a workspace temporary directory; TypeScript, production build and 21 bundle secret checks passed
- [ ] Ruff has 2 errors; browser suite has 3 confirmed stale-navigation/menu failures and was stopped before remaining cases
- [ ] 3 P1 and 5 P2 findings require fixes and regression; this audit does not claim implementation or business/Docker acceptance

## 2026-09-15 Sales UI final verification

- [x] Monthly trend uses verified monthly amounts, missing months stay null; transaction rows and details are separate from followups
- [x] Full backend suite: 237 passed; sales desktop/mobile end-to-end acceptance: 2 passed
- [x] Local database/services restored and all four sales pages verified without changing business data
- [ ] User visual/business acceptance and Docker acceptance remain separate

## 2026-09-14 Sales reference-image implementation

- [x] Dedicated sales navigation and four pages; customer pool remains available inside customers
- [x] Actionable customer/task lists; lightweight followup dialog with atomic task completion and next-step creation
- [x] Backend self-scope, search privacy, pagination/date counts, duplicate completion and claimant ownership tested
- [x] Full native suite: 236 tests; dedicated desktop/mobile browser acceptance: 2 tests; production build and bundle secret scan passed
- [x] Existing localhost services refreshed; four sales pages and mobile logout verified read-only against local data
- [ ] User visual/business acceptance and Docker acceptance remain separate

## 2026-09-14 Sales UI structure review

- [x] Current sales navigation, CRM list and workbench inspected; desktop/mobile evidence captured
- [x] Findings, retain/merge/demote proposal and tooling limitations recorded in docs/23
- [ ] Confirm actual opportunity workflow and primary sales device before removing main navigation entries
- [ ] Build and validate connected sales prototypes; no UI implementation claimed in this review

## 2026-09-14 Full-site restyle: blue-white SaaS theme (user-provided sample)

- [x] Owner verdict: forest green rejected, no brand color; final direction locked by user's blue-white SaaS sample poster
- [x] Competitor references captured to `docs/ui-reference/` (Attio / Twenty / folk + before/after)
- [x] Palette swapped site-wide via tokens: neutral gray ground, brand blue `#2563eb` as the single accent (primary buttons, links, sidebar selection, charts, progress, focus), amber reserved for pending-verification warnings
- [x] Dark navy sidebar (`#1e2a38`) with hand-drawn line SVG icons per nav item (square placeholders removed), blue active state, blue-gradient login panel; DESIGN.md and PRODUCT.md updated
- [x] TypeScript and production build passed; cockpit verified with live browser screenshots (docs/ui-reference/ours-after.png)
- [ ] Browser e2e rerun pending (selectors unaffected by color change)

## 2026-09-14 Cockpit redesign "晨会大屏" (Impeccable direction B) + common base fixes

- [x] Impeccable dual-agent critique delivered (26/40) with two directions; user picked B; direction contract in `.impeccable/surfaces/`
- [x] Cockpit rebuilt: trust line → hero amount with mom direction → KPI + target progress → full-width trend → folded details; zero-value sections no longer render
- [x] P0 mobile overflow fixed (390 viewport scrollWidth 702 → 375; ECharts resize + chart clipping)
- [x] Tokens unified to forest green; two detector anti-patterns cleared; detect now 0 findings; PRODUCT.md / DESIGN.md written
- [x] Sidebar nav converted to real links; 6 e2e spec files updated for link role and new cockpit structure
- [x] TypeScript, production build passed; finish review run degraded inline (disclosed) with captures in `.impeccable/review/`
- [ ] Browser e2e rerun pending; RFM aggregate-completion metric wording (已设目标人员合计) awaits owner confirmation for the metric dictionary

## 2026-09-14 Impeccable project installation

- [x] Installed project-local Codex skill, Windows engine and hook manifests through the official installer
- [x] Launcher/context/status/detector smoke checks passed; 33 skill reference links validated
- [ ] Reload Codex and confirm project hook trust when prompted; automatic host execution not verified
- [ ] Initialize design context and run the separately requested UI design review

## 2026-09-14 Inline tag management (add / rename / delete)

- [x] "管理标签" panel in customer 360 for owner/admin: add tag, rename + regroup, delete/restore
- [x] Delete = soft deactivate per no-trace-delete rule: customer associations and audit history kept, hidden from picker/filter, re-assign to new customers blocked (422)
- [x] Rename/soft-delete regression test added; 226 pytest, Ruff, TypeScript and production build passed
- [x] Local stack restarted and verified healthy

## 2026-09-14 WeChat-style customer tags

- [x] 11 preset tags seeded lazily and idempotently on first tags read (layers / traits / follow-up / status groups)
- [x] Customer 360 tag editing replaced with click-to-toggle chip picker plus single save; read-only roles see chips
- [x] Tag filter dropdown in customer list now usable with presets; custom tags still via CRM 设置
- [x] Seed/filter tests added; 225 pytest, Ruff, TypeScript and production build passed
- [x] Local stack restarted; tags endpoint verified returning presets against the live database

## 2026-09-14 All customers moved to pool + pool entry/import UI

- [x] Migration 0006_m5 executed on the local database; 495 unmanaged imports backfilled to public pool
- [x] Remaining 18 previously assigned test customers moved to pool per owner request, owners and history kept, per-customer audit entries written; all 513 active customers now in pool
- [x] New endpoints: `POST /api/crm/customers/pool` (single entry) and `POST /api/crm/customers/pool-import` (bulk ≤500, duplicates skipped and reported), owner/manager/admin only
- [x] Pool page gains "录入公海客户" button and bulk-entry card with per-line parsing (名称,电话,备注) and result feedback
- [x] 3 new tests; 224 pytest, Ruff, TypeScript and production build passed
- [ ] Local backend service must be restarted to load new endpoints; browser e2e rerun pending

## 2026-09-14 Sales navigation: CRM first, performance second

- [x] Main nav reordered to 工作台 → 客户管理（含新增客户公海/商机管理入口）→ 业绩管理（原经营视图组整体后置）→ 管理与设置
- [x] Sales role now lands on 客户管理 after login; owner/manager still land on 经营总览
- [x] CRM page tabs reordered: 客户列表 → 客户公海 → 商机列表 → 跟进记录 → 我的待办
- [x] `CRMEntry.tab` extended with `pool`; nav entry names unchanged so existing e2e selectors keep working
- [x] TypeScript and production build passed
- [ ] Browser e2e rerun and business owner acceptance remain pending

## 2026-09-14 Public pool multi-claim and customer management UX

- [x] Imported customers default to public pool (migration 0006_m5 backfills non-CRM-managed imports; mapped primary owner preserved)
- [x] Non-exclusive claims: `customer_claim` table, multiple salespeople may claim one customer, first claimer becomes owner, co-claims keep ownership and leave audit trail
- [x] Claim visibility: claimed customers appear in "我的客户"; claimant names shown in list, pool and customer 360
- [x] Customer management UX: header select-all checkbox, page-size selector (10/20/30/50/100), batch assignment works on unassigned + pool filters and excludes already-claimed rows
- [x] 221 pytest, Ruff, TypeScript, production build and 21 browser asset secret checks passed
- [ ] Playwright e2e specs updated (`crm.spec`, `batch-assignment.spec`) but not re-run in this session; browser regression pending
- [ ] Business owner acceptance on live data and Docker/NAS checks remain pending

## 2026-09-14 Imported customer batch assignment

- [x] Ownership filter and owner/admin batch assignment: row selection, current page, all filtered results across pages (up to 1000)
- [x] Atomic validation and assignment history; refuse stale/owned/inactive customers; retain CRM ownership on reimport
- [x] Sales empty-state guidance: imported customers need assignment, not duplicate creation
- [x] 219 pytest, Ruff, TypeScript, production build and 21 browser asset secret checks passed
- [x] 10 desktop/mobile browser cases passed, including 65-customer real import and batch assignment, cross-sales isolation and existing CRM workflows
- [x] Updated local service and read-only verification: 513 unassigned customers remain unchanged
- [ ] Business owner selects the intended customers and actual sales assignee; Docker/NAS acceptance remains pending

Usage and evidence: `docs/21_导入客户批量分配.md`.

## 2026-09-14 Data cockpit implementation and review fixes

- [x] Implement approved cockpit layout, compact customer table, detail sections and direct navigation
- [x] Fix bound-prospect conversion, reviewed return/AOV deductions and fixed repeat-purchase formula
- [x] Owner BI/CRM configuration and RFM controls; scoped contribution and customer trend APIs
- [x] 207 pytest, Ruff, TypeScript, production build and 21 browser asset secret checks passed
- [x] Full 44-case browser run: 40 passed, 4 failed; all affected cases passed in final 12-case desktop/mobile cockpit/CRM rerun after selector and logout-wait fixes
- [x] Live 1440/768/390 px read-only UI checks: no document overflow or browser page errors
- [x] No schema change or new migration; real business facts and confirmation settings unchanged
- [ ] Manual UI/business acceptance and Docker/NAS checks remain pending

Report: `docs/20_驾驶舱改版与问题修复验收.md`.

## 2026-09-12 Codex independent review

- [x] Current working tree, recent changes, backend tests and desktop/mobile UI reviewed; see `docs/19_总体检查与UI改版建议.md`
- [x] Existing pytest: 197 passed; TypeScript, production build and browser asset secret scan passed
- [x] Three review-only regression cases reproduce conversion binding, repeat-rate threshold and return/AOV defects
- [x] Desktop browser regression: 9 passed, 1 stale-navigation failure, 10 not run after fail-fast; isolated ports verified closed
- [x] User selected a data-cockpit UI direction; homepage layout preview prepared separately from the application
- [x] Fix the three confirmed metric defects and add permanent regression coverage
- [x] Restore owner configuration entry points and add usable RFM controls
- [x] Fix mobile analytics overflow and analysis navigation contrast
- [x] Resolve Ruff E731 and refresh browser tests for renamed navigation
- [x] Implement user-approved data-cockpit layout; see `docs/20_驾驶舱改版与问题修复验收.md`
- [ ] User visual/manual acceptance and existing business/Docker acceptance remain separate

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

## Customer analytics suite — delivered 2026-09-12 (ZCode, user moved up from backlog)

- [x] Customer RFM eight-layer segmentation (R/F/M vs configurable thresholds; 重要价值/保持/发展/挽留 + 一般四层)
- [x] Repeat-purchase rate (累计 + 近六个月逐月趋势)
- [x] First-deal conversion cycle (CRM 潜客创建 → 首次成交, 分桶统计, 仅统计已绑定并有源销售的潜客)
- [x] Average order value (整体 + 逐月趋势 + 客户排名)
- [x] Metric definitions added to docs/04 (CUS_RFM_LAYER, CUS_CONVERT_CYCLE) with catalog consistency guard
- [x] CRM integration: customer 360 经营画像 card + customer level filter; UI redesign shipped (globals.css design system, 好客齐鲁 branding)
- Known limit unchanged: customer-level gross profit stays out of scope (no cost data in V1 by design)
- [x] Browser e2e regression for new pages (desktop + mobile); final evidence in docs/20
