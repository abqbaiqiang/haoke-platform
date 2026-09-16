# 03 测试覆盖、依赖与仓库卫生风险审计

> 审计人：QA 工程师（严过关）　范围：只读代码健康审计（不写业务代码、不重构、不新增测试）
> 工作区：`D:\Backup\Documents\ChatGPT\好客齐鲁经营管理平台`
> 日期：2026-09-16

---

## 1. 审计范围与方法

### 1.1 实际执行的命令（可复现）

| 命令 | 目的 | 副作用 |
| --- | --- | --- |
| `git log --oneline --all` / `git status --porcelain` / `git status --porcelain --ignored` | 提交数、工作区变更、忽略项量化 | 无 |
| `git ls-files` / `git remote -v` / `git branch -vv` | 被跟踪文件、远端、分支 | 无 |
| `.venv/Scripts/python.exe -m pytest --collect-only -q` | **仅收集** 用例数与文件分布 | 无（不建 schema、不连库） |
| `.venv/Scripts/python.exe -c '<复现 test_deployment 断言>'` | 静态验证某项断言是否成立 | 无（仅读文件） |
| Grep / Glob / Read | 代码、测试、配置、脚本静态分析 | 无 |
| `comm`/`tr` 比较 `requirements.lock` 与 `requirements-test.lock` | 依赖集合差异 | 无 |

### 1.2 未执行的命令（明确声明）

- **未运行 pytest 用例**（避免创建数据库 schema、污染本地环境）。仅执行了 `--collect-only`，结果：**259 个用例收集成功（2.64s）**。
- 未启动任何服务、未跑 migration、未改 `.env`、未改任何源码/测试文件。
- 未执行 Docker / e2e / npm 安装。

### 1.3 关键环境事实

- 本地 `.venv` 为 **Python 3.14.3**；后端 Dockerfile 基础镜像 `python:3.14-slim`；CI 使用 `python-version: '3.14'`；`pyproject.toml` `target-version = "py314"`。**四处一致，均为 3.14**。
- **代码实际要求 3.14**：`apps/backend/app/security.py:23` 使用 `except VerificationError, InvalidHashError:`（无括号多异常，**PEP 758，Python 3.14 起合法**）。在 <3.14 解释器下该文件直接 `SyntaxError`，后端及全部集成测试无法 import。因此“3.13.12”是**宿主机托管解释器**（非项目运行时），已与软件架构师、team-lead 交叉核实（3.14.3 `py_compile` rc=0；3.13.12 报 `multiple exception types must be parenthesized`）。**本仓库无“语法错误”缺陷，但存在“解释器未锁定”的护栏缺口（见问题 #19）**。
- `git remote -v` **为空**（无远端）；分支仅 `master`；最后一次提交 `2026-09-11 14:54 ZCode`，首次提交 `2026-09-09 19:06 ZCode`，共 **7 次提交**。

---

## 2. 后端测试覆盖地图

覆盖性质图例：正=正向用例，反=反向/错误用例，权=权限/越权用例，边=边界用例。“经由 API” 指通过 `TestClient` 打 HTTP 端点间接覆盖，无模块级直接 import。

| 模块 | 行数 | 覆盖测试文件 | 用例数 | 覆盖性质 | 评级 |
| --- | --- | --- | --- | --- | --- |
| `bi_service.py` | 907 | test_m3 / test_m4_overview / test_m5_customer_analytics / test_cockpit_regressions / test_m1_integration / test_sales_workspace / test_user_admin（均经 `/api/bi`） | ~80 | 正·反·权·边 | 中 |
| `crm_service.py` | 613 | test_m2 / test_m2_hardening / test_sales_workspace（直接）+ crm 端点 | ~55 | 正·反·权·边 | 高 |
| `import_parser.py` | 450 | test_m1_parser（直接 17）、m1_fixtures | 17 | 正·反·边 | 高 |
| `sales_workspace.py` | 416 | test_sales_workspace / test_crm_pool_entry / test_m3（经 `/api/sales`） | ~20 | 正·反·权·边 | 中 |
| `import_service.py` | 395 | test_import_purge / test_m2 / test_crm_batch_assignment（直接） | ~20 | 正·反·边 | 高 |
| `import_api.py` | 342 | test_m1_integration / test_import_purge / test_m2（经 `/api/data`）+ e2e | ~25 | 正·反 | 中 |
| `bi_schemas.py` | 283 | test_m3（直接 import ReviewInput/Settings/TargetInput） | ~6 | 正·反 | 中 |
| `crm_schemas.py` | 270 | test_m2（直接 import FollowupInput/OpportunityInput） | ~3 | 正·反 | 中 |
| `crm_api.py` | 255 | 多测试经 `/api/crm` + e2e | ~30 | 正·反·权 | 中 |
| `main.py` | 189 | conftest(`client`) / test_integration / test_unit | ~25 | 正·反·权 | 中 |
| `data_models.py` | 178 | 几乎所有集成测试直接 import | 多 | 正·边 | 高 |
| `crm_models.py` | 134 | test_m2 / test_m2_hardening / test_import_purge 等直接 import | 多 | 正·边 | 高 |
| `user_api.py` | 122 | test_user_admin（经 `/api/staff`，6 用例） | 6 | 正·反·权 | 中 |
| `bi_api.py` | 102 | 经 `/api/bi`（7 文件） | ~80 | 正·反·权 | 中 |
| `cli.py` | 99 | conftest(`accounts`) / test_integration / test_m3 | ~5 | 正·反 | 中 |
| `services.py` | 96 | 经 main 端点（test_integration / test_user_admin / test_unit） | ~20 | 正·反·权 | 中 |
| `models.py` | 71 | 多测试直接 import | 多 | 正·边 | 高 |
| `bi_calculations.py` | 67 | test_m3（money/ratio/shift_month/target_metrics/work_dates） | 6 | 正·边 | 高 |
| `bi_metric_catalog.json` | — | test_m3::test_metric_descriptions_match_dictionary（**仅单向**） | 1 | 正 | 低 |
| `sales_api.py` | 46 | 经 `/api/sales`（test_sales_workspace / test_crm_pool_entry） | ~20 | 正·反·权 | 中 |
| `config.py` | 46 | test_unit::test_configuration_fails_closed + conftest | 4 | 反·边 | 中 |
| `schemas.py` | 43 | 仅经 main 端点间接 | — | 正 | 低 |
| `bi_models.py` | 42 | test_m3 / test_m4_overview 直接 import | 多 | 正 | 中 |
| `permissions.py` | 31 | test_unit::test_scope_matrix（10 参数化）+ test_admin_system_scope | 11 | 权·边 | 高 |
| `security.py` | 30 | test_unit（hash/verify + 弱口令） | 3 | 正·反 | 中 |
| `db.py` | 16 | conftest（间接） | — | — | 低 |
| `storage_init.py` | 12 | **无** | 0 | — | **无** |
| `__init__.py` | 1 | — | — | — | — |

### 2.1 覆盖盲区结论

- **零覆盖模块**：`storage_init.py`（仅被 Docker `storage-init` 服务调用；无任何测试或脚本直接引用，`grep -rn storage_init tests/ scripts/` 为空）。
- **仅间接覆盖（无模块级单测）**：`bi_service.py`（最大模块 907 行）、`sales_workspace.py`、`import_api.py`、`crm_api.py`、`bi_api.py`、`user_api.py`、`sales_api.py`、`services.py`、`schemas.py`、`db.py`。这些通过 HTTP 端点覆盖，属可接受的集成风格，但**内部重构无单测护栏**。
- **只有正向/仅有集成、缺专门反向用例的模块**：`schemas.py`、`db.py`、`bi_models.py`（纯数据/模型，风险低）；`bi_metric_catalog.json` 的**一致性校验只有单向**（见 §5.1）。

### 2.2 跨模块一致性 / 契约测试缺口（已独立核实，并与架构师 01 报告交叉印证）

以下三项属“逻辑有多份实现、但没有任何测试断言它们彼此一致”，是重构时最容易被漏掉的一类覆盖盲区：

| 缺口 | 证据（多处并行实现） | 缺的测试 |
| --- | --- | --- |
| **权限 scope 逻辑四份拷贝** | `permissions.py:19-22`（canonical）、`bi_service.py:36-37`、`crm_service.py:89-92`、`import_api.py:242-243` 各自复写 `manager+team` / `finance+custom` 分支 | 无跨模块一致性用例；`test_unit::test_scope_matrix` 只测 `permissions.py` 一份 |
| **“本周”口径三端不一致** | `crm_service.py:490-495`（week = **[本周一, 本周一+7)**，含今天）、`bi_service.py:498-499`（`week_start = today - today.weekday()`，同为**本周一**起）vs `sales_workspace.py:204-210`（`end = 今天+1天 = 明天00:00`，week = **[明天, 明天+7)**，**不含今天**） | 无“三端同 view 应返回同一集合”的断言；**crm 与 bi 一致，唯 sales 端偏离**（sales 的 week 实为“从明天起 7 天”，非“本周”） |
| **`import_api` 14 端点缺 `response_model`** | `import_api.py` 共 19 个路由，仅 5 个声明 `response_model`（第 162/185/194/199/204 行），其余 14 个裸返回 | 无 OpenAPI 契约/字段形状断言，字段改名不会红 |


---

## 3. 前端 e2e 覆盖地图

e2e 共 **9 个 spec**；Playwright 配置 2 个项目（desktop + mobile），`workers: 1`，`testDir: ./e2e`。

| 页面/组件 | 是否覆盖 | 覆盖 spec | 未覆盖的关键流程 |
| --- | --- | --- | --- |
| `page.tsx`（登录壳/路由/会话） | ✅ | auth.spec（5 角色登录/刷新/登出/错误口令） | WebSocket/异常恢复、`#hash` 深链回退 |
| `data-center.tsx` | ✅ | data-center.spec | — |
| `orders-dialog.tsx` | ✅ | data-center.spec（“订单”关键词命中） | — |
| `finance-preview-dialog.tsx` | ✅ | data-center.spec（“预览”关键词命中） | 空白核对策略组合 |
| `overview.tsx`（驾驶舱） | ✅ | cockpit.spec | — |
| `bi.tsx` | ✅ | bi.spec / cockpit.spec | 部分维度分支 |
| `customer-analytics.tsx` | ✅ | cockpit.spec（`客户分析` region + RFM） | — |
| `crm.tsx` | ⚠️ 部分 | crm.spec / crm-binding.spec / crm-shortcuts.spec / batch-assignment.spec | **分配、公海领取、绑定等核心主流程被 `test.fixme` 屏蔽**（见 §5.2） |
| `sales.tsx`（工作台/我的业绩） | ✅ | sales-workspace.spec | 部分图表分支 |
| `crm-navigation.ts` | 间接 | 由上述 spec 间接覆盖 | — |
| `layout.tsx` | 间接 | 全局 | — |
| `staff.tsx`（人员管理） | ❌ | 仅 sales-workspace.spec 校验“人员管理”导航链接可见（第 88 行），**无任何增删改交互用例** | 新建同事/改密/停用/权限拒绝——**e2e 全缺**（仅 pytest `test_user_admin.py` 覆盖 API） |
| `login-illustration.tsx` | ❌ | 无断言 | 插画渲染/资源 404（`/logo-mark.png`）无兜底 |

**无 e2e 的页面/流程**：`staff.tsx` 全部写操作、`login-illustration.tsx` 渲染、CRM 分配/公海/绑定主流程（被 fixme 屏蔽）。

---

## 4. 重构高风险区清单（核心产出）

判定 = “高复杂度/大文件” ∩ “覆盖评级为中或以下”。逐项给出“改动这里会不会被测试兜住”。

| 位置 | 复杂度依据 | 覆盖评级 | 改动风险 | 兜底建议（先加护栏再动代码） |
| --- | --- | --- | --- | --- |
| `apps/backend/app/bi_service.py` | **907 行**，全后端最大；无模块级单测 | 中（仅经 `/api/bi` 集成） | **高**：金额/指标口径重构极易破坏既有断言之外的分支；5 个指标码无字典定义（§5.1） | ①先补“**emit 码 ⊂ 字典码**”双向一致性断言；②把纯公式（如运行率/加权预测）抽到 `bi_calculations` 并补单测；③补一个“指标码全集”快照测试 |
| `apps/frontend/app/sales.tsx` | **56 KB** | 中（e2e 单文件覆盖，部分分支） | **高**：单页巨文件，e2e 断言多依赖文案/role，重构后易出现“改文案即红” | ①先给 `sales-workspace.spec.ts` 增加稳定的 `data-testid` 定位再拆分；②把关键数值断言从文案迁移到 API 断言 |
| `apps/frontend/app/crm.tsx` | **50 KB** | **低-中**（核心流程被 fixme 屏蔽） | **高**：分配/公海/绑定主流程**当前无浏览器回归** | ①先解 fixme 或补等价“API+UI 冒烟”用例；②拆分前冻结定位契约 |
| `apps/frontend/app/bi.tsx` | **39 KB** | 中 | 中-高 | 与 sales.tsx 同理，先固化定位再拆 |
| `apps/backend/app/sales_workspace.py` | **416 行**，且**服务层 import API 层**（§6.4） | 中 | 中-高：service→api 耦合使“挪动 Actor/DB”会连锁 | ①先把 `Actor`/`DB` 抽到独立 `deps.py` 消除反向依赖；②再拆分聚合函数 |
| `apps/backend/app/crm_service.py` | **613 行** | 高（直接单测 + API + 边） | 中：覆盖面较好 | 可先拆分，风险相对可控 |
| `apps/backend/app/import_parser.py` | **450 行** | 高（17 单测） | 中：解析器有专门单测 | 可先拆分；保留 `PROFIT_NAMES/BALANCE_NAMES` 公共契约（fixtures 依赖） |
| `apps/backend/app/import_service.py` | **395 行** | 高（直接单测） | 中 | 同上 |
| `apps/backend/app/import_api.py` | **342 行** | 中（HTTP 覆盖） | 中 | 先补错误分支断言再拆 |

---

## 5. 测试可靠性问题清单

### 5.1 【P1】过期测试：`test_deployment.py` 与实现直接矛盾（当前套件必红）

- 证据：`tests/test_deployment.py:36` → `assert "localStorage" not in content`；
  而 `apps/frontend/app/page.tsx:32,74` 明确使用 `window.localStorage`（记住账号功能）。
- 静态复现（零副作用）：执行与测试等价的文件扫描，输出
  `localStorage found in: ['apps\frontend\app\page.tsx']` → `test_deployment assertion -> FAIL`。
- 影响：`pytest testpaths=["tests"]` 会执行该用例并失败 ⇒ **“全套通过”的声明不成立**，任何依赖“测试全绿”的发布门槛被破坏。
- 定性：断言本身已过期（源实现正确），属**测试侧缺陷**——但我作为 QA 本轮**只读**，未修改测试；需由工程侧确认是“放宽断言（改为只查真正敏感项）”还是“移除 localStorage 用其他存储”。

### 5.2 【P1】5 个 e2e `test.fixme` 造成核心浏览器回归空洞

- 命中（`grep -n fixme e2e/*.spec.ts`）：
  - `crm-binding.spec.ts:15` M2 binding 导航到正式客户并保留联系人/跟进历史
  - `crm-binding.spec.ts:61` 历史分页与重试
  - `crm.spec.ts:16` 销售潜客/联系人/跟进/次日待办/商机
  - `crm.spec.ts:77` 管理员分配导入客户、经理看团队、公海认领
  - `crm-shortcuts.spec.ts:14` 工作台保留 CRM 视图/人/开放状态/快速跟进
- 定性：注释称“新增潜客按产品决策关闭、销售端迁移到 sales.tsx”。其中“新建潜客”关闭合理，但 **`crm.spec.ts:77` 的“分配/公海认领”并非潜客创建，却一并被 fixme** ⇒ 分配/认领主流程在浏览器层完全失去回归（虽然 `batch-assignment.spec.ts` 覆盖了批量分配，但“逐户分配 + 公海认领 + 转交”组合仍缺）。
- 影响面：CRM 前端重构风险（§4 中 `crm.tsx`）。

### 5.3 跳过/注释断言

- `pytest.skip` / `xfail` / `skipif` / 注释掉的 `assert`：**全仓库 0 命中**（良好）。
- `test.fixme`：前端 5 处（见上），后端无。

### 5.4 强本地环境依赖（换机不可跑）

| 依赖 | 证据 | 换机影响 |
| --- | --- | --- |
| 本地 PostgreSQL 且库名以 `_test` 结尾 | `conftest.py:11-13,26-27`（默认 `127.0.0.1:55432/songmao_test`） | 未装库时 `database_engine` 直接 `pytest.fail` |
| Alembic `upgrade head` + 随机 schema | `conftest.py:39-49` | 需要可写库、可建 schema |
| 端口 | conftest **55432** vs `verify_local_snapshot.py:32` **55434** vs `test_browser_isolated.py:20` **3100/8100** vs `dev.py` **3000/8000** | 端口约定分散、易冲突 |
| 浏览器 | `playwright.config.ts:8-9` 默认 `chromium`；`test_browser_isolated.py:38` 默认 **`msedge`** | 未装 Edge 时孤立浏览器脚本失败；CI 只装 chromium |
| 凭证 | `auth.spec.ts:4` 缺 `DEMO_PASSWORD` 直接 `throw` | 未 seed-demo 无法跑 e2e |
| 无 marker 隔离 | `pyproject.toml` 定义 `integration/unit` marker 但**没有 `--strict-markers` 与默认排除** | 无法在缺库机器上“只跑 unit” |

### 5.5 测试内重复实现（业务公式二次实现）

- 抽检 `test_sales_workspace.py`、`test_m3.py`：期望值多为**字面量**（如 `'12200.00'`、`yoy == '-20.0'`、`CRM_NEW_CUSTOMERS == '2'`），**未发现把生产公式在测试里重写一遍**的情况（良好）。
- `m1_fixtures.py:6` 从 `app.import_parser` 导入 `PROFIT_NAMES/BALANCE_NAMES`——夹具与生产**共享同一真源**，避免科目名漂移（良好）。

### 5.6 夹具与 schema 漂移

- `conftest.accounts` 通过 `app.cli.create_user` 建账号，**与生产同路径**，漂移风险低。
- **硬编码迁移版本字面量**：`main.py:97`、`test_integration.py:128`、`test_m3.py:419` 三处都写死 `"0008_v11"`。新增 `0009_*` 迁移时若漏改 `main.py`，`/health` 返回 503 且 `test_integration` 失败（**至少会被测试捕获**，但三处字面量属重复耦合）。
- `tests/__pycache__` 存在 **3 个无源码的孤立字节码**：`test_debug_tags`、`test_debug_tmp`、`_review_zcode_temp`（`*.pyc` 无对应 `.py`）——多 AI 工具临时调试残留证据（`__pycache__` 已忽略，无入库风险）。

### 5.7 用例计数漂移（文档 vs 实际）

- `--collect-only` 实际 **259**；`TASK_STATUS.md:7` 称 **252**、`CHANGELOG.md` 称 **253+**、`TASK_STATUS.md:23` 称 **237**。多份文档计数不一致，无法作为验收口径。

---

## 6. 依赖审计

### 6.1 前端依赖（`apps/frontend/package.json`）

| 依赖 | 版本 | 是否被引用 | 证据 | 备注 |
| --- | --- | --- | --- | --- |
| `echarts` | 6.1.0 | ✅ | `bi.tsx:100`、`customer-analytics.tsx:55`、`overview.tsx:53`（`import("echarts")` 动态） | **全量包动态导入**，未用 `echarts/core` + 按需注册 ⇒ 独立 chunk 偏大（P3） |
| `next` | 16.3.4 | ✅ | 框架 | 与 `next.config.ts`（standalone/webpack）一致 |
| `react` / `react-dom` | 19.2.8 | ✅ | 框架 | — |
| `@playwright/test` | 1.63.0 | ✅ | `npm run test:e2e` | CI 安装 chromium |
| `@types/node` | 26.5.0 | ✅ | tsconfig types | 运行/构建 Node 为 **24**（Docker `node:24-bookworm-slim`、CI `node-version: 24`）⇒ 类型比运行时超前（P3，`engines` 缺失） |
| `@types/react` / `@types/react-dom` | 19.2.18 / 19.2.7 | ✅ | TS | — |
| `typescript` | 7.0.2 | ✅ | `npm run typecheck`（`tsc --noEmit`） | TS7 与 Next16 的组合**未在 CI 版本矩阵中显式验证**，属“待核实” |

- **未发现未用依赖**（4 runtime + 5 dev 均有引用）。
- **未发现缺失依赖**（源码 import 的外部包均在清单内）。
- `package.json` 无 `engines` 字段，`@types/node` 与运行时 Node 主版本不一致（次要）。

### 6.2 后端依赖

- **生产镜像不含测试依赖 —— 预设疑虑澄清**：`apps/backend/Dockerfile:4-5` runtime 阶段只装 `apps/backend/requirements.lock`；`requirements-test.lock` 仅在 `FROM runtime AS test` 的 test 阶段（第 11-14 行）安装。**生产镜像不会装入 pytest/ruff/httpx**。
- **两个锁文件已分离**，但关系是“测试锁 = 运行时锁 + 测试增量”，且**测试锁缺少运行时 Excel 依赖**：
  | 仅在 test 锁 | 仅在 runtime 锁 |
  | --- | --- |
  | PyYAML、Pygments、certifi、colorama、httpcore、httpx、iniconfig、packaging、pluggy、pytest、ruff | **openpyxl、et-xmlfile、xlrd、defusedxml** |
  - 影响：`tests/m1_fixtures.py:5` 依赖 `openpyxl`；CI 的 native 步骤 `pip install -r requirements-test.lock`（`m0.yml:18`）在**裸环境**下无法跑 pytest（缺 openpyxl/xlrd）。当前仅因 Docker test 阶段以 runtime 为基座、或本地 venv 已装 runtime 锁而“恰好能跑”。**P3 打包缺陷**：测试锁不自足。
- **无版本区间**：两个锁文件均为精确 `==` 固定（良好）。`requirements-test.lock` 共 38 行、`requirements.lock` 共 30 行，均无未锁定项。
- `alembic==1.19.2` 等版本与 `target-version="py314"` 不冲突；本地/Python 版本一致（§1.3）。

### 6.3 版本一致性结论

- Python：**3.14 一致**（见 §1.3）。
- Node：Docker/CI = 24，`@types/node` = 26（类型超前）。
- `typescript 7.0.2` + `next 16.3.4` + `react 19.2.8`：组合较新，**仓库内无版本矩阵验证**，标“待核实”。

### 6.4 循环依赖 / 分层越界

- **service → api 反向依赖（明确缺陷）**：`apps/backend/app/sales_workspace.py:12` → `from app.crm_api import Actor, DB`，即**服务层依赖 API 层**。
- **api → api 横向耦合**：`apps/backend/app/bi_api.py:10` → `from app.import_api import Actor, DB`；`apps/backend/app/sales_api.py:8` → `from app.crm_api import Actor, DB`。`Actor`/`DB` 两个 FastAPI 依赖被定义在 `crm_api.py:15,22`，成为事实上的“共享依赖仓”。
- 影响：无法在不牵动 API 层的情况下独立测试/重构服务层；`Actor` 实为 `Annotated[object, Depends(...)]`，把 Web 框架依赖混入服务层。
- **未发现真正 import 环**（`bi_service` 不反向 import `bi_api`；API 单向 import service）。

---

## 7. 脚本工具链问题清单

| 脚本 | 问题 | 证据 |
| --- | --- | --- |
| `scripts/backup_local.py` vs `backup_db.sh` | **职责重叠**：前者用 `pg_dump` 备本地库到 `app-data/backups`；后者用 `docker compose exec postgres pg_dump` 备容器库到指定目录。两者都做“PostgreSQL 备份”，仅执行位置不同，**无文档说明何时用哪个** | `backup_local.py:21-27`；`backup_db.sh:6-10` |
| `scripts/upgrade_local_m2.py` | **命名误导**：文件名仍是 `_m2`，实际参数 `--milestone {M2,M3}`，`target_revision` 含 M3 | 第 35、70 行 |
| `scripts/run_tests.py` / `run_e2e.py` / `test_browser_isolated.py` / `docker_acceptance.py` / `verify_bundle.py` | **端口/环境约定不统一**：`dev.py` 3000/8000、`test_browser_isolated.py` 3100/8100、`verify_local_snapshot.py` 55434、`conftest.py` 55432；`test_browser_isolated.py` 默认 `msedge`，其余用 chromium | 各文件见 §5.4 |
| `scripts/docker_acceptance.py` | **未被执行过**：`TASK_STATUS.md` 多处明确“Docker acceptance remain separate”；`git remote` 为空 ⇒ CI 从未触发 | `TASK_STATUS.md:10,18,25,34`；`git remote -v` 空 |
| `scripts/verify_local_snapshot.py` | 被 `test_restore_safety.py` 直接 import 测其安全检查（良好），但默认端口 55434 与主流程 55432 不一致 | 第 32 行 |
| `scripts/run_e2e.py` | 依赖 `.env` 的 `DATABASE_URL` 且**直接 `DELETE FROM sys_login_throttle`**（为绕过登录限流）——对生产库误跑有风险，脚本未限制 `APP_ENV` | `run_e2e.py:16-19` |

> 结论：脚本层“分工靠人记”，缺少一层 `scripts/README` 或 Makefile 统一入口；`upgrade_local_m2.py` 命名最易误导。

---

## 8. 仓库卫生与流程风险清单（量化）

| 项 | 量化证据 | 风险 |
| --- | --- | --- |
| **提交严重滞后** | 共 **7** commit，跨 **2026-09-09～09-11**；`git status` = **81** 项变更（**43** 已改 + **38** untracked） | M1–M5/sales V1.1 全部工作只存在于工作区 |
| **无远端** | `git remote -v` 为空 | **单机磁盘 = 全部成果**，无异地备份；CI 永不触发 |
| `.env` 真实密钥 | `.env` 存 `APP_SECRET_KEY`(len 96)、`POSTGRES_PASSWORD`(48)、`INITIAL_ADMIN_PASSWORD`(32)、`DEMO_PASSWORD`(32)、`TEST_DB_PASSWORD`(48)，**均为真实值** | 已被忽略（见下），但本机泄漏/误拷风险 |
| 忽略策略有效 | `git status --porcelain --ignored` 显示 `.env`、`app-data/`、`.tools/`、`.next*/`、`node_modules/`、`__pycache__/`、`*.log` 均被忽略；`git ls-files` **仅跟踪 `.env.example`**，无误跟踪敏感物 | ✅ 忽略策略**到位** |
| `app-data/` 体积 | **356 MB**，含 `backend.log`、多张 `*.png` 截图、多项 `*.json` 验收证据、`postgres/` 数据目录、`uploads/` | 与源码同工作区，误 `git add -A` 会拖入巨量产物（虽有忽略兜底） |
| `MANIFEST.txt` 过期 | 仅 **19** 行，覆盖 `.env.example`…`docs/11`；`docs/` 实际有 **29** 个编号文档（00–28） | 校验清单失去意义 |
| `README.md` 过期 | 第 3 行称“当前实现 M0–M3”，但项目已含 M4/M5、cockpit、sales V1.1、季度目标 | 与 `TASK_STATUS` 矛盾 |
| `AGENTS.md` / `CODEX_START_HERE.md` 过期 | `AGENTS.md:141-142`“只执行 M0…不得主动实现 M1/M2/M3”；`CODEX_START_HERE.md:18`“不要自行进入 M1” | **新 AI 工具按此会拒绝实现后续里程碑或重做 M0**（对本项目“多 AI 反复迭代”流程是直接危害） |
| `CHANGELOG.md` 结构漂移 | 66 KB / 421 行，出现 **3 个重复的 `# Changelog` 一级标题**（append-only 拼接痕迹），单行超长；与 `TASK_STATUS.md`（365 行）**职责重叠** | 可读性下降、双份状态需同步 |
| 前端资源未入库 | `apps/frontend/public/`（logo-full.jpg、logo-mark.png）**未跟踪**；`login-illustration.tsx:132` 引用 `/logo-mark.png` | 新克隆缺 logo ⇒ 404 |
| 孤立调试产物 | `tests/__pycache__/` 有 3 个无源码 `.pyc`（`test_debug_tags`、`test_debug_tmp`、`_review_zcode_temp`） | 多工具调试残留，佐证churn |

---

## 9. 配置一致性对照表

来源：`docker-compose.yml` / `.env.example` / `README.md` / `apps/backend/app/config.py`（+ 实测 `.env`）。

| 变量 | `.env.example` | `config.py` 字段 | docker-compose | 一致性 |
| --- | --- | --- | --- | --- |
| `APP_ENV` | development | `app_env` (Literal dev/test/prod) | 校验 `!= production` | ✅ |
| `APP_TIMEZONE` | Asia/Shanghai | `app_timezone` (Literal 仅 `Asia/Shanghai`) | postgres `TZ` | ⚠️ 被 `Literal` 锁死为单一取值，扩展需改代码 |
| `APP_BASE_URL` | http://localhost:8080 | `app_base_url` | — | ✅ |
| `APP_ALLOWED_ORIGINS` | （空） | `app_allowed_origins`→`allowed_origin_set` | — | ✅（2026-09-16 新增，`CHANGELOG` 有记录） |
| `DATABASE_URL` | postgres 容器名 | `database_url: SecretStr`（必须 `postgresql+psycopg://`） | 由 `POSTGRES_*` 拼装 | ✅ |
| `POSTGRES_*` / `TEST_DB_PASSWORD` | 有 | 不经 config | postgres / postgres-test | ✅ |
| `APP_SECRET_KEY` | CHANGE_ME… | `app_secret_key`（≥32 且不含 CHANGE_ME） | env_file | ✅ |
| `INITIAL_ADMIN_*` / `DEMO_PASSWORD` | 有 | `initial_admin_*` / `demo_password` | seed-demo | ✅ |
| `SESSION_HOURS` / `LOGIN_MAX_FAILURES` / `LOGIN_LOCK_SECONDS` | 有 | 同名（含范围校验） | — | ✅ |
| `UPLOAD_ROOT` / `BACKUP_ROOT` / `DATA_ROOT` | 有 | `upload_root`（兼容） | volumes 使用 | ✅ |
| `IMPORT_MAX_BYTES` | **有** | `import_max_bytes`（1KB–32MB） | — | ⚠️ **`.env` 实测缺失该键**，回落默认 12MB |
| `WORKER_HEARTBEAT_PATH` | **缺** | 不经 config | worker healthcheck 用 `/tmp/worker-heartbeat` | ⚠️ 仅 `dev.py:15` 设置；模板未列 |
| `INTERNAL_API_URL` / `API_BASE_URL` | 有 | 不经 config | 前端 rewrite 用 | ✅ |
| `FRONTEND_HOST` | **缺** | 不经 config | — | ⚠️ 仅 `dev.py:35` 读取（有默认） |
| `AI_*` / `JINGDOUYUN_*` | 有（注释预留） | 不经 config | — | ✅ 预留 |

**“文档承诺但代码没有”**：无（`AI_*`/`JINGDOUYUN_*` 已显式标注“Reserved only”）。
**“代码/脚本需要但模板缺失”**：`WORKER_HEARTBEAT_PATH`、`FRONTEND_HOST`（均可回落默认，影响轻微）。
**“模板有但本机 `.env` 缺”**：`IMPORT_MAX_BYTES`。

---

## 10. 问题条目总表

严重级别：P0=数据错误/安全事故/无法发布；P1=阻碍后续开发或有明确缺陷；P2=明显维护负担；P3=整洁度。

| # | 标题 | 证据（文件:行 / 命令） | 级别 | 影响面 | 建议处置（次序） |
| --- | --- | --- | --- | --- | --- |
| 1 | 全部 M1–M5 成果未入库且无远端 | `git log`=7 commit；`git status`=81 项（43 改+38 untracked）；`git remote -v` 空 | **P0** | 整个代码库 | **第一步先建私有远端并分批提交**（先提交未跟踪的 `sales_api.py`/`sales_workspace.py`/alembic 0006-0008/**6 个新 test**/**5 个 e2e spec**），再谈其它护栏 |
| 2 | `test_deployment.py` 断言与实现矛盾，套件必红 | `tests/test_deployment.py:36` vs `apps/frontend/app/page.tsx:32,74`；静态复现输出 `FAIL` | **P1** | 发布门槛/CI | 工程侧决定：改断言只查真正敏感项，或改存储实现；修完再跑全量 |
| 3 | 5 个 e2e `test.fixme` 屏蔽 CRM 主流程 | `crm.spec.ts:16,77`、`crm-binding.spec.ts:15,61`、`crm-shortcuts.spec.ts:14` | **P1** | CRM 前端回归 | 先为 `crm.spec.ts:77`（分配/公海认领）补等价用例，再考虑其余 |
| 4 | CI 无远端、从未触发；Docker 验收未跑 | `.github/workflows/m0.yml`；`git remote -v` 空；`TASK_STATUS.md:10,18` | **P1** | 发布可证性 | 先 push 到远端让 CI 真跑一次；再谈扩展 |
| 5 | `storage_init.py` 零测试 + 存储初始化未受控验证 | `grep -rn storage_init tests/ scripts/` 空；`docker_acceptance.py` 未执行 | **P1** | 部署/发布 | 先加一条最小单测（临时目录 + 校验属主/权限逻辑可 mock） |
| 6 | 指标字典一致性**单向**校验，5 个 emit 码缺定义 | `bi_service.py:488-491,295,296`（`TGT_QUARTER_AMT/COMPLETION/PROGRESS`、`SALE_MOM_BASE`、`SALE_YOY_BASE`）；`grep` catalog=0 / docs04=0；`test_m3.py:391-393` 只遍历 CATALOG | **P2** | BI 展示正确性 | 先把 `test_metric_descriptions_match_dictionary` 改为“代码 emit 码 ⊆ 字典码”双向断言，再补文档 |
| 7 | 分层越界：service→api、api→api | `sales_workspace.py:12`、`bi_api.py:10`、`sales_api.py:8` 均 import `crm_api` 的 `Actor/DB`（定义于 `crm_api.py:15,22`） | **P2** | 架构/可测试性 | 先抽 `app/deps.py` 放置 `Actor/DB`，消除反向依赖 |
| 8 | 测试强环境依赖、端口分散、无 marker 排除 | `conftest.py:11-13`(55432)、`verify_local_snapshot.py:32`(55434)、`test_browser_isolated.py:20,38`(3100/8100/msedge)；`pyproject.toml` 无 `--strict-markers` | **P2** | 换机可跑性 | 先统一端口与浏览器常量，再补 `addopts=--strict-markers` |
| 9 | 文档/元数据过期并与实现矛盾 | `MANIFEST.txt`(仅 docs00-11) vs `docs/`(29 文档)；`README.md:3`(仅到 M3)；`AGENTS.md:141-142`；`CODEX_START_HERE.md:18` | **P2** | 误导后续 AI/人 | 先更新 `AGENTS.md`/`CODEX_START_HERE.md` 的“当前里程碑”，再重建 MANIFEST |
| 10 | 迁移版本字面量三处硬编码 | `main.py:97`、`test_integration.py:128`、`test_m3.py:419` 均 `"0008_v11"` | **P2** | 迁移维护 | 先让 `/health` 与测试改为读 Alembic head（`ScriptDirectory.get_current_head()`） |
| 11 | `app-data/` 356MB 验收产物与源码混放 | `du -sh app-data`=356M；含 `backend.log`/`*.png`/`*.json`/`postgres/` | **P2** | 误提交/体积 | 先归档验收证据到 `docs/audit/evidence/` 或压缩，保留忽略 |
| 12 | `CHANGELOG`/`TASK_STATUS` 职责重叠与计数漂移 | `CHANGELOG.md` 3 个 `# Changelog`；259(实测) vs 252/253/237(文档) | **P2** | 文档可信度 | 先确立单一事实源（TASK_STATUS=状态，CHANGELOG=变更） |
| 13 | `upgrade_local_m2.py` 命名误导 | 第 35、70 行支持 `--milestone M3` | **P3** | 使用误解 | 重命名 `upgrade_local_db.py` 或加显式提示 |
| 14 | 脚本间端口/浏览器约定不统一 | `dev.py`、`test_browser_isolated.py`、`verify_local_snapshot.py`、`conftest.py` | **P3** | 易冲突 | 抽常量集中管理 |
| 15 | 孤立调试字节码 3 个 | `tests/__pycache__/{test_debug_tags,test_debug_tmp,_review_zcode_temp}.pyc`（无 `.py`） | **P3** | 整洁度 | 清理缓存即可（已忽略） |
| 16 | `echarts` 全量动态导入 | `bi.tsx:100`、`overview.tsx:53`、`customer-analytics.tsx:55` 用 `import("echarts")` | **P3** | 前端性能 | 改 `echarts/core` + 按需注册（先测包体） |
| 17 | `requirements-test.lock` 不自足 | test 锁缺 `openpyxl/xlrd/et-xmlfile/defusedxml`（`comm` 差异）；`m1_fixtures.py:5` 需 openpyxl | **P3** | 裸环境测试 | 让 test 锁 `-r requirements.lock` 或补依赖 |
| 18 | 模板键缺失 | `.env` 缺 `IMPORT_MAX_BYTES`；模板缺 `WORKER_HEARTBEAT_PATH`/`FRONTEND_HOST` | **P3** | 配置一致性 | 补齐模板与本地 `.env` |
| 19 | 解释器未锁定（PEP 758 依赖 3.14） | `security.py:23` 需 3.14；`pyproject.toml` **无 `requires-python`**、无 `.python-version`；`scripts/*.py` 用 `sys.executable` 不校验版本 | **P3** | 环境误判/误改 | 先在 `pyproject.toml` 加 `requires-python = ">=3.14"` 并加 `.python-version`；再固化 `run_tests.py` 版本前置检查 |
| 20 | 权限 scope 逻辑四份拷贝、无一致性测试 | `permissions.py:19-22` / `bi_service.py:36-37` / `crm_service.py:89-92` / `import_api.py:242-243` | **P2** | 权限正确性 | 先加“四端对同一 scope 判定一致”的参数化用例，再考虑收敛为单一实现 |
| 21 | “本周”口径三端不一致、无一致性测试 | `crm_service.py:490-495`（本周一起，含今天）、`bi_service.py:498-499`（本周一起）vs `sales_workspace.py:204-210`（**明天**起 7 天，不含今天）；crm 与 bi 一致，唯 sales 偏离 | **P2** | 待办口径 | 先确定唯一口径并加三端一致性断言 |
| 22 | `import_api` 19 端点仅 5 个有 `response_model` | `import_api.py` 第 162/185/194/199/204 行 vs 其余 14 个 | **P2** | 前端契约 | 先为其余 14 端点补 response_model + 契约用例 |

### 需澄清（非缺陷）

- **生产镜像不会装入测试依赖**：runtime 只装 `requirements.lock`（`Dockerfile:4-5`），测试依赖仅在 `test` 阶段（`11-14`）。原预设疑虑不成立。
- **Python 版本一致**：本地 3.14.3 / Docker 3.14 / CI 3.14 / `py314`。简报中“managed 3.13.12”**无仓库证据，待核实**。
- **`.gitignore` 安全**：`git ls-files` 仅跟踪 `.env.example`，`.env`/`app-data`/`.tools`/`.next*`/日志均被忽略。

---

## 附：各级别条数汇总

| 级别 | 条数 | 编号 |
| --- | --- | --- |
| P0 | 1 | 1 |
| P1 | 4 | 2、3、4、5 |
| P2 | 10 | 6、7、8、9、10、11、12、20、21、22 |
| P3 | 7 | 13、14、15、16、17、18、19 |

**最严重 3 项**：①（P0）全部成果未入库且无远端；②（P1）`test_deployment` 使套件必红、破坏发布门槛；③（P1）CRM 核心 e2e 被 `test.fixme` 屏蔽 + CI/Docker 验收从未执行。

### 次序建议（护栏优先，不主张大重构/大批补测）

1. **先保住资产**：建远端、分批提交（当前 81 项变更）。
2. **先恢复“测试可信”**：修 `test_deployment.py` 断言 → 让全量 pytest 真绿。
3. **再补高价值护栏**：`storage_init` 最小单测、指标码“emit⊆字典”双向断言、迁移版本去字面量、权限/“本周”跨模块一致性断言（#20/#21）。
4. **最后才动大文件**：按 §4 的“先固化定位/先抽 `deps.py`”顺序，从 `bi_service.py`、`crm.tsx`、`sales.tsx` 开始拆。
