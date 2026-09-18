"use client";

import { useEffect, useState } from "react";
import { api, useData } from "./lib/api";
import { money } from "./lib/format";

type ReportMonth = {
  month: string; confirmed: boolean; profit_uploaded: boolean; balance_uploaded: boolean;
  revenue: string | null; cost: string | null; gross_profit: string | null; net_profit: string | null;
  net_margin: string | null; cash: string | null; ar: string | null; inventory: string | null;
  assets: string | null; equity: string | null;
};
type Reports = { source_id: string; source_name: string; months: ReportMonth[]; latest_confirmed: string | null };
type Source = { id: string; name: string };

/** 财务报表页（老板 2026-09-18：驾驶舱看实时经营，报表按月独立查看）。 */
export default function FinanceReports() {
  const sources = useData<Source[]>("/api/bi/sources");
  const [sourceId, setSourceId] = useState("");
  useEffect(() => { if (!sourceId && sources.data?.length) setSourceId(sources.data[0].id); }, [sources.data, sourceId]);
  const reports = useData<Reports>(sourceId ? `/api/bi/finance-reports?source_id=${sourceId}` : null);
  const months = reports.data?.months || [];
  return (
    <div className="bi" style={{ padding: "20px 24px", maxWidth: 1600, margin: "0 auto" }}>
      <p className="eyebrow">工作空间 / 财务报表</p>
      <h1>财务报表</h1>
      <p className="muted">按月查看利润表与资产负债表关键数。驾驶舱看实时经营；这里看每月定稿的报表数字。未确认月份同样展示并标注。</p>
      <div className="bi-toolbar">
        <label>数据来源<select value={sourceId} onChange={e => setSourceId(e.target.value)}>{sources.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <button onClick={() => { window.location.hash = "data"; }}>上传/确认报表 →</button>
      </div>
      {reports.data && <p className="data-warning">{reports.data.latest_confirmed ? `最近已确认财务月：${reports.data.latest_confirmed.slice(0, 7)}。` : "尚无已确认财务月。"}1–7 月与当月报表请在数据中心上传利润表、资产负债表并确认；确认后此处自动纳入。</p>}
      {reports.loading ? <p className="muted">正在加载财务报表…</p> : reports.error ? <p className="error" role="alert">{reports.error} <button onClick={() => reports.retry()}>重试</button></p>
        : months.length ? (
          <div className="bi-table-wrap"><table>
            <thead><tr>
              <th>月份</th><th>状态</th><th className="num">营业收入（元）</th><th className="num">营业成本（元）</th><th className="num">毛利（元）</th>
              <th className="num">净利润（元）</th><th className="num">净利率</th><th className="num">货币资金（元）</th>
              <th className="num">应收账款（元）</th><th className="num">存货（元）</th><th className="num">资产总计（元）</th><th className="num">所有者权益（元）</th>
            </tr></thead>
            <tbody>{months.map(m => <tr key={m.month}>
              <td><strong>{m.month.slice(0, 7)}</strong></td>
              <td><span className={`layer-badge ${m.confirmed ? "" : "dc-pending"}`} style={{ background: m.confirmed ? "#e8f6ee" : "#fffaea", color: m.confirmed ? "#1d7a46" : "#825e21" }}>{m.confirmed ? "已确认" : "待确认"}</span></td>
              <td className="num">{money(m.revenue)}</td>
              <td className="num">{money(m.cost)}</td>
              <td className="num">{money(m.gross_profit)}</td>
              <td className="num">{money(m.net_profit)}</td>
              <td className="num">{m.net_margin ?? "—"}</td>
              <td className="num">{money(m.cash)}</td>
              <td className="num">{money(m.ar)}</td>
              <td className="num">{money(m.inventory)}</td>
              <td className="num">{money(m.assets)}</td>
              <td className="num">{money(m.equity)}</td>
            </tr>)}</tbody>
          </table></div>
        ) : <section className="notice"><h2>还没有导入任何财务报表</h2><p>到数据中心上传利润表和资产负债表并确认后，这里会按月显示营业收入、成本、毛利、净利润与月末余额。1–7 月回头上传后也会自动进入本表。</p></section>}
      <p className="muted">口径：利润表取本期数；资产负债表取期末数；毛利 = 营业收入 − 营业成本；净利率 = 净利润 ÷ 营业收入。空值为报表未覆盖的行次，不补零。</p>
    </div>
  );
}
