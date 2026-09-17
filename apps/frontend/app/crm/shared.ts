"use client";

import { money as baseMoney } from "../lib/format";

/** CRM 金额空值显示“未填写”，不加 ¥ 前缀。 */
export const money = (value: string | null) => baseMoney(value, { empty: "未填写" });

/** 下一步/最近成交的相对时间描述。 */
export const relLabel = (diff: number) => diff === 0 ? "今天" : diff > 0 ? (diff === 1 ? "明天" : `${diff} 天后`) : (diff === -1 ? "1 天前" : `${-diff} 天前`);

/** 枚举选项转显示文案；未匹配时回退原值。 */
export const text = (options: [string, string][], value: string) => options.find(x => x[0] === value)?.[1] || value;
