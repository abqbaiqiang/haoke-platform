"use client";

import { useEffect, useRef, useState } from "react";

type Role = "owner" | "manager" | "sales" | "finance" | "admin";
type Metric = { definition: string; source: string; code: string; label: string; value: string | null; unit: string; reason: string | null };
type Overview = { month: string; through: string; verified: boolean; warnings: string[]; finance_warnings: string[];
  sales_metrics: Metric[]; finance_metrics: Metric[]; trend: { date: string; value: string }[]; updated_at: string | null };
type Source = { id: string; name: string };

function money(s: string | null | undefined) {
  if (s == null) return "—";
  const negative = s.startsWith("-");
  const [a, b = ""] = negative ? s.slice(1).split(".") : s.split(".");
  return (negative ? "-" : "") + a.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + b.padEnd(2, "0");
}

function Card({ metric }: { metric: Metric }) {
  return <section className="card"><span>{metric.label}</span><strong>{metric.unit === "元" ? money(metric.value) : metric.value ?? "—"}{metric.value !== null && metric.unit !== "元" && <small> {metric.unit}</small>}</strong>
    <details><summary>口径说明</summary><p>{metric.definition}</p><p>来源：{metric.source}</p></details>
    {metric.reason && <p className="muted">{metric.reason}</p>}</section>;
}

function Trend({ points }: { points: Overview["trend"] }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let chart: import("echarts").ECharts | undefined;
    const observer = new ResizeObserver(() => chart?.resize());
    if (element.current) observer.observe(element.current);
    import("echarts").then(echarts => {
      if (disposed || !element.current) return;
      chart = echarts.init(element.current, undefined, { renderer: "svg" });
      chart.setOption({ color: ["#28624b"], grid: { left: 80, right: 20, top: 24, bottom: 40 }, tooltip: { trigger: "axis", renderMode: "richText" },
        xAxis: { type: "category", data: points.map(p => p.date.slice(0, 7)) }, yAxis: { type: "value", name: "元" },
        series: [{ type: "bar", data: points.map(p => Number(p.value)) }] });
    });
    return () => { disposed = true; observer.disconnect(); chart?.dispose(); };
  }, [points]);
  return <section className="card overview-trend"><h2>近 6 个月源销售金额</h2><div ref={element} className="bi-chart" role="img" aria-label="近六个月源销售金额柱状图，下方有精确数值表" />
    <details><summary>查看每月精确金额</summary><div className="bi-table-wrap"><table><thead><tr><th>月份</th><th>源销售金额（元）</th></tr></thead><tbody>{points.map(p => <tr key={p.date}><td>{p.date.slice(0, 7)}</td><td>{p.value}</td></tr>)}</tbody></table></div></details></section>;
}

export default function Overview({ role, openBI, openCRM }: { role: Role; openBI: () => void; openCRM: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true); setError("");
    (async () => {
      try {
        const list = await (await fetch("/api/bi/sources", { cache: "no-store" })).json();
        if (!live) return;
        setSources(list);
        const id = list[0]?.id;
        if (!id) { setData(null); setLoading(false); return; }
        setSource(id);
        const response = await fetch(`/api/bi/overview?source_id=${id}`, { cache: "no-store" });
        const body = await response.json();
        if (!live) return;
        if (!response.ok) throw new Error(body.error?.message || "总览加载失败");
        setData(body);
      } catch (e) { if (live) setError(e instanceof Error ? e.message : "网络异常"); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [retry]);

  async function switchSource(id: string) {
    setSource(id); setLoading(true); setError(""); setData(null);
    try {
      const response = await fetch(`/api/bi/overview?source_id=${id}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "总览加载失败");
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : "网络异常"); }
    finally { setLoading(false); }
  }

  return <div className="overview">
    <p className="eyebrow">经营总览</p>
    <h1>本月经营状况</h1>
    {sources.length > 1 && <label>数据源<select value={source} onChange={e => switchSource(e.target.value)}>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    {loading && <p role="status">正在加载总览…</p>}
    {error && <p className="error" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>重试</button></p>}
    {!loading && !error && !data && <section className="notice"><h2>尚无可见的经营数据</h2><p>请先在数据中心完成销售导入；销售账号需先由管理员完成人员映射。</p><button onClick={openBI}>前往销售工作台 →</button></section>}
    {data && <>
      <p className="muted">{data.month.slice(0, 7)} · 统计截至 {data.through}{data.updated_at ? ` · 最近事实更新 ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(new Date(data.updated_at))}` : ""}</p>
      {data.warnings.map(w => <p key={w} className="data-warning">{w}</p>)}
      <h2>销售与经营</h2>
      <div className="bi-metrics overview-sales">{data.sales_metrics.map((m, i) => <Card metric={m} key={`${m.code}-${i}`} />)}</div>
      <button onClick={openBI} className="overview-link">查看销售分析、目标与团队执行 →</button>
      {data.finance_metrics.length > 0 && <>
        <h2>财务结果与资金</h2>
        {data.finance_warnings.map(w => <p key={w} className="data-warning">{w}</p>)}
        <div className="bi-metrics overview-finance">{data.finance_metrics.map((m, i) => <Card metric={m} key={`${m.code}-${i}`} />)}</div>
        <p className="muted">经营销售额为精斗云源核对口径，财务指标来自报表导入，两者口径不同、单独展示；差异勾稽待销售数据核实后提供。</p>
      </>}
      {!!data.trend.length && <Trend points={data.trend} />}
      <section className="notice"><h2>今日工作</h2><p>从待办和客户跟进开始今天的工作。</p><button onClick={openCRM}>进入客户与待办 →</button></section>
    </>}
  </div>;
}
