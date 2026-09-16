// C2 前端公共层：角色/阶段/枚举中译统一收敛（docs/29 任务书）。
// 有字典条目的以 docs/03_V1数据字典.md 为唯一权威；无条目的（客户阶段、任务类型等）以 CRM 端现行文案为准。
import type { Role } from "./types";

// ---------- 角色 ----------

export const roleLabels: Record<Role, string> = { owner: "老板", manager: "销售经理", sales: "销售业务员", finance: "财务", admin: "系统管理员" };

// ---------- CRM 任务 ----------

export const taskTypeLabels: Record<string, string> = { followup: "客户回访", quote: "报价跟进", collection: "回款跟进", material: "资料发送", meeting: "客户会面", other: "其他" };

/** 待办来源（source_type）。 */
export const taskSourceLabels: Record<string, string> = { followup: "客户跟进", manual: "手工任务", manager: "经理指派" };

// ---------- 客户状态 ----------

/** 客户阶段（customer_status，无字典条目，按 CRM 端现行文案）。 */
export const customerStatusLabels: Record<string, string> = { potential: "新客户", contacted: "已接触", demand: "有需求", quoted: "已报价", won: "已成交", dormant: "沉睡" };
export const customerStatusOptions: [string, string][] = Object.entries(customerStatusLabels);

/** 合作状态（lifecycle_status，字典 §736）。 */
export const lifecycleLabels: Record<string, string> = { prospect: "潜客", active: "活跃", dormant: "沉睡", lost: "流失" };
export const lifecycleOptions: [string, string][] = Object.entries(lifecycleLabels);

// ---------- 跟进（字典 §740/§741）----------

export const interactionMethodLabels: Record<string, string> = { phone: "电话", wechat: "微信", visit: "拜访", meeting: "面谈", quote: "报价", other: "其他" };
export const interactionMethodOptions: [string, string][] = Object.entries(interactionMethodLabels);

/** 沟通结果；选项顺序沿用 CRM 编辑器的现行顺序（good 在前作为默认项）。 */
export const contactResultLabels: Record<string, string> = { no_answer: "未接通", good: "沟通顺利", normal: "已沟通", no_need: "暂无需求", waiting: "等待反馈", rejected: "明确拒绝", won: "已成交", other: "其他" };
export const contactResultOptions: [string, string][] = [["good", "沟通顺利"], ["normal", "已沟通"], ["no_answer", "未接通"], ["no_need", "暂无需求"], ["waiting", "等待反馈"], ["rejected", "明确拒绝"], ["won", "已成交"], ["other", "其他"]];

// ---------- 商机（字典 §744）----------

export const opportunityStageLabels: Record<string, string> = { initial: "初步沟通", demand: "有明确需求", quoted: "已报价", negotiating: "谈判中", won: "成交", lost: "流失" };
export const opportunityStageOptions: [string, string][] = Object.entries(opportunityStageLabels);

/** 当前商机推进步骤条（展示用流程文案，非枚举直译）。 */
export const opportunityStageFlowOptions: [string, string][] = [["initial", "需求沟通"], ["demand", "方案沟通"], ["quoted", "报价"], ["negotiating", "谈判"], ["won", "成交"]];

/** 联系人业务角色（crm_schemas.ContactInput.decision_role）。 */
export const decisionRoleOptions: [string, string][] = [["decision_maker", "关键决策人"], ["buyer", "采购"], ["boss", "老板"], ["finance", "财务"], ["influencer", "影响人"], ["user", "使用者"], ["key_relationship", "关键关系人"], ["introducer", "引荐人"], ["other", "其他"]];

// ---------- CRM 操作审计 ----------

/** CRM 活动类型中译（时间线与“有效业务动作”设置共用）。 */
export const crmActivityLabels: Record<string, string> = {
  customer_create: "创建潜客",
  customer_pool_backfill: "存量客户移入公海",
  customer_update: "修改客户",
  customer_transfer: "调整客户归属",
  customer_bind: "绑定正式客户",
  customer_tags_update: "调整客户标签",
  followup_create: "新增跟进",
  followup_update: "修改跟进",
  followup_void: "作废跟进",
  contact_create: "新增联系人",
  contact_update: "修改联系人",
  task_create: "创建待办",
  task_complete: "完成待办",
  task_update: "修改待办",
  task_transfer: "转交待办",
  opportunity_create: "创建商机",
  opportunity_update: "修改商机",
  opportunity_transfer: "转交商机",
};

// ---------- 数据中心导入批次 ----------

export const importKindLabels: Record<string, string> = { customer: "客户档案", product: "商品档案", sales: "销售单", profit: "利润表", balance_sheet: "资产负债表" };
export const importStatusLabels: Record<string, string> = { pending: "待确认", failed: "预检未通过", success: "已导入" };

/** 按选项数组取值显示（无匹配时回退原值）。 */
export const optionText = (options: [string, string][], value: string) => options.find(x => x[0] === value)?.[1] || value;
