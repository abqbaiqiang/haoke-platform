---
name: 好客齐鲁经营管理平台
description: 山东食品/礼品批发公司的内部经营管理平台：晨会大屏式经营驾驶舱 + 轻量 CRM。中性灰白界面 + 品牌蓝交互色（蓝白 SaaS 风）。
colors:
  accent: "#2563eb"
  accent-strong: "#1d4ed8"
  accent-soft: "#eff6ff"
  ink: "#18181b"
  muted: "#71717a"
  paper: "#f7f7f8"
  card: "#ffffff"
  line: "#e4e4e7"
  line-strong: "#d4d4d8"
  danger: "#dc2626"
  warn-bg: "#fffaea"
  warn-ink: "#7a5a17"
  sidebar: "#1e2a38"
typography:
  display-hero:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "clamp(44px, 6vw, 84px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-2.5px"
  h1:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.6px"
  h2:
    fontSize: "17px"
    fontWeight: 650
  body:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  numeric:
    fontVariantNumeric: "tabular-nums"
    letterSpacing: "-1px"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "26px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    rounded: "8px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "#27272a"
    borderColor: "{colors.line-strong}"
    rounded: "8px"
  status-pending:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-ink}"
    rounded: "5px"
  status-ready:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "5px"
  fold-panel:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.line}"
    rounded: "{rounded.lg}"
---

# 好客齐鲁经营管理平台 — 设计系统

## 2026-09-14 销售界面参考图契约（优先于旧多角色驾驶舱说明）

销售角色使用用户提供的四张蓝白参考图：深蓝灰侧栏、浅灰页面、白色内容面板、蓝色交互。四个主入口为工作台/客户/待办/我的业绩；桌面工作台左右约 1.75:1，客户/待办全宽列表；不套用老板晨会大数字布局。标题 30px、面板标题 20px、正文14px、表格13px，所有文字使用中文系统字体。主要工作是联系客户→记录跟进→安排下一步。参考图的示例金额、日期、图表不作为真实数据；重复提醒、快捷说明和互斥客户阶段不照搬。具体交互和验证见 docs/24。

## Overview

内部经营平台，Mode 以 Operate 为主。视觉世界（2026-09 全站换皮，参考 Twenty/Linear 的中性风）：纸白偏中性的 zinc 灰底、近黑正文、极细灰线、品牌蓝唯一交互色。公司当前没有品牌色——品牌蓝是当前唯一强调色，未来若定品牌色只需替换 `--accent*` 三个 token。驾驶舱首页是"晨会大屏"：一位主角数字统治首屏，其余信息折叠退后。

## Colors

### Primary

品牌蓝 `#2563eb`（hover `#1d4ed8`，浅底 `#eff6ff`）。用于主按钮、链接、侧栏选中、图表柱、进度条、正增长方向、focus 描边。参考用户提供的蓝白 SaaS 风格样张（多维表格定制开发海报）。

### Neutral

页面 `#f7f7f8`、卡片/侧栏 `#ffffff`/`#fafafa`、正文 `#18181b`、次要 `#71717a`、边线 `#e4e4e7` / `#d4d4d8`。登录页左屏为品牌蓝渐变 `#1e3fae → #2563eb` + 浅蓝氛围光。

### Named Rules

- 琥珀（`#fffaea` 底 / `#7a5a17` 字）**只**用于"待核实/未就绪"警示，不作装饰。
- 红色 `#dc2626` 用于负增长、错误与危险操作。
- 全站禁止绿色系品牌色（历史森林绿已废弃）；绿色只允许作为语义"成功"极少量出现，默认用 indigo 表达肯定。
- 数据未核实时不估数，只标状态。

## Typography

系统字体栈（system-ui/PingFang SC/Microsoft YaHei）。正文 14px/1.55；H1 30px；面板标题 17px/650。
### Hierarchy

驾驶舱英雄数字为全站唯一超大字号层：`clamp(44px, 6vw, 84px)`、700、-2.5px 字距、tabular-nums、不换行；单位与注释小号弱化。

### Named Rules

所有数字一律 `tabular-nums`，表格数值右对齐；不使用渐变文字，强调只靠字重与字号。

## Layout

工作区为 `208–248px 浅色侧栏 + 内容` 网格；内容区最大 1600px、左右 28px。网格子项一律 `minmax(0,1fr)` 防溢出；表格横向滚动限定在卡片内。≤640px 单列、侧栏转顶部横滑导航。

## Elevation & Depth

克制：卡片默认低透明黑阴影（`--shadow`），驾驶舱面板以 1px 边线分层。禁零偏移彩色光晕。

## Shapes

圆角：控件 6–8px、卡片 10px。禁卡片单侧彩色粗边（side-tab）、禁圆角卡粗顶边强调。

## Components

- 主按钮（品牌蓝底白字）/ 次按钮（白底 1px 灰边）；文字按钮 `.text-button` 无边框蓝。
- 状态章：`.status-ready` 蓝浅底 / `.status-pending` 琥珀底。
- 折叠面板 `.fold`：1px 边卡，summary 含计数与"展开/收起"，无卡中卡。
- 侧栏：深蓝色块 `#1e2a38`（参照精斗云），每项配 15px 手绘线性 SVG 图标（stroke 1.8、圆角端点、currentColor），选中项品牌蓝底白字；导航为真实链接。
- 指标口径以 `<details>` 就近折叠，含 definition + source + metric code。

## Do's and Don'ts

- Don't 引入绿色系或第二套彩色主题；换色只改 `--accent*` 三个 token。
- Don't 未核实的数冒充已核实；口径未确认时不显示完成率/勾稽差异。
- Don't 使用 kicker/eyebrow 小标签、单侧色条、硬偏移阴影、渐变文字。
- Do 让每个经营数字可点击钻取到对应分析页。
