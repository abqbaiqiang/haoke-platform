"use client";

import type { Contact, Customer, Followup, Opportunity, Tag, Task } from "../lib/types";

/** 客户 360 详情（/api/crm/customers/:id）。 */
export type Detail = { has_more_history: boolean; sales_summary: { order_count: number; total_amount: string; year_amount: string; last_order_date: string | null; top_products: { name: string; amount: string }[] }; customer: Customer; contacts: Contact[]; followups: Followup[]; tasks: Task[]; opportunities: Opportunity[]; tags: Tag[]; events: { id: string; activity_type: string; occurred_at: string; user_id: string; details: { after?: { reason?: string; owner_user_id?: string } } | null }[]; orders: { id: string; order_no: string; order_date: string; sales_amount: string }[] };

/** 经营画像（/api/bi/customer-profile/:id）。 */
export type Profile = { customer_id: string; name: string; layer: string | null; days_since: number | null; last_order_date: string | null; orders: number; amount: string; aov: string | null; is_repeat: boolean; convert_days: number | null; warnings: string[] };

/** Editor 表单值与字段定义。 */
export type Value = string | boolean | number | null | string[];
export type Field = { key: string; label: string; type?: string; required?: boolean; options?: [string, string][]; step?: string; maxLength?: number; min?: string; max?: string };
