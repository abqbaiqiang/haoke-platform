// C2 前端公共层：与后端 schema 镜像的共享类型（docs/29 任务书）。
// 金额与日期字段以字符串镜像后端（Decimal/date 序列化），前端不做数值换算。
// 依据：apps/backend/app/crm_schemas.py、app/bi_schemas.py、app/schemas.py、app/sales_workspace.py。

// ---------- 通用 ----------

export type Role = "owner" | "manager" | "sales" | "finance" | "admin";

export type User = { id: string; username: string; display_name: string; role_code: Role; last_login_at: string | null };
export type Identity = { user: User; scope_type: string; member_ids: string[]; timezone: string };

export type Page<T> = { rows: T[]; total: number };

/** BI 指标（bi_schemas.Metric）。 */
export type Metric = { code: string; label: string; value: string | null; unit: string; reason: string | null; definition: string; source: string };

/** BI 数据源/人员共用形（bi_schemas.Person：{id, name}）。 */
export type BiPerson = { id: string; name: string };

/** 源订单行（bi_schemas.OrderRow）。 */
export type OrderRow = { id: string; number: string; date: string; amount: string; status: string };

/** 客户关注项（bi_schemas.Attention/AttentionPage）。 */
export type AttentionItem = { id: string; name: string; kind: string; days: number | null };
export type AttentionPage = { rows: AttentionItem[]; total: number; warnings: string[]; counts: Record<string, number> };

/** 经营总览需要关注项（bi_schemas.AttentionItem，customer_id 键）。 */
export type OverviewAttention = { customer_id: string; name: string; kind: string; days: number | null };

// ---------- CRM（crm_schemas.py）----------

export type Claim = { user_id: string; display_name: string; claimed_at: string };

export type CustomerStatus = "potential" | "contacted" | "demand" | "quoted" | "won" | "dormant";
export type LifecycleStatus = "prospect" | "active" | "dormant" | "lost";
export type CustomerLevel = "A" | "B" | "C" | "D";

/** 客户（crm_schemas.CustomerView）。 */
export type Customer = {
  id: string;
  source_system: string;
  customer_code: string | null;
  customer_name: string;
  owner_user_id: string | null;
  ownership_status: string;
  customer_type: string | null;
  customer_level: CustomerLevel | null;
  customer_status: CustomerStatus | null;
  lifecycle_status: LifecycleStatus;
  remark: string | null;
  bound_customer_id: string | null;
  bound_at: string | null;
  created_at: string;
  is_active: boolean;
  claims: Claim[];
};

/** 销售工作台客户行（sales_workspace.CustomerRow = CustomerView + 列表聚合字段）。 */
export type CustomerRow = Customer & {
  contact_name: string | null;
  last_followup: string | null;
  next_action: string | null;
  next_due: string | null;
  tags: string[];
};

/** 联系人业务角色（crm_schemas.ContactInput.decision_role）。 */
export type DecisionRole = "decision_maker" | "buyer" | "boss" | "finance" | "influencer" | "user" | "key_relationship" | "introducer" | "other";

/** 联系人（crm_schemas.ContactView）。 */
export type Contact = {
  id: string;
  customer_id: string;
  name: string;
  role_label: string | null;
  decision_role: DecisionRole | null;
  mobile: string | null;
  wechat: string | null;
  email: string | null;
  is_primary: boolean;
  relationship_note: string | null;
  is_active: boolean;
};

/** 跟进记录（crm_schemas.FollowupView，含 is_effective）。 */
export type Followup = {
  id: string;
  customer_id: string;
  owner_user_id: string;
  occurred_at: string;
  interaction_method: string;
  contact_result: string;
  is_effective: boolean | null;
  summary: string | null;
  material_sent: boolean;
  material_note: string | null;
  quotation_sent: boolean;
  next_action: string | null;
  next_followup_at: string | null;
  contact_id: string | null;
  created_at: string;
  is_active: boolean;
};

/** 销售工作台最近跟进行（sales_workspace.RecentRow = FollowupView + customer_name）。 */
export type FollowupRow = Followup & { customer_name: string };

export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskType = "followup" | "quote" | "collection" | "material" | "meeting" | "other";
export type TaskStatus = "todo" | "done" | "cancelled";

/** 待办（crm_schemas.TaskView，含 priority）。 */
export type Task = {
  id: string;
  title: string;
  assignee_user_id: string;
  customer_id: string | null;
  opportunity_id: string | null;
  due_at: string;
  priority: TaskPriority;
  task_type: TaskType;
  source_type: string;
  status: TaskStatus;
  completion_result: string | null;
  completed_at: string | null;
  followup_id: string | null;
};

/** 销售工作台待办行（sales_workspace.TaskRow = TaskView + customer_name/customer_level）。 */
export type TaskRow = Task & { customer_name: string | null; customer_level: string | null };

/** 销售工作台待办分页（sales_workspace.Tasks，含视图计数）。 */
export type TaskPage = Page<TaskRow> & { counts: Record<string, number> };

export type OpportunityStage = "initial" | "demand" | "quoted" | "negotiating" | "won" | "lost";

/** 商机（crm_schemas.OpportunityView）。 */
export type Opportunity = {
  id: string;
  customer_id: string;
  opportunity_name: string;
  owner_user_id: string;
  stage: OpportunityStage;
  status: string;
  estimated_amount: string | null;
  probability: string | null;
  weighted_amount: string | null;
  expected_close_date: string | null;
  need_summary: string | null;
  current_blocker: string | null;
  next_promotion: string | null;
  lost_reason: string | null;
  closed_at: string | null;
  products: { id: string; name: string }[];
};

/** 标签（crm_schemas.TagView）。 */
export type Tag = { id: string; tag_name: string; tag_group: string | null; is_active: boolean; created_by: string | null };

/** CRM 参数（crm_schemas.Settings）。 */
export type CrmSettings = { sales_create_tags: boolean; followup_edit_hours: number; public_pool_claim_enabled: boolean; allow_prospect_create: boolean };

/** CRM 人员（crm_schemas.Person：{id, display_name, username}）。 */
export type CrmPerson = { id: string; display_name: string; username: string };
