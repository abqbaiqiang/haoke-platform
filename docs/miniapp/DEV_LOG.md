# 微信小程序 CRM 开发记录（DEV_LOG）

> 依据 `docs/miniapp/00-06` 开发包执行。每个 Phase 完成后在此登记，独立提交。
> 开发包 V1.0 基准日期 2026-09-19，文档与 UI 图已收编于本目录。

---

## Phase 0：基线确认（2026-09-19，未改业务代码）

### 现有直接复用能力（已逐项核对代码）

| 能力 | 位置 | 说明 |
|---|---|---|
| Customer 主数据 | `apps/backend/app/data_models.py` | 含 `company_address`；**坐标字段见风险①** |
| Contact / Followup / Task / Opportunity / FollowupAttachment | `apps/backend/app/crm_models.py` | 跟进附件 0012 已上线（图片粘贴场景） |
| `save_followup()` 待办联动 | `crm_service.py:397` | 小程序跟进必须走它，不实现第二套 Task 逻辑 |
| 客户权限范围 | `crm_service.py:69 customer_scope` | 列表/详情/时间线/附近全部复用 |
| 认证 | `main.py`（`songmao_session` HttpOnly Cookie + `request_boundary` Origin 校验）、`services.authenticate` | 小程序 Bearer 适配见风险③ |
| 腾讯地图代理 | `apps/backend/app/map_api.py` / `map_service.py` | `/api/map/config`、`/api/map/geocode`，server key 不出后端——**web 客户位置功能另一工作线已实现（当前工作区未提交）**，Phase 7 直接复用其解析逻辑 |
| 文件存储 | DATA_ROOT/uploads + `FollowupAttachment` | 媒体扩展沿用，不上 OSS |
| Worker | `apps/worker/main.py` | 当前仅心跳、无业务 job——geocode/ASR/临时媒体清理轮询需新增 |
| 技术栈 | FastAPI + SQLAlchemy + Pydantic + Alembic + PostgreSQL；PC 前端 Next.js + React + TS | 小程序 Taro 4.x + React + TS + SCSS 与 PC 维护思路一致 |

### 需要扩展的字段（Phase 5 / Phase 7，Alembic 顺延编号）

- `Customer`（Phase 7）：开发包方案 `map_latitude/map_longitude/map_coord_system/geocode_status/geocode_provider/geocode_address_hash/geocoded_at/geocode_error`——**与 web 线已加的 `latitude/longitude`（0014_customer_location，未提交）需先合并拍板**，见风险①。
- `FollowupAttachment`（Phase 5）：`attachment_type/source/media_duration_ms/transcription_status/transcript_text/transcript_language/transcription_error`，现有图片记录默认 `attachment_type='image'`。
- 新表（Phase 5/6）：`mobile_media_draft`（24h 过期临时媒体）、`crm_followup_ai_snapshot`（AI 快照追溯）。

### 需要新增的 Mobile API（Phase 2/3/4/5/6/7 分批）

前缀 `/api/mobile`：auth 3 个（login/me/logout，Bearer）；`GET /workbench`、`POST /customers/brief-batch`；`GET /customers`、`/customers/{id}/brief|timeline|contacts`；`POST /media`、`GET /media/{id}/status`、`DELETE /media/{id}`；`POST /ai/followup-draft`；`POST /customers/{id}/followups`；`GET /tasks`、`PATCH /tasks/{id}`；`GET /nearby`；`GET /me/summary|recent-followups`。**明确没有 `POST /customers`**（小程序禁止新增客户）。

### 需要新增的 Miniapp 页面（Phase 1 骨架）

`apps/miniapp/src/pages/`：`login`、`workbench`、`customers`、`customer-detail`、`followup-edit`、`nearby`、`mine`；原生 TabBar 四项：工作台/客户/附近/我的。公共组件按 04 文档第十六节强制复用表建立。

### 潜在兼容风险

1. **坐标字段双线冲突**：工作区存在另一条工作线的 web 客户位置功能（未提交）：`0014_customer_location` 已给 Customer 加 `latitude/longitude`，config 已有 `tencent_map_web_key/tencent_map_server_key`。开发包要求 `map_*` 命名 + `geocode_status` 状态机 + `map_coord_system`（GCJ-02）。**Phase 7 开工前必须拍板合并方案**（倾向：保留 0014 已有列名，补 geocode 状态机字段；或统一改名，迁移顺延 0015+），避免同表两套坐标语义。
2. **Origin 中间件**：`main.py:69 request_boundary` 对非 GET/HEAD/OPTIONS 且无可信 Origin 的请求一律拒绝；小程序 `Taro.request` 不带浏览器 Origin。`/api/mobile/*` 需在中间件内按前缀豁免 Origin 校验（仅接受 Bearer），其余路由维持现状；不得整体关闭保护。
3. **Actor 解析扩展**：`services.authenticate` 目前只从 Cookie 解析会话；需扩展为 Cookie 或 `Authorization: Bearer` 双通道，输出同一 Actor。Token 存储沿用现有 session 表模式（存 hash、有过期、logout 失效、日志不打 token）。
4. **Taro 4 + 仓库 React 版本兼容**：开工先 POC `npm run build:weapp`；NutUI 不作为生产依赖（04 文档第十九节）。
5. **Worker 需要新增轮询框架**：geocode（地址 hash 变化→pending→解析）、ASR（转写 pending）、临时媒体过期清理；现状只有心跳循环。
6. **UI 图与 PRD 冲突**：`ui/05` 顶部"顺路推荐：附近有 2 个 A 类客户【查看路线】"与 PRD"V1 不做路线优化"矛盾——按文档优先原则降级为纯提示（无"查看路线"入口），Phase 7 前与老板确认。
7. **ASR/AI 供应商未选型**：`ASR_PROVIDER`/`AI_PROVIDER` 均为空，Phase 6 前置条件，不阻塞 Phase 0-5。
8. **UI 图占位数据**：六张图中的客户名、金额、距离均为示例，必须来自 API，禁止照抄为 mock 硬编码进业务页（Phase 1 的 mock 数据集中放 `src/services/mock.ts` 供替换）。

### 收编说明

- 开发包 00-06 文档 + `ui/` 六图已收编至 `docs/miniapp/`；合并版《完整开发文档 V1.0》（3476 行，内容为 00-06 重复）未收编。
- 原始 zip 文件名未设 UTF-8 标志，脚本化解压需 `name.encode('cp437').decode('utf-8')` 修正（Windows 资源管理器解压不受影响）。

### 后续阶段

Phase 1（工程骨架+Design System+六页 Mock）→ 2（移动认证）→ 3（只读闭环）→ 4（跟进写入）→ 5（媒体）→ 6（ASR+AI）→ 7（地图）→ 8（视觉精修）→ 9（全量回归+真机），每阶段独立测试、提交。

---

## Phase 1：Miniapp 工程骨架 + UI Design System（2026-09-19）

### 产出

- `apps/miniapp/`：Taro **4.2.1** + **React 18.3.1**（独立于 PC 的 React 19——Taro 4 官方兼容 18，符合开发包"先兼容性 POC"结论，19 待 Taro 官方支持后再评估）+ TypeScript 5.6 + SCSS，webpack5 runner，`designWidth 750`。
- Design Tokens：`src/styles/tokens.scss`（挂在 `page` 选择器——weapp 不支持 `:root`），值与 PC `DESIGN.md`/开发包 04 文档一致；新增语义浅底 `--danger-soft/--warn-bg/--warn-ink`（与 PC 状态章同源）。所有页面/组件零写死视觉值。
- 公共组件（15 个，位于 `src/components/`）：Avatar、Tag、SectionCard（含 SectionHeader）、TaskRow、CustomerRow、CustomerHeader、VisitBrief、AISummaryCard、FollowupTimelineCard、OrderTimelineCard、TimelineItem、NearbyCustomerRow、BrandHeader、EmptyState、LoadingState、ErrorState。
- 页面（7 个）：`login / workbench / customers / customer-detail / followup-edit / nearby / mine`，模块层级对照 6 张参考图；原生 TabBar 四项（图标为 PIL 生成的线性风格 PNG，`src/assets/`）。
- Mock：全部集中在 `src/services/mock.ts`（类型即未来 Mobile DTO 契约，`src/types/`），业务组件零 mock 硬编码；Phase 3 起替换。
- 命令：`npm run build:weapp` / `dev:weapp` / `typecheck`（仓库无 eslint 配置，按"跟仓库能力统一"用 tsc）。

### 验收（对照 06 文档 Phase 1 标准）

- [x] 七页都能打开（TabBar 四页 + 详情/跟进/登录 push）；
- [x] 与 UI 图模块结构一致（模块顺序未改，视觉精修留 Phase 8）；
- [x] 没有 BI；没有新增客户入口（客户列表空态文案明确"客户请先在现有系统/精斗云流程中建立"）；
- [x] 不接后端展示 Mock；
- [x] `build:weapp` 通过、`tsc --noEmit` 通过；
- [x] 组件无大面积复制；
- [x] PC 端回归：`scripts/run_tests.py` 全套（ruff + pytest + 前端 tsc/build）通过（本次未改后端任何文件）。

### 已知事项

- `npm run build:weapp` 有 1 条 mini-css-extract-plugin 组件样式顺序 warning（chunk common），不影响产物；Phase 8 视觉精修时顺手收敛。
- `VoiceRecorder / MediaPicker / UploadStrip` 属交互组件，按 06 文档顺序推迟到 Phase 4/5（避免死代码），未违反 04 文档强制复用表（届时建立）。
- 依赖安装需注意：`@tarojs/webpack5-runner@4.2.1` 精确 peer webpack 5.91.0，**不要**在 devDependencies 里另声明 webpack。
