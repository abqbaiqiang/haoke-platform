"use client";

import { stamp } from "../lib/format";
import { interactionMethodLabels as methodLabels } from "../lib/labels";
import type { FollowupRow as Follow, Page } from "../lib/types";
import type { Data, Route } from "./types";
import { Empty } from "./ui";

/** 最近跟进表格：工作台面板与“我的跟进记录”弹窗共用。 */
export function RecentTable({ recent, go }: { recent: Data<Page<Follow>>; go: (r: Route) => void }) {
  return recent.data?.rows.length ? (
    <div className="sales-table-scroll">
      <table className="sales-table">
        <thead><tr><th>跟进时间</th><th>客户名称</th><th>沟通方式</th><th>沟通摘要</th><th>下一步时间</th></tr></thead>
        <tbody>{recent.data.rows.map(f =>
          <tr key={f.id}>
            <td>{stamp(f.occurred_at)}</td>
            <td><button className="sales-customer-link" onClick={() => go({ screen: "customers", customerId: f.customer_id })}>{f.customer_name}</button></td>
            <td><span className="wb-method">{methodLabels[f.interaction_method] || "其他"}</span></td>
            <td>{f.summary || "未填写摘要"}</td>
            <td>{f.next_followup_at ? stamp(f.next_followup_at, false) : "未安排"}</td>
          </tr>)}</tbody>
      </table>
    </div>
  ) : <Empty>{recent.loading ? "正在加载跟进…" : "还没有跟进记录，完成客户沟通后可以记录在这里。"}</Empty>;
}
