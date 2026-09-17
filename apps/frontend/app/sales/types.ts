"use client";

import type { CustomerRow as Customer, TaskRow as Task } from "../lib/types";

/** 业绩趋势单点：value/last_year 为 null 表示该月无已核实数据。 */
export type TrendPoint = { date: string; value: string | null; last_year: string | null };

/** 销售员端弹窗状态：记录跟进 / 新建待办 / 调整待办 / 直接完成待办。 */
export type DialogState = { kind: "follow" | "task" | "defer" | "complete"; customer?: Customer; task?: Task };
