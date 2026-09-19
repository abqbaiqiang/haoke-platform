# 好客齐鲁微信小程序 CRM
## 数据库、API、语音、地图与 AI 设计

---

# 一、数据库修改总原则

- 现有业务事实表优先；
- 小程序不创建平行客户 / 跟进 / 待办 / 商机表；
- 新增字段通过 Alembic；
- 老数据兼容；
- 所有新增数据能追溯创建人和时间；
- AI 输出不能覆盖原始证据；
- 媒体文件必须校验、限额、鉴权。

---

# 二、Customer 地图字段

现有 `company_address` 保留。

建议新增：

```text
map_latitude           NUMERIC(10,7) NULL
map_longitude          NUMERIC(10,7) NULL
map_coord_system       VARCHAR(16)   NULL    # mainland map 建议 gcj02
geocode_status         VARCHAR(16)   NULL    # pending/success/failed/missing
geocode_provider       VARCHAR(32)   NULL
geocode_address_hash   VARCHAR(64)   NULL
geocoded_at            TIMESTAMP     NULL
geocode_error           VARCHAR(255)  NULL
```

不要用模糊字段名 `lat/lng` 而不说明坐标系。

## 地址变化逻辑

精斗云 / 数据导入更新 `company_address` 后：

1. 算地址 hash；
2. 与上次不同时将 `geocode_status = pending`；
3. Worker 异步地理编码；
4. success 后写坐标；
5. failed 保存简短错误；
6. 地图只使用 success 坐标。

绝不能每次打开地图临时把全部地址重新 geocode。

---

# 三、FollowupAttachment 扩展

现有附件表已经比较通用，只是当前业务实现偏图片。

建议新增：

```text
attachment_type       VARCHAR(16)  NOT NULL DEFAULT 'image'
source                VARCHAR(16)  NULL      # web/miniapp
media_duration_ms     INTEGER      NULL
transcription_status  VARCHAR(16)  NULL      # pending/processing/success/failed
transcript_text       TEXT         NULL
transcript_language   VARCHAR(16)  NULL
transcription_error   TEXT         NULL
```

现有图片记录自动默认 `attachment_type=image`。

---

# 四、移动临时媒体

记录跟进页面需要在“正式 Followup 尚未保存”时先上传录音 / 照片。因此不要强行要求一开始就生成假 Followup。

建议新增：`mobile_media_draft`

字段：

```text
id                    UUID PK
user_id               UUID NOT NULL
media_type             VARCHAR(16)   # image/audio
filename               VARCHAR
content_type           VARCHAR
size_bytes             BIGINT
sha256                 VARCHAR(64)
storage_path           VARCHAR
media_duration_ms      INTEGER NULL
transcription_status   VARCHAR(16) NULL
transcript_text        TEXT NULL
transcription_error    TEXT NULL
expires_at             TIMESTAMP NOT NULL
used_at                TIMESTAMP NULL
created_at             TIMESTAMP NOT NULL
```

规则：

- token 本质可使用 id；
- 只能 owner 使用；
- 24h 后未 used 的由 Worker 清理；
- 正式保存 Followup 时把临时文件转成 FollowupAttachment；
- 成功转移后标记 used_at；
- 严禁任意路径访问。

---

# 五、AI 快照

建议新增：`crm_followup_ai_snapshot`

用途：保留“AI 当时生成了什么”，但最终业务事实仍是用户确认后的 Followup。

字段：

```text
id                     UUID PK
followup_id             UUID NOT NULL
created_by              UUID NOT NULL
provider                VARCHAR(64) NULL
model_name              VARCHAR(128) NULL
input_sha256             VARCHAR(64)
raw_output_json          JSONB
confirmed_output_json    JSONB
created_at               TIMESTAMP
```

`confirmed_output_json` 保存用户最终确认前后的结构化内容差异，便于未来排错。

不要把客户的经营事实只存在 AI JSON 里。

---

# 六、Mobile API 总览

统一 prefix：

```text
/api/mobile
```

## 认证

```text
POST /auth/login
GET  /auth/me
POST /auth/logout
```

## 工作台

```text
GET  /workbench
POST /customers/brief-batch
```

## 客户

```text
GET /customers
GET /customers/{customer_id}/brief
GET /customers/{customer_id}/timeline
GET /customers/{customer_id}/contacts
```

明确：**没有** `POST /customers`。

## 跟进

```text
POST /media
GET  /media/{media_id}/status
DELETE /media/{media_id}

POST /ai/followup-draft
POST /customers/{customer_id}/followups
```

## 待办

```text
GET   /tasks
PATCH /tasks/{task_id}
```

## 附近

```text
GET /nearby?latitude=&longitude=&radius_km=
```

## 我的

```text
GET /me/summary
GET /me/recent-followups
```

---

# 七、Mobile Customer DTO

列表 DTO：

```json
{
  "id": "uuid",
  "name": "山东华礼商贸有限公司",
  "level": "A",
  "tags": ["礼品批发", "节日礼盒", "济南"],
  "primary_contact": {
    "id": "uuid",
    "name": "张总",
    "role": "老板",
    "mobile_masked": "138****8888"
  },
  "last_followup_at": "2026-09-18T09:23:00+08:00",
  "last_followup_summary": "沟通春节项目...",
  "next_action": "发送三档报价",
  "next_followup_at": "2026-09-23T10:00:00+08:00",
  "has_active_opportunity": true
}
```

列表不要返回订单明细、全部联系人、全部跟进。

---

# 八、Customer Brief DTO

```json
{
  "customer": {},
  "primary_contact": {},
  "contacts_count": 3,
  "visit_brief": {
    "last_contact": {},
    "last_promise": {},
    "current_opportunity": {},
    "recent_order": {}
  },
  "map": {
    "address": "...",
    "latitude": 36.0,
    "longitude": 117.0,
    "coord_system": "gcj02"
  }
}
```

---

# 九、Timeline API

```text
GET /api/mobile/customers/{id}/timeline?type=all&cursor=...&limit=20
```

返回：

```json
{
  "items": [],
  "next_cursor": "..."
}
```

### 数据源

至少：

- Followup；
- FollowupAttachment；
- Order facts；
- Opportunity 的关键业务变化（如现有事件可可靠映射）。

不要把底层审计 event 全部直接显示。

### Followup Attachment

当前现有 Customer Detail 聚合如未完整带附件，移动 Timeline 需要显式加载附件关系，避免出现“PC 跟进有图，小程序时间线看不到”的断层。

---

# 十、媒体上传 API

```text
POST /api/mobile/media
Content-Type: multipart/form-data
```

Body：

```text
file
media_type=image|audio
```

服务端：

1. Bearer 鉴权；
2. 文件名规范化；
3. MIME 白名单；
4. Magic bytes / 真实类型校验（能做则做）；
5. Size Limit；
6. SHA256；
7. 存临时目录；
8. 写 mobile_media_draft；
9. 音频置 `transcription_status=pending`。

响应：

```json
{
  "media_id": "uuid",
  "media_type": "audio",
  "status": "uploaded",
  "transcription_status": "pending"
}
```

不要在手机端用大 Base64 JSON 上传音频。

---

# 十一、语音录制

前端使用 Taro RecorderManager / 微信录音能力。

V1 推荐限制：

- 单段最长 10 分钟；
- 实际业务鼓励 30 秒~3 分钟；
- 格式优先 mp3 / aac（按平台支持最终确定）；
- 结束录音先保留本地 tempFilePath；
- 上传成功前不能把本地引用清掉。

## ASR 状态

```text
pending
processing
success
failed
```

小程序轮询 `/media/{id}/status`，间隔应逐步放缓，不要 200ms 狂刷。

失败时：

- 原音频仍能播放；
- 可点击“重新转写”；
- 可手动输入；
- 不影响保存 Followup。

---

# 十二、AI 整理 API

```text
POST /api/mobile/ai/followup-draft
```

Input：

```json
{
  "customer_id": "uuid",
  "contact_id": "uuid",
  "interaction_method": "visit",
  "transcript": "...",
  "typed_note": "..."
}
```

Output Schema：

```json
{
  "communication_summary": "...",
  "customer_needs": ["..."],
  "next_actions": ["..."],
  "suggested_next_followup_at": null,
  "opportunity_hints": ["..."]
}
```

### 强规则

- `suggested_next_followup_at` 没有明确依据时返回 null；
- 不生成虚构金额；
- 不修改客户等级；
- 不直接写商机；
- 不直接写订单；
- 不把推测当事实；
- 用户点击保存前可编辑所有输出。

---

# 十三、正式保存 Followup

```text
POST /api/mobile/customers/{customer_id}/followups
```

示意：

```json
{
  "contact_id": "uuid",
  "occurred_at": "...",
  "interaction_method": "visit",
  "contact_result": "good",
  "is_effective": true,
  "summary": "用户确认后的沟通摘要",
  "next_action": "发送三档报价",
  "next_followup_at": "...",
  "media_ids": ["uuid1", "uuid2"],
  "raw_transcript": "...",
  "ai_output": {}
}
```

服务端执行顺序：

1. 权限确认 customer；
2. media 都属于当前 user 且未过期；
3. 构造现有 FollowupInput；
4. 调用 `crm_service.save_followup()`；
5. 把 media 迁移 / 绑定到 FollowupAttachment；
6. 写 AI Snapshot；
7. 同一事务或可补偿事务中提交；
8. linked Task 继续由 save_followup 产生。

如果附件迁移失败，不能出现“显示保存成功但照片全丢”。

---

# 十四、照片

前端：Taro `chooseMedia()`。

V1：

- 图片最多 9 张 / 一条跟进；
- 上传前压缩；
- 查看缩略图；
- 支持删除；
- 失败重试。

服务端继续遵守现有 followup image size 配置，必要时调整配置，而不是前端写死一个与服务端不同的限制。

OCR：V1.1 可增加：

```text
POST /api/mobile/media/{id}/ocr
```

但 V1 核心不依赖 OCR。

---

# 十五、地图服务

中国大陆微信小程序地图建议与腾讯地图坐标体系保持一致。

## 地理编码

由后端 Worker 对公司地址执行，不把地图 Secret 暴露到小程序。

## Nearby API

```text
GET /api/mobile/nearby
  ?latitude=36.66
  &longitude=117.05
  &radius_km=3
```

### 必须先做 Customer Scope

伪代码：

```python
scoped = crm_service.customer_scope(db, actor)
scoped = scoped.where(Customer.geocode_status == 'success')
scoped = bounding_box_filter(scoped, user_lat, user_lng, radius)
rows = scoped.limit(200)
result = calculate_haversine_and_filter(rows, radius)
return sorted(result, key=distance)
```

不是先查全公司客户再让前端过滤。

## 返回

```json
{
  "customers": [
    {
      "id": "...",
      "name": "...",
      "level": "A",
      "latitude": 36.0,
      "longitude": 117.0,
      "distance_m": 820,
      "days_since_followup": 42,
      "months_since_order": 3,
      "has_due_task": true
    }
  ]
}
```

销售的纬度经度只用于这次请求，不写数据库。

---

# 十六、登录安全

V1 Bearer Token：

- 用高熵随机 token；
- 服务端存 token hash 或沿用现有安全 session 存储模式；
- 有过期时间；
- logout 后失效；
- 本地只存 token，不存密码；
- 401 清理 token 并回登录；
- 日志禁止打印 token。

---

# 十七、审计

关键操作建议写 Activity Log：

- mobile_login；
- followup_create_mobile；
- media_attach；
- task_complete_mobile。

不要记录原始 Authorization Token、密码和客户完整录音文本到普通 debug 日志。

---

# 十八、错误码

移动端建议统一：

```json
{
  "code": "CUSTOMER_FORBIDDEN",
  "message": "你没有权限查看该客户",
  "request_id": "..."
}
```

典型：

```text
AUTH_REQUIRED
AUTH_EXPIRED
CUSTOMER_FORBIDDEN
CUSTOMER_NOT_FOUND
MEDIA_TOO_LARGE
MEDIA_TYPE_UNSUPPORTED
MEDIA_EXPIRED
TRANSCRIPTION_FAILED
AI_FAILED
LOCATION_INVALID
VALIDATION_ERROR
```

UI 根据 code 给人能看懂的信息，不展示 Python traceback。
