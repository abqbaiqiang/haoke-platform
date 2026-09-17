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
