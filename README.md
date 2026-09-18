# 好客经营管理平台

精斗云之上的公司内部经营管理平台。当前实现：数据中心（导入与月度核对）、轻量 CRM、销售工作台与个人 BI（销售/客户分析）、经营驾驶舱、人员管理，以及销售员端 V1.1（执行闭环、客户分层、过程指标）。财务/采购/库存专题、AI 与精斗云 API 留在后续里程碑。人工业务验收和 Docker/NAS 补验状态以 TASK_STATUS 为准。

技术栈：Next.js / React / TypeScript、FastAPI / SQLAlchemy / Pydantic、PostgreSQL、Alembic、worker、Caddy、Docker Compose。

开发前阅读 [项目文档索引](docs/00_项目文档索引.md) 和 [AGENTS.md](AGENTS.md)。文档差异及工程补充见 [M0 实施说明](docs/12_M0实施与文档核对.md)，实际结果见 [M0 验收报告](docs/13_M0验收报告.md)。

## 当前 Windows 机器一条命令启动

依赖与本地 PostgreSQL 二进制已准备好，在项目根目录执行：

```powershell
.\scripts\start_local.ps1 -SeedDemo
```

访问 **http://localhost:3000**。启动器执行数据库启动、migration、初始管理员创建，启动前端、后端和 worker。Ctrl+C 停止应用服务；PostgreSQL 保留运行。后端健康检查：http://127.0.0.1:8000/health。

初始账号为 `.env` 中的 `INITIAL_ADMIN_USERNAME`，密码读取本机 `.env` 的 `INITIAL_ADMIN_PASSWORD`。演示账号：`demo_owner`、`demo_manager`、`demo_sales`、`demo_finance`、`demo_admin`；共用 `.env` 中的 `DEMO_PASSWORD`。另有 `demo_sales2`（团队外）与 `demo_disabled`（停用）。密码不会打印到终端或写入 Git。

`-SeedDemo` 只在开发环境创建缺失演示账号，不覆盖已有密码/角色。生产环境禁止演示初始化。演示财务和经理只授权 demo_sales；demo_sales2 用于越权测试。

停止本机临时数据库：

```powershell
$pgTask = Join-Path $env:TEMP 'songmao-m0-pg-20260908'
& (Join-Path $pgTask 'native\bin\pg_ctl.exe') -D (Join-Path $pgTask 'data') -m fast -w stop
```

本机 PostgreSQL 放在 ASCII 临时路径以避免 Windows 中文路径初始化错误，**仅用于开发/样本验收，不能作为生产主库**。本次导入的是原始导出的本地测试副本，原件仍保留；临时目录清理后需要恢复。迁移前后快照保存在 Git 忽略的 `app-data/backups/`，不要在运行中直接复制数据库目录。生产数据必须使用下述 DATA_ROOT 持久目录。

## M1 本地使用

人工验收可逐项对照本机私有文件 `app-data/M1人工核对清单.md`，其中已列出每个月份、订单数和源金额。程序核对通过不自动替你勾选人工验收。

使用 `demo_owner` 登录，进入“数据中心 → 月度核对”，选择“好客齐鲁 · 本地样本核对”，查看销售月份、金额、订单和明细。本机密码见私有文件 `app-data/本地测试账号.txt`。系统采用管理员创建账号，没有开放自助注册。

同页财务区域的“最近待确认的财务报表”可打开两张 8 月报表预览，对照本月/累计、期末/年初及原始空白。手机表格可横向滑动查看右侧金额。预览不会确认导入或财务期间。管理员/财务也可在“文件导入与历史”选择财务批次，点击“查看财务预览”；较早批次从历史列表查找。

使用 `demo_admin` 进入“数据中心 → 文件导入与历史”。先导客户、商品，再导销售；上传后看预检及错误行，再确认导入。同一文件重复导入不会翻倍。原件、SHA256、字段映射、来源行和旧版本均可追溯。管理员可以维护导入和财务期间，但不自动获得老板的经营查看权限。

`demo_finance` 可导入财务报表，销售查看按授权人员范围执行。财务报表要求主体、期间、元单位和科目勾稽一致。源空白保留空；含空白的报表需要明确选择空白核对策略再重新预检。财务期间确认与导入成功分开，已确认期间替换须先解除确认。当前两张真实财务样本仅预检，等待用户确认空白策略。

销售核对页显示源销售金额；退货、作废和导出完整性尚待业务核实，不当作已确认的净销售指标。本次尚未绑定真实员工账号，未映射归属保持空，由老板查看全公司样本；不能把真实销售分配给任意演示账号。详见 [M1 验收报告](docs/15_M1验收报告.md)。

## M2 轻量 CRM 使用

登录后进入“客户与待办”。销售可创建无精斗云编码的潜客、维护联系人和标签、记录跟进，同时填写下一步动作及时间生成待办。待办可按今天、本周、逾期、未来和已完成切换；商机可更新阶段、预计金额、概率和流失原因。赢单只关闭商机，实际交易仍来自精斗云。

销售工作台中的今日、本周、逾期待办和开放商机可直接进入相应列表，并保留当前查看人员。在关联客户的待办上点击“快速记录跟进”即可打开该客户的跟进表单；保存跟进和完成待办是两个独立操作。

经理管理团队客户与待办；老板查看全部 CRM、维护客户和分配待办；管理员负责运维分配、绑定、配置和标签。老板/管理员可带原因作废跟进，历史保留。财务仅可查看授权客户、联系人和源销售记录，不开放跟进、待办、商机。

客户 360 可查看源销售核对金额、主要购买商品及历史记录。管理员/经理可转交客户或将客户放入公海，销售领取后继续跟进；开放商机和待处理事项随客户转交，历史销售归属不变。绑定精斗云客户时选择没有 CRM 管理内容的正式主档，保留潜客历史；有冲突则先人工核对，不自动合并。

“CRM 设置”由管理员维护：销售自建标签默认关闭、公海领取默认开启、销售修改本人跟进时限默认 24 小时且可调整。公海自动回收不启用。新阶段不自动分配真实客户给演示账号；真实员工与人员映射需业务确认。

M2 本机升级前可运行 `scripts/upgrade_local_m2.py --pg-bin <本地PostgreSQL二进制目录>`。脚本仅允许本地开发环境，先停库复制并校验快照，再运行 Alembic 并比对旧数据。期间暂停平台使用；不要对生产环境运行。含 CRM 数据后禁止直接降级删除 CRM 表，恢复步骤应使用经过验证的备份。

实施规则、迁移影响与人工验收清单见 [M2 实施与验收](docs/16_M2轻量CRM实施与验收.md)。

## M3 销售工作台与分析

登录后选择“销售工作台”：销售查看个人目标、待办和商机；老板/经理设置月目标、查看团队执行。销售分析可按客户、商品和业务员切换，查看日趋势、月金额、变化贡献和源订单。

本地真实销售仍待核实，默认使用“源销售核对”。“已确认经营销售”须先由管理员明确核对有效/退货/作废状态、导出覆盖和人员映射；无确认时显示待核实，目标和 CRM 可继续使用。管理员在“日历与分析设置”维护工作日、休假、客户阈值和任务统计策略。未确认财务空白或报表期间。

本机升级先运行 `scripts/upgrade_local_m2.py --milestone M3 --pg-bin <本地PostgreSQL二进制目录>` 完成停库快照和校验，再使用启动命令。详见 [M3 实施与验收](docs/18_M3实施与验收.md)。

## 新开发机准备

本机已有一次独立数据库恢复演练记录，见 `app-data/m1-restore-verification.json`。重复验证当前 M1 快照可运行：

```powershell
$pgTask = Join-Path $env:TEMP 'songmao-m0-pg-20260908'
.\.venv\Scripts\python.exe scripts/verify_local_snapshot.py --snapshot app-data/backups/post-m1-postgres-20260908 --pg-bin (Join-Path $pgTask 'native/bin')
```

脚本只在独立临时目录和 55434 端口恢复，完成后清理，不替换现有平台数据库。当前验证使用同版本 PostgreSQL，并核对现存上传文件引用/哈希；Docker/NAS、异机/跨盘文件恢复仍需单独演练。

需要 Python 3.14、Node.js 24、PostgreSQL 18（或 Docker）。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-test.lock
npm --prefix apps/frontend ci
.\.venv\Scripts\python.exe scripts/init_env.py --local
```

原生 PostgreSQL 用户/密码/端口应与 `.env` 一致。启动 PostgreSQL 后执行：

```powershell
.\.venv\Scripts\python.exe scripts/create_local_databases.py
.\.venv\Scripts\python.exe scripts/dev.py
```

Windows 可选便携测试数据库（只下载到项目工具目录，不安装系统服务）：

```powershell
npm install --prefix .tools --save-exact @embedded-postgres/windows-x64@18.4.0-beta.17 --registry=https://registry.npmjs.org
.\scripts\start_local.ps1 -SeedDemo
```

## 测试

本地 PostgreSQL 运行后：

```powershell
.\.venv\Scripts\python.exe scripts/run_tests.py
```

执行 Ruff、单元/真实 PostgreSQL 集成/权限测试、TypeScript、生产构建、浏览器产物密钥检查。测试强制使用 `*_test` 数据库，每次创建随机 schema，结束仅清理本次 schema，不清空开发/生产库。

浏览器验收推荐使用隔离测试库和独立端口，不向当前样本平台写入人工测试事实。本机使用 Edge：

```powershell
$env:E2E_BROWSER_CHANNEL = 'msedge'
.\.venv\Scripts\python.exe scripts/test_browser_isolated.py
```

隔离脚本使用 3100/8100，自动迁移、创建演示账号和人工财务夹具，完成后清理本次 schema 与上传目录。其他机器安装 Chromium 后设置 `E2E_BROWSER_CHANNEL=chromium`。已运行的专用 Compose 验收环境可使用 `scripts/run_e2e.py`。E2E 包含五角色登录、导入与财务回归、订单和财务弹窗，以及 CRM 潜客/联系人/跟进/待办/商机、转交领取、正式客户绑定、作废留痕和加载失败重试，具体执行结果见任务状态。不要针对生产账号运行。

反复跑错误密码用例可能触发 15 分钟限流；请使用独立验收环境或等待限流窗口，不关闭生产限流来通过测试。

## Docker / NAS / Linux

**当前机器没有 Docker。配置已完成，实际启动、镜像构建、容器重建及持久化验收待具备 Docker 环境后补验。**

新机器从模板建立 `.env`（不要把当前 Windows localhost 数据库配置直接当生产配置）：

```sh
python3 scripts/init_env.py
# 或复制 .env.example 为 .env，手动设置所有随机密码/密钥
```

开发用默认入口 http://localhost:8080；容器数据库地址由 Compose 自动注入为 postgres:5432。密码建议使用自动生成的字母数字/URL-safe 字符，手动填写特殊字符时 DATABASE_URL 需 URL 编码。

NAS/Linux 设置 `DATA_ROOT` 为实际绝对宿主目录，例：`/srv/songmao-data`（示例可改，不要求绿联私有路径）。生产部署前创建目录并给后台运行用户写权限：

```sh
mkdir -p /srv/songmao-data/postgres /srv/songmao-data/uploads/raw /srv/songmao-data/uploads/attachments /srv/songmao-data/backups
chown -R 10001:10001 /srv/songmao-data/uploads /srv/songmao-data/backups
chmod 700 /srv/songmao-data/uploads /srv/songmao-data/backups
chmod 600 .env
```

PostgreSQL 官方镜像自行初始化其数据目录权限。PostgreSQL 18 将宿主 `DATA_ROOT/postgres` 挂载到容器 `/var/lib/postgresql`，数据库实际位于版本化子目录。不要改回旧版本镜像的挂载方式。

```sh
docker compose up -d --build --wait
```

启动链：postgres 健康 → migrate 升级与管理员初始化，storage-init 准备上传/备份目录权限 → backend/worker → frontend → Caddy。

只通过 Caddy 暴露入口；数据库、后端、worker、前端均无宿主端口。默认入口绑定 127.0.0.1。局域网试用请把 HTTP_BIND 改为 NAS 内网地址、APP_BASE_URL 改为完全一致的浏览器访问源（包括端口），否则 CSRF 校验会拒绝登录。

公网生产必须同时设置：`APP_ENV=production`、`APP_BASE_URL=https://实际域名`、`SITE_ADDRESS=实际域名`、`HTTP_BIND=0.0.0.0`、`HTTP_PORT=80`、`HTTPS_BIND=0.0.0.0`、`HTTPS_PORT=443`。正确配置域名和端口转发后由 Caddy 申请 HTTPS；生产会话 Cookie 自动启用 Secure，关闭 API 文档。没有 HTTPS 不得将生产登录放公网。

持久目录：postgres、uploads、backups、caddy-data（证书）、caddy-config；容器日志限 10 MB × 3。worker 在 M0 仅检查数据库并生成心跳，不处理业务任务。

### Docker 补验命令

在独立验收环境运行：

```sh
docker compose config --quiet
docker compose --profile test run --build --rm backend-tests
python3 scripts/docker_acceptance.py --allow-recreate
docker compose exec -T backend python -m app.cli seed-demo
# 安装本地 Playwright 后执行浏览器验收，E2E_BASE_URL 与 APP_BASE_URL 一致
python3 scripts/run_e2e.py
```

容器验收脚本会重建服务容器，比较已有账号 UUID 与用户名，并检查 uploads/backups 标记文件仍在。不会删除 volume，不会清空数据库；仅允许非生产环境。CI 文件已提供相同流程，尚未在远端触发执行。

### 账号运维

仅有可信主机/容器访问权限的管理员执行。主角色和范围维护 UI 属于后续系统管理扩展，本轮提供基础模型与账号运维入口。

```sh
docker compose exec -T backend python -m app.cli set-active --username demo_sales --active false
docker compose exec backend python -m app.cli reset-password --username admin
```

密码重置交互输入，不通过命令行参数传密码；停用与重置均撤销旧会话、保留用户和审计历史。

### 备份、恢复、迁移

```sh
sh scripts/backup_db.sh /srv/songmao-data/backups
sh scripts/backup_files.sh /srv/songmao-data /srv/songmao-data/backups
sh scripts/restore_db.sh /srv/songmao-data/backups/实际备份.dump songmao_verify_restore
```

恢复脚本仅创建新的 `_restore` 数据库，不覆盖当前库。恢复失败保留目标库供诊断，修复后用另一个新名字重试。

正式上线前安排每天备份、至少 30 天保留，每周异盘副本；恢复演练仍需在 NAS/Docker 环境实际执行。生产迁移只通过 Alembic，先备份；`downgrade base` 会删除 M0 系统表，禁止用于正式数据回滚。

## 目录与边界

```text
apps/frontend/      Next.js 登录、账号与基础导航
apps/backend/       FastAPI 分层认证、权限、DTO、系统模型、Alembic
apps/worker/        数据库健康心跳与进程退出
scripts/            本地启动、测试、Docker 验收、备份恢复
 tests/             单元、PostgreSQL 集成、越权、部署配置测试
 deploy/            Caddy 配置
 docs/              原始项目文档与 M0 工程补充/验收记录
```

.env、运行数据、便携工具、原始业务文件、依赖和测试报告均忽略；不要将真实业务数据提交到公共 Git。
