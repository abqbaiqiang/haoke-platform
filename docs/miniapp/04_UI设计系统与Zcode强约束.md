# 好客齐鲁微信小程序 CRM
## UI 设计系统与 Zcode 强约束

> 这份文件不是建议，是实现约束。

六张已确认视觉参考图位于 `ui/`。

---

# 一、视觉定位

关键词：

- 企业级；
- 克制；
- 清晰；
- 移动执行工具；
- 信息层级明确；
- 蓝灰 + 白；
- 轻量阴影；
- 不花哨。

不是：

- 宣传海报；
- 电商页面；
- 驾驶舱；
- 卡通；
- 大面积渐变；
- 五颜六色标签墙。

---

# 二、与现有 PC 视觉体系对齐

现有项目 `globals.css` / `DESIGN.md` 已明确主基调。

小程序继续继承：

```scss
$color-brand: #2563eb;
$color-brand-strong: #1d4ed8;
$color-brand-soft: #eff6ff;

$color-text: #18181b;
$color-muted: #71717a;
$color-line: #e4e4e7;
$color-line-strong: #d4d4d8;

$color-bg: #f7f7f8;
$color-card: #ffffff;

$color-danger: #dc2626;
$color-warning: #d97706;
$color-success: #16a34a; // 只用于状态，不可成为第二主题色
```

禁止为小程序新造一套紫色 / 青色主题。

---

# 三、Design Tokens

新建：

```text
apps/miniapp/src/styles/tokens.scss
```

建议：

```scss
:root {
  --brand: #2563eb;
  --brand-strong: #1d4ed8;
  --brand-soft: #eff6ff;

  --text: #18181b;
  --text-secondary: #52525b;
  --muted: #71717a;
  --line: #e4e4e7;
  --bg: #f7f7f8;
  --card: #ffffff;

  --danger: #dc2626;
  --warning: #d97706;
  --success: #16a34a;

  --radius-sm: 12rpx;
  --radius-md: 20rpx;
  --radius-lg: 28rpx;

  --space-1: 8rpx;
  --space-2: 16rpx;
  --space-3: 24rpx;
  --space-4: 32rpx;
  --space-5: 40rpx;
  --space-6: 48rpx;

  --page-x: 28rpx;
  --card-padding: 28rpx;

  --font-xs: 22rpx;
  --font-sm: 24rpx;
  --font-md: 28rpx;
  --font-lg: 32rpx;
  --font-xl: 40rpx;

  --touch-min: 88rpx;
}
```

如 Taro / 小程序环境对 CSS Variables 有兼容问题，可以编译为 SCSS Variables，但 Token 值必须保持集中管理。

---

# 四、字体

优先：

```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
```

规则：

- 页面主标题：40rpx 左右，700；
- 区块标题：32rpx，600~700；
- 客户名 / 重要正文：28~30rpx，600；
- 正文：26~28rpx；
- 辅助：22~24rpx；
- 行高 1.35~1.6。

禁止满屏粗体。

---

# 五、页面框架

统一：

- 背景 `#f7f7f8`；
- 左右安全边距 28rpx；
- 区块间距 24~32rpx；
- 卡片底色白；
- 主内容从上往下自然滚动；
- 不使用 PC 风格多栏 Dashboard。

顶部淡山水背景属于“品牌装饰”，只能非常轻，不得抢信息。

如果实现山水素材困难，可以先用非常淡的蓝灰抽象纹理 / 留白，不要让 Zcode 即兴画一张国潮海报。

---

# 六、卡片

标准卡：

```scss
.card {
  background: #fff;
  border: 1rpx solid rgba(24, 24, 27, .05);
  border-radius: 20rpx;
  padding: 28rpx;
  box-shadow: 0 2rpx 6rpx rgba(0,0,0,.025);
}
```

大卡允许 24~28rpx 圆角。

禁止：

- 40px 以上夸张圆角；
- 重阴影；
- 黑色悬浮阴影；
- 多彩描边；
- 每张卡不同背景色。

---

# 七、按钮

主按钮：

- 品牌蓝；
- 白字；
- 最低点击高度 88rpx；
- 圆角 16~20rpx。

次按钮：

- 白底 / 品牌软蓝；
- 蓝字；
- 1rpx 浅边框。

危险按钮仅真正危险操作使用红色。

不使用渐变按钮。

---

# 八、标签

标签是辅助信息，不能成为页面主视觉。

大小：

- 高约 44~48rpx；
- 字体 22~24rpx；
- 圆角 8~12rpx；
- 颜色低饱和。

客户等级可用浅红 / 浅蓝，但一个卡片上最多 3~4 个标签。

---

# 九、图标

要求：

- 同一套线性 / 轻填充风格；
- 视觉线宽一致；
- 主要 36~44rpx；
- 品牌蓝 / 灰为主；
- 不混用卡通 Emoji 当正式图标。

首版建议把所需图标作为项目静态资源集中维护，避免页面随手从不同包找图标。

如果引入第三方 icon 包，先证明在 Taro 微信小程序构建正常，再统一使用。

---

# 十、底部 TabBar

固定 4 项：

```text
工作台 / 客户 / 附近 / 我的
```

颜色：

- 未选中 `#71717a`
- 选中 `#2563eb`
- 背景 `#ffffff`
- 顶部 1rpx 分隔线。

优先使用原生小程序 TabBar，提高稳定性。

---

# 十一、客户时间线视觉

这是设计重点。

结构：

```text
日期时间  ● ── [动态卡片]
          │
日期时间  ● ── [动态卡片]
```

不同类型只通过小图标 / 轻微状态色区分，不要每类一整张彩色卡。

AI 整理区：

- `brand-soft` 淡蓝底；
- 左上角小“AI整理”；
- 3~4 条重点；
- 不做闪光渐变和“科技大屏”。

朋友圈感来自**连续时间线 + 内容卡片 + 图片/音频**，不是靠复制微信绿色和聊天气泡。

---

# 十二、录音组件

VoiceRecorder 必须有明确状态：

Idle：麦克风 + “语音记录”  
Recording：红点 / 时长 + “结束”  
Recorded：播放 + 时长 + 重录  
Uploading：进度  
Transcribing：文字提示  
Failed：重试

不要只放一个麦克风图标然后用户不知道有没有录上。

---

# 十三、照片区域

- 3 列缩略图；
- 1:1 或 4:3 统一；
- 圆角 12rpx；
- 上传状态覆盖层；
- 失败红色小提示；
- 删除按钮点击区域至少 56rpx。

不要把用户照片作为“装饰背景”。

---

# 十四、地图

地图是信息底图，不做花哨皮肤。

Marker：

- 品牌蓝；
- 当前选中略放大；
- 客户名称通过 Callout 或底部列表展示；
- A/B 类不要用四五种 Marker 颜色做成圣诞树。

底部 Nearby Sheet：

- 白底；
- 顶部 20~28rpx 圆角；
- 可滚动；
- 地图和列表各占合理空间。

---

# 十五、严格禁止 Zcode 自由发挥的 15 条

1. 不得改变 6 个页面的核心模块顺序。
2. 不得添加“新增客户”。
3. 不得添加 BI 图表。
4. 不得添加业绩和销售金额 KPI 到工作台 / 我的。
5. 不得使用页面级随机颜色。
6. 不得大面积渐变。
7. 不得每页独立定义圆角和字体。
8. 不得把所有信息都做成卡片导致“满屏都是重点”。
9. 不得在列表上堆 8 个字段。
10. 不得用大量粗体和红色制造注意力噪音。
11. 不得修改参考图的页面信息架构来“优化”。
12. 不得直接复制 PC 页面 DOM 结构缩小到手机。
13. 不得把业务组件写成单页私有 JSX 后在其他页面复制。
14. 不得用内联 style 硬编码主题值，动态坐标 / 动画值除外。
15. 不得因为 UI 库默认样式方便就牺牲已确认视觉。

---

# 十六、组件强制复用表

至少建立：

```text
SectionCard
SectionHeader
TaskRow
CustomerRow
CustomerLevelTag
EmptyState
CustomerHeader
VisitBrief
TimelineItem
FollowupTimelineCard
AISummaryCard
VoiceRecorder
MediaPicker
UploadStrip
NearbyCustomerRow
```

Zcode 每准备新写一个“看起来类似”的块，先搜索已有组件。

---

# 十七、参考图与实现关系

参考图是高保真方向，但不是要求逐字像素复制示例文字。

必须一致：

- 信息层级；
- 模块顺序；
- 留白；
- 卡片比例；
- 主次色；
- 按钮优先级；
- TabBar；
- 时间线结构；
- 地图 + Bottom Sheet 结构。

可以根据真实小程序系统栏调整：

- 顶部安全区；
- 胶囊按钮避让；
- iPhone 安全区；
- 字体渲染。

---

# 十八、视觉验收方式

每个页面开发完成后必须：

1. 在固定测试数据下运行；
2. 微信开发者工具截屏；
3. 使用 375×812 / 390×844 等常见视口检查；
4. 与对应 `ui/*.png` 并排比较；
5. 逐项检查：模块顺序、宽度、间距、字号、卡片高度、按钮、颜色、信息密度；
6. 不合格先修 UI，再进入下一页。

不要等六页都写完才统一 UI。那通常意味着统一的只剩下后悔。

---

# 十九、是否使用 UI 库 / Skill / MCP

## V1 推荐

**核心业务 UI 使用 Taro 原生组件 + 自建 SCSS / 业务组件。**

理由：当前这套视觉高度定制，重 UI 库常常会让 Zcode 顺手套默认组件，结果“功能对了，脸换了”。

可选引入成熟库用于：

- Picker；
- Popup；
- Dialog；
- Toast；
- Loading；
- DatePicker。

但要经过：

- Taro 4；
- React 当前版本；
- 微信小程序构建

兼容性验证。

NutUI React Taro 具备移动组件和 AI Coding / Skill / MCP 方向，可以作为**查组件 API 的辅助资料**。不要把 Beta MCP 当成产品依赖，不要因为接了 MCP 就放弃本文件中的 UI 约束。

## 推荐给 Zcode 的“UI Skill 内容”

如果 Zcode 支持项目级 Skill / Rules，把本文件作为规则源，并要求：

```text
When implementing miniapp UI:
- Treat /ui reference PNGs and 04_UI...md as source of truth.
- Never invent new visual tokens.
- Reuse existing miniapp components before creating new ones.
- Do not expose Add Customer.
- Do not add BI or revenue KPI.
- Use exact page structure defined in 03_Page...
- After each page, create a screenshot and compare before continuing.
```

这比接一个“万能 UI MCP”可靠得多。
