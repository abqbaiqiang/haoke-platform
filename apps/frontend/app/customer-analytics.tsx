"use client";

import { useEffect, useRef, useState } from "react";

type Role = "owner" | "manager" | "sales" | "finance" | "admin";
type Metric = { code: string; label: string; value: string | null; unit: string; reason: string | null; definition: string; source: string };
type Segment = { layer: string; hint: string; count: number; amount: string; share: string | null };
type TrendMonth = { month: string; amount: string; orders: number; customers: number; repeat_rate: string | null; aov: string | null };
type Bucket = { label: string; count: number };
type Top = { customer_id: string; name: string; layer: string; last_order_date: string | null; days_since: number | null; orders: number; amount: string; aov: string | null };
type Analytics = { through: string; basis: string; verified: boolean; warnings: string[]; metrics: Metric[]; segments: Segment[];
  trend: TrendMonth[]; conversion_counted: number; conversion_average_days: string | null; conversion_buckets: Bucket[]; top: Top[]; total: number };

function money(s: string | null | undefined) {
  if (s == null) return "—";
  const negative = s.startsWith("-");
  const [a, b = ""] = negative ? s.slice(1).split(".") : s.split(".");
  return (negative ? "-" : "") + a.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + b.padEnd(2, "0");
}
const pct = (s: string | null) => s == null ? "—" : `${Number(s).toFixed(1)}%`;

/**
 * 客户分层配色：用品牌蓝的明度梯度表达价值高低（设计契约禁止第二套彩色主题，
 * 也禁止绿色系），需要挽留的层级以中性灰弱化，不引入红绿。
 */
const LAYER_COLORS: Record<string, string> = {
  "重要价值客户": "#1d4ed8", "重要保持客户": "#2563eb", "重要发展客户": "#3b82f6", "重要挽留客户": "#4f46e5",
  "一般价值客户": "#60a5fa", "一般保持客户": "#93c5fd", "一般发展客户": "#bfdbfe", "一般挽留客户": "#a1a1aa",
};
const LAYER_FALLBACK = "#a1a1aa";

export default function CustomerAnalyticsPanel({ role, source, openCustomer }: { role: Role; source: string; openCustomer: (id: string) => void }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const chart = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!source) { setData(null); return; }
    let live = true;
    setLoading(true); setError(""); setData(null);
    fetch(`/api/bi/customer-analytics?source_id=${source}`, { cache: "no-store" })
      .then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error?.message || "客户分析加载失败"); return b; })
      .then(b => { if (live) setData(b); })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [source, retry]);

  useEffect(() => {
    if (!data?.trend?.length || !chart.current) return;
    let disposed = false;
    let instance: import("echarts").ECharts | undefined;
    import("echarts").then(echarts => {
      if (disposed || !chart.current) return;
      instance = echarts.init(chart.current, undefined, { renderer: "svg" });
      instance.setOption({ animation: false,
        color: ["#2563eb", "#4f46e5"], grid: { left: 76, right: 60, top: 36, bottom: 32 },
        tooltip: { trigger: "axis", renderMode: "richText" },
        legend: { data: ["销售金额", "复购率"], top: 0 },
        xAxis: { type: "category", data: data.trend.map(t => t.month.slice(0, 7)) },
        yAxis: [{ type: "value", name: "元" }, { type: "value", name: "%", max: 100, splitLine: { show: false } }],
        series: [
          { name: "销售金额", type: "bar", data: data.trend.map(t => Number(t.amount)), itemStyle: { borderRadius: [5, 5, 0, 0] }, barMaxWidth: 34 },
          { name: "复购率", type: "line", yAxisIndex: 1, data: data.trend.map(t => t.repeat_rate == null ? null : Number(t.repeat_rate)), smooth: true },
        ],
      });
    });
    const observer = new ResizeObserver(() => instance?.resize());
    if (chart.current) observer.observe(chart.current);
    return () => { disposed = true; observer.disconnect(); instance?.dispose(); };
  }, [data]);

  if (role === "admin") return null;
  const maxBucket = Math.max(1, ...(data?.conversion_buckets.map(b => b.count) || [1]));

  return <section className="customer-analytics" aria-label="客户分析">
    <p className="muted">客户分层（RFM）、复购、成交转化周期与客单价。基于已导入的源销售历史；口径与阈值见页面底部说明。</p>
    {loading && <p role="status">正在加载客户分析…</p>}
    {error && <p className="error" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>重试</button></p>}
    {data && <>
      <p className="muted">{data.basis} · 统计截至 {data.through} · 覆盖 {data.total} 个有源销售记录的客户</p>
      {data.warnings.map(w => <p key={w} className="data-warning">{w}</p>)}
      <div className="bi-metrics">{data.metrics.map(m => <section className="card" key={m.code}>
        <span>{m.label}</span>
        <strong>{m.unit === "元" ? money(m.value) : m.value ?? "—"}{m.value !== null && m.unit !== "元" && <small> {m.unit}</small>}</strong>
        {m.reason && <p className="muted">{m.reason}</p>}<details><summary>口径</summary><p>{m.definition} · 来源：{m.source}</p></details>
      </section>)}</div>
      <div className="analytics-charts">
        <section className="card"><h2>近六个月销售与复购</h2>
          <div ref={chart} className="bi-chart" role="img" aria-label="近六个月销售金额与复购率图表" />
          <details><summary>查看每月精确数值</summary><div className="bi-table-wrap"><table>
            <thead><tr><th>月份</th><th>销售金额</th><th>订单</th><th>成交客户</th><th>复购率</th><th>客单价</th></tr></thead>
            <tbody>{data.trend.map(t => <tr key={t.month}><td>{t.month.slice(0, 7)}</td><td>{money(t.amount)}</td>
              <td>{t.orders}</td><td>{t.customers}</td><td>{pct(t.repeat_rate)}</td><td>{money(t.aov)}</td></tr>)}</tbody>
          </table></div></details></section>
        <section className="card"><h2>成交转化周期</h2>
          <p className="muted">CRM 潜客从创建到首次成交。已统计 {data.conversion_counted} 个潜客{data.conversion_counted ? ` · 平均 ${Number(data.conversion_average_days).toFixed(1)} 天` : ""}。</p>
          {data.conversion_counted === 0 && <p className="muted">只有在本平台创建、已绑定精斗云客户且发生成交的潜客才会计入；须先核实销售状态与完整历史覆盖。</p>}
          <table><thead><tr><th>转化区间</th><th>潜客数</th><th style={{ width: "45%" }} /></tr></thead>
            <tbody>{data.conversion_buckets.map(b => <tr key={b.label}><td>{b.label}</td><td>{b.count}</td>
              <td><span className="conv-bar"><i style={{ width: `${b.count / maxBucket * 100}%` }} /></span></td></tr>)}</tbody></table>
        </section>
      </div>
      <section className="card"><h2>客户分层（RFM）</h2>
        <p className="muted">R=近期有成交为高、F=成交频繁为高、M=金额贡献不低于客户人均为高；具体阈值由老板在“日历与分析设置”中调整。</p>
        <div className="bi-table-wrap"><table>
          <thead><tr><th>分层</th><th>客户数</th><th>源销售金额</th><th>金额占比</th><th>经营建议</th></tr></thead>
          <tbody>{data.segments.map(s => <tr key={s.layer}>
            <td><span className="layer-dot" style={{ background: LAYER_COLORS[s.layer] || LAYER_FALLBACK }} />{s.layer}</td>
            <td>{s.count}</td><td>{money(s.amount)}</td><td>{pct(s.share)}</td><td className="muted">{s.hint}</td></tr>)}</tbody>
        </table></div></section>
      <section className="card"><h2>客户金额排名（前 20）</h2>
        <div className="bi-table-wrap"><table>
          <thead><tr><th>#</th><th>客户</th><th>分层</th><th>订单数</th><th>源销售金额</th><th>客单价</th><th>最近成交</th><th>距今天数</th></tr></thead>
          <tbody>{data.top.map((t, i) => <tr key={t.customer_id}>
            <td>{i + 1}</td><td><button className="text-button" onClick={() => openCustomer(t.customer_id)}>{t.name}</button></td>
            <td><span className="layer-badge" style={{ background: `${LAYER_COLORS[t.layer] || LAYER_FALLBACK}1a`, color: LAYER_COLORS[t.layer] || "#52525b" }}>{t.layer}</span></td>
            <td>{t.orders}</td><td>{money(t.amount)}</td><td>{money(t.aov)}</td><td>{t.last_order_date || "—"}</td><td>{t.days_since ?? "—"}</td></tr>)}
            {!data.top.length && <tr><td colSpan={8}>暂无成交客户。</td></tr>}</tbody>
        </table></div></section>
    </>}
  </section>;
}
