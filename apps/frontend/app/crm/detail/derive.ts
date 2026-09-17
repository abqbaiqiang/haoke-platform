"use client";

import type { Contact } from "../../lib/types";
import type { Detail } from "../types";

/** 概览工作台派生数据：下一步 = 最早到期的待处理待办；当前商机 = 预计成交最近且未关闭的商机。 */
export function nextTaskOf(detail: Detail) {
  return detail.tasks.filter(t => t.status === "todo").slice().sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at))[0];
}
export function currentOppOf(detail: Detail) {
  return detail.opportunities.filter(o => o.status === "open").slice()
    .sort((a, b) => Date.parse(a.expected_close_date || "9999-12-31") - Date.parse(b.expected_close_date || "9999-12-31"))[0];
}
export function activeContactsOf(detail: Detail): Contact[] {
  return detail.contacts.filter(c => c.is_active);
}
export function primaryContactOf(detail: Detail) {
  const active = activeContactsOf(detail);
  return active.find(c => c.is_primary) || active[0];
}
export function lastFollowOf(detail: Detail) {
  return detail.followups[0];
}
