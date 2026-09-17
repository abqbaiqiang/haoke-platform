"use client";

import { useData } from "../lib/api";
import type { CustomerRow as Customer, Metric, TaskRow as Task } from "../lib/types";

/** 销售员端四个屏幕。 */
export type Screen = "workbench" | "customers" | "tasks" | "performance";

/** #sales 哈希路由状态。 */
export type Route = { screen: Screen; pool?: boolean; customerId?: string; q?: string; taskView?: string };

/** 销售员端弹窗状态：记录跟进 / 新建待办 / 调整待办 / 直接完成待办。 */
export type DialogState = { kind: "follow" | "task" | "defer" | "complete"; customer?: Customer; task?: Task };

/** 业绩趋势单点：value/last_year 为 null 表示该月无已核实数据。 */
export type TrendPoint = { date: string; value: string | null; last_year: string | null };

/** useData 的返回结构。 */
export type Data<T> = ReturnType<typeof useData<T>>;

/** 经营工作台指标（/api/bi/workbench）。 */
export type Work = { metrics: Metric[]; through: string; warnings: string[] };

/** 最近商机行（/api/sales/opportunities）。 */
export type OppRow = { id: string; customer_id: string; customer_name: string; opportunity_name: string; stage: string; estimated_amount: string | null; expected_close_date: string | null; created_at: string; products: { id: string; name: string }[] };

/** 业绩统计期间档位。 */
export type PerfPreset = "this" | "last" | "quarter" | "year";

/** 交易来源（/api/bi/sources）。 */
export type Source = { id: string; name: string };

/** 全部成交客户列表（/api/bi/sales dimension=customer）。 */
export type Analysis = { basis: string; through: string; warnings: string[]; trend: { date: string; value: string }[]; rows: { id: string; name: string; current: string }[]; total_rows: number };

type TopCustomer = { id: string; name: string; amount: string | null; last_year: string | null; yoy: string | null };
type ProductRow = { name: string; amount: string | null; yoy: string | null; customers: number | null };
type FunnelStage = { stage: string; current: number | null; prev: number | null };
type RiskCount = { kind: string; count: number };

/** 个人业绩（/api/sales/performance）。 */
export type Performance = { through: string | null; verified: boolean; warnings: string[]; month_amount: string | null; target_amount: string | null; completion: string | null; last_year_amount: string | null; yoy: string | null; remaining: string | null; workdays_remaining: number | null; daily_required: string | null; risks: RiskCount[]; trend: TrendPoint[]; key_metrics: Record<string, string | null>; top_customers: TopCustomer[]; structure: Record<string, string | number | null>; products: ProductRow[]; funnel: FunnelStage[] };

/** 精斗云原始单据明细（/api/data/sales/orders/:id）。 */
export type OrderDetail = { order_no: string; customer: string; amount: string; lines: { line_no: number; quantity: string; amount: string }[] };
