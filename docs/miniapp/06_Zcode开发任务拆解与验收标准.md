# 好客齐鲁微信小程序 CRM
## Zcode 开发任务拆解与验收标准

原则：每个 Phase 都应可独立提交、测试、回滚。

不要一次提交“新增小程序全部功能 + 改后端 50 个文件”。

---

# Phase 0：基线确认与开发计划

## Zcode 任务

阅读：

- `AGENTS.md`
- `DESIGN.md`
- 本文档包全部 MD
- 现有 CRM models/service/api/schemas
- auth
- data import/customer
- worker
- 6 张 UI 图

输出到开发记录：

```text
现有直接复用能力
需要扩展的字段
需要新增的 Mobile API
需要新增的 Miniapp 页面
潜在兼容风险
```

## 验收

- 未改业务代码；
- 没有新建重复 CRM 模型；
- 开发计划与本方案一致。

---

# Phase 1：Miniapp 工程骨架 + UI Design System

## 任务

新建：

```text
apps/miniapp
```

接入：

- Taro 4.x；
- React；
- TS；
- SCSS；
- weapp build；
- ESLint / TS Check（跟仓库能力统一）。

建立：

- tokens；
- Page Container；
- Card；
- SectionHeader；
- TaskRow；
- CustomerRow；
- Tag；
- Loading / Empty / Error；
- TabBar 配置。

先用 Mock Data 实现六页静态骨架。

## 验收

- 六页都能打开；
- 与 UI 图模块结构一致；
- 没有 BI；
- 没有新增客户；
- 不接真实后端也能展示 Mock；
- `build:weapp` 通过；
- 组件没有大面积复制。

提交建议：

`feat(miniapp): scaffold crm mini program and visual system`

---

# Phase 2：移动认证 + HTTP 基础层

## 后端

新增：

- `/api/mobile/auth/login`
- `/api/mobile/auth/me`
- `/api/mobile/auth/logout`
- Bearer 解析；
- 与 PC Cookie 共用 Actor 权限语义；
- Origin 中间件安全适配。

## Miniapp

新增：

- login page；
- auth storage；
- `http.ts`；
- 401 redirect；
- API environment config。

## 验收

后端测试至少：

1. 正确账号能登录；
2. 错密码不能登录；
3. 过期 token 拒绝；
4. logout 后 token 失效；
5. PC Cookie 登录测试继续通过；
6. 不允许用 mobile 适配绕过 Origin 保护访问非 mobile endpoint。

提交建议：

`feat(mobile-auth): add token session for mini program without weakening web auth`

---

# Phase 3：客户只读闭环

## 后端

新增：

- Mobile Customers List；
- Customer Brief；
- Timeline；
- Contact List；
- Workbench 聚合；
- Task read。

必须基于现有 CRM Service / Scope。

## Miniapp

接真实：

- 工作台；
- 客户列表；
- 客户详情；
- 我的只读部分。

## 验收

### 权限测试

- sales A 不能查 sales B 的客户；
- 直接请求别人 customer id 返回 403/404（按现有规范）；
- timeline 同样受权限；
- 联系人同样受权限。

### 产品测试

- 无新增客户；
- 搜索客户 / 联系人 / 电话可用；
- 详情 30 秒速览成立；
- Timeline 可分页；
- 客户详情返回速度合理。

提交建议：

`feat(miniapp-crm): connect scoped customer brief and timeline`

---

# Phase 4：跟进记录基础写入

## Miniapp

实现：

- 选择联系人；
- 沟通方式；
- 发生时间；
- 手工文字；
- 下一步行动；
- 下次时间；
- 保存；
- 本地草稿。

## 后端

Mobile Followup Create 适配，底层调用现有 `save_followup()`。

## 核心测试

- 正常 Followup 创建；
- 非当前客户联系人不能提交；
- next_action 单独有而时间没有，继续按现有规则拒绝；
- next_action + 时间生成 Task；
- 更新逻辑无重复 Task；
- 无权限客户不能写；
- PC 原跟进功能回归通过。

提交建议：

`feat(miniapp-followup): reuse crm followup and task workflow`

---

# Phase 5：照片 + 音频媒体

## 数据库

Alembic：

- FollowupAttachment 媒体扩展；
- mobile_media_draft。

## 后端

- multipart media upload；
- media ownership；
- size/mime/hash；
- 临时 token；
- 绑定 Followup；
- 过期清理。

## Miniapp

- `chooseMedia`；
- RecordManager；
- UploadStrip；
- 播放录音；
- 删除 / 重试；
- 弱网状态。

## 安全测试

- 非 owner 不能使用 media token；
- 超大文件拒绝；
- 非法 MIME 拒绝；
- 路径穿越文件名不能逃出存储目录；
- 过期 token 不能使用；
- 保存 Followup 后附件正确关联。

提交建议：

`feat(miniapp-media): add durable photo and voice capture flow`

---

# Phase 6：语音转写 + AI 整理

## 后端

- ASR Provider Interface；
- Worker 转写；
- 状态接口；
- AI Provider Interface；
- 严格 Pydantic 输出 Schema；
- AI Snapshot；
- 超时 / 重试 / 失败逻辑。

## Miniapp

状态必须完整：

- 录音中；
- 上传中；
- 转写中；
- 成功；
- 失败；
- 重新转写；
- AI 整理；
- 用户编辑；
- 保存。

## 测试

- ASR 失败不丢音频；
- AI 失败仍可手工保存；
- AI JSON 异常时不把脏数据写业务表；
- AI 不能覆盖金额 / 等级 / 订单；
- 用户修改后 Followup 保存的是用户确认值；
- AI Snapshot 可追溯。

提交建议：

`feat(miniapp-ai): add reviewable transcription and followup drafting`

---

# Phase 7：地图 + 地址地理编码

## 数据库

给 Customer 增加地图字段。

## Worker

地址变化 → pending → geocode → success/failed。

## 后端

Nearby API：

- scope first；
- bounding box；
- haversine；
- 距离排序。

## Miniapp

- 请求位置权限；
- Map；
- Marker；
- 半径；
- Nearby Sheet；
- 查看；
- openLocation 导航。

## 隐私验收

- DB 中不保存 salesman live lat/lng；
- 没有后台持续定位；
- 拒绝定位后其他 CRM 功能仍可用；
- Nearby 不能泄露其他业务员客户。

提交建议：

`feat(miniapp-map): add scoped nearby customer discovery and navigation`

---

# Phase 8：视觉精修

这一步不是“重设计”，是对照效果图消除偏差。

逐页：

1. 工作台
2. 客户列表
3. 客户详情
4. 记录跟进
5. 附近
6. 我的

检查：

- Page Padding；
- Card Radius；
- Section Spacing；
- 字号；
- Line Height；
- Button Height；
- Tag；
- Divider；
- 空状态；
- iPhone Safe Area；
- 微信胶囊区域。

任何时候都不得为了“更炫”偏离参考图。

提交建议：

`style(miniapp): align crm screens with approved mobile visual spec`

---

# Phase 9：完整测试与回归

## Backend

执行仓库规定 pytest / lint / migration checks。

新增测试清单：

- mobile auth；
- customer scope；
- timeline scope；
- contacts scope；
- followup create；
- task linkage；
- media upload；
- media ownership；
- ASR status；
- AI parsing；
- nearby scope；
- geocode state；
- PC CRM regression。

## Miniapp

至少：

```text
npm run typecheck
npm run build:weapp
```

按实际 package script 调整。

## 真机流程验收

### 流程 1

登录 → 工作台 → 今日待办 → 客户详情 → 拨号

### 流程 2

客户 → 搜索 → 客户详情 → 查看时间线 → 记录跟进

### 流程 3

录音 60 秒 → 上传 → 转写 → AI 整理 → 修改 → 添加照片 → 保存并生成待办 → 返回客户详情 → 新动态出现

### 流程 4

附近 → 定位 → Marker → 客户 → 导航

### 流程 5

弱网 → 录音 → 上传失败 → 重试 → 成功，不丢草稿

### 流程 6

销售 A 尝试改请求访问销售 B 客户 → 后端拒绝。

---

# 最终 Definition of Done

以下全部打勾才算 V1 完成：

```text
[ ] 6 个业务页面完整
[ ] UI 通过参考图对照
[ ] 无新增客户
[ ] 无 BI / 业绩 KPI
[ ] 客户来自现有系统
[ ] 联系人可查可拨
[ ] 拜访前速览完整
[ ] 朋友圈式 Timeline 完整
[ ] Followup 写入现有模型
[ ] Next Action 正确联动 Task
[ ] 照片可上传 / 查看
[ ] 录音可录 / 播 / 上传
[ ] ASR 可失败重试且不丢原音频
[ ] AI 可编辑确认
[ ] 地图附近客户可用
[ ] 不保存销售实时轨迹
[ ] 权限后端测试通过
[ ] Alembic 可从旧库升级
[ ] PC CRM 回归通过
[ ] weapp 构建通过
[ ] 真机通过
```
