"use client";

import { useData } from "../lib/api";
import type { CustomerRow as Customer, TaskRow as Task } from "../lib/types";

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
