"use client";

import { useEffect, useRef, useState } from "react";

type Role = "owner" | "manager" | "sales" | "finance" | "admin";
type Metric = { definition: string; source: string; code: string; label: string; value: string | null; unit: string; reason: string | null };
type Slice = { label: string; amount: string; share: string | null };
type RankRow = { user_id: string; name: string; amount: string; target: string | null; completion: string | null };
type AttentionItem = { name: string; kind: string; days: number | null };
type Overview = { month: string; through: string; verified: boolean; warnings: string[]; finance_warnings: string[];
  sales_metrics: Metric[]; finance_metrics: Metric[]; trend: { date: string; value: string }[]; updated_at: string | null;
  customer_structure: Slice[]; product_structure: Slice[]; person_ranking: RankRow[]; attention_items: AttentionItem[]; attention_total: number };
type Source = { id: string; name: string };

function money(s: string | null | undefined) {
  if (s == null) return "—";
  const negative = s.startsWith("-");
  const [a, b = ""] = negative ? s.slice(1).split(".") : s.split(".");
  return (negative ? "-" : "") + a.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + b.padEnd(2, "0");
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false }).format(new Date()));
  if (hour < 6) return "夜深了";
  if (hour < 12) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

const DONUT_COLORS = ["#2c8a5d", "#57b47f", "#f0a24a", "#5b8fd4", "#9a7ad6", "#c3cdd4"];

function Donut({ slices }: { slices: Overview["customer_structure"] }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!slices.length || !element.current) return;
    let disposed = false;
    let chart: import("echarts").ECharts | undefined;
    import("echarts").then(echarts => {
      if (disposed || !element.current) return;
      chart = echarts.init(element.current, undefined, { renderer: "svg" });
      chart.setOption({ color: DONUT_COLORS, tooltip: { renderMode: "richText" },
        series: [{ type: "pie", radius: ["58%", "82%"], label: { show: false },
          data: slices.map(s => ({ name: s.label, value: Number(s.amount) })) }] });
    });
    return () => { disposed = true; chart?.dispose(); };
  }, [slices]);
  if (!slices.length) return <p className="dash-note">本月暂无销售，结构图待数据导入。</p>;
  return <div className="dash-donut">
    <div ref={element} className="dash-donut-chart" role="img" aria-label="结构环形图" />
    <ul className="donut-legend">{slices.map((s, i) => <li key={s.label}>
      <span className="sw" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
      <span className="nm">{s.label}</span><span className="amt">{money(s.amount)}</span>
      <span className="pc">{s.share ? `${s.share}%` : ""}</span></li>)}</ul>
  </div>;
}

function MetricCard({ metric, icon, tone, change }: { metric: Metric; icon: string; tone: string; change?: Metric }) {
  const isMoney = metric.unit === "元";
  const reason = metric.reason || (change?.reason ? undefined : undefined);
  return <section className="dash-card">
    <span className={`ic ${tone}`}>{icon}</span>
    <div>
      <span>{metric.label}</span>
      <strong>{isMoney ? money(metric.value) : metric.value ?? "—"}{metric.value !== null && !isMoney && <small> {metric.unit}</small>}</strong>
      <small>{reason || metric.reason || (change?.value ? `环比 ${Number(change.value) > 0 ? "+" : ""}${Number(change.value).toFixed(1)}%` : metric.label)}</small>
    </div>
    <details><summary>口径</summary><p>{metric.definition} · {metric.code} · 来源：{metric.source}</p></details>
  </section>;
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
      chart.setOption({ color: ["#2c8a5d"], grid: { left: 76, right: 16, top: 20, bottom: 32 },
        tooltip: { trigger: "axis", renderMode: "richText" },
        xAxis: { type: "category", data: points.map(p => p.date.slice(0, 7)) }, yAxis: { type: "value", name: "元" },
        series: [{ type: "bar", data: points.map(p => Number(p.value)), itemStyle: { borderRadius: [5, 5, 0, 0] }, barMaxWidth: 34 }] });
    });
    return () => { disposed = true; observer.disconnect(); chart?.dispose(); };
  }, [points]);
  return <div ref={element} className="dash-chart" role="img" aria-label="近六个月销售金额柱状图，下方有精确数值表" />;
}

export default function Overview({ role, openBI, openCRM }: { role: Role; openBI: () => void; openCRM: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const find = (code: string) => data?.sales_metrics.find(m => m.code === code);
  const fin = (code: string) => data?.finance_metrics.find(m => m.code === code);

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

  const today = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const mom = find("SALE_MOM");
  const salesHead = find("EXEC_SALES_AMT") || find("DQ_SALES_RECON");

  return <div className="dash">
    <div className="dash-hello">
      <div><p className="eyebrow" style={{ color: "#bfe3cc" }}>经营总览</p><h1>{greeting()}！</h1>
        <p>{data ? `${data.month.slice(0, 7)} 经营数据 · 统计截至 ${data.through}${data.updated_at ? ` · 最近事实更新 ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(new Date(data.updated_at))}` : ""}` : "加载经营数据…"}</p></div>
      <div className="dash-date">{today}<br />{data?.verified ? "销售口径已核实" : "销售数据待业务核实"}</div>
    </div>
    {sources.length > 1 && <label style={{ marginTop: 12, display: "inline-block" }}>数据源<select value={source} onChange={e => switchSource(e.target.value)}>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    {loading && <p role="status">正在加载总览…</p>}
    {error && <p className="error" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>重试</button></p>}
    {!loading && !error && !data && <section className="notice"><h2>尚无可见的经营数据</h2><p>请先在数据中心完成销售导入；销售账号需先由老板完成人员映射。</p><button onClick={openBI}>前往销售工作台 →</button></section>}
    {data && <>
      {data.warnings.map(w => <p key={w} className="data-warning">{w}</p>)}
      <div className="dash-grid dash-cards">
        <MetricCard metric={{ ...salesHead!, label: salesHead!.label.replace("（本月）", "") }} icon="📈" tone="g1" change={mom} />
        {["EXEC_FIN_REVENUE", "EXEC_NET_PROFIT", "EXEC_CASH_BAL", "EXEC_AR_BAL", "EXEC_INV_BAL"].map((code, i) => {
          const m = fin(code);
          const extra = code === "EXEC_CASH_BAL" ? fin("EXEC_CASH_MOM") : undefined;
          return m ? <MetricCard key={code} metric={m} icon={["💰", "🧾", "💵", "📄", "📦"][i]} tone={["g2", "g3", "g4", "g5", "g6"][i]}
            change={extra && extra.value !== null ? { ...extra, value: String(Number(extra.value)) } : undefined} /> : null;
        })}
      </div>
      {data.finance_metrics.length > 0 && data.finance_warnings.map(w => <p key={w} className="data-warning">{w}</p>)}
      {data.finance_metrics.length === 0 && <p className="dash-note">财务指标卡待导入利润表/资产负债表后显示。</p>}
      <div className="dash-grid dash-row">
        <section className="dash-panel"><div className="head"><h2>月度销售趋势</h2></div>
          <p className="sub">{data.verified ? "已核实经营销售额（退货扣减、作废排除）" : "源销售核对口径，含未核实状态"}</p>
          <Trend points={data.trend} />
          <details><summary>查看每月精确金额</summary><div className="table-scroll"><table><thead><tr><th>月份</th><th>金额（元）</th></tr></thead>
            <tbody>{data.trend.map(p => <tr key={p.date}><td>{p.date.slice(0, 7)}</td><td>{money(p.value)}</td></tr>)}</tbody></table></div></details></section>
        <section className="dash-panel"><h2>客户等级结构</h2><p className="sub">本月成交客户按等级的销售占比</p>
          <Donut slices={data.customer_structure} /></section>
        <section className="dash-panel"><h2>商品销售结构</h2><p className="sub">本月有效订单按商品金额</p>
          <Donut slices={data.product_structure} /></section>
      </div>
      <div className="dash-grid dash-row2">
        <section className="dash-panel"><div className="head"><h2>同事目标完成</h2><button onClick={openBI}>查看工作台 →</button></div>
          <p className="sub">本月已核实销售额 / 月目标</p>
          {data.person_ranking.length ? <ul className="dash-rank">{data.person_ranking.map((r, i) => {
            const pct = r.completion ? Math.min(Number(r.completion), 100) : 0;
            return <li key={r.user_id}><span className="no">{i + 1}</span>
              <span>{r.name}{r.completion ? <small style={{ color: "var(--muted)" }}> {r.completion}%</small> : <small style={{ color: "var(--muted)" }}> 未设目标</small>}</span>
              <span className="amt">{money(r.amount)}</span>
              <span className="bar"><i style={{ width: `${pct}%` }} /></span></li>;
          })}</ul> : <p className="dash-note">暂无销售同事账号，可在人员管理中创建。</p>}
          <details><summary>目标与口径说明</summary><p>完成率 = 已核实销售额 / 月目标；未核实或未设目标时不显示百分比。金额为经营销售额口径（退货扣减、作废排除）。</p></details></section>
        <section className="dash-panel"><div className="head"><h2>客户关注</h2><button onClick={openBI}>查看全部 →</button></div>
          <p className="sub">{data.attention_total ? `共 ${data.attention_total} 项需要留意` : "当前没有需要关注的客户"}</p>
          {data.attention_items.length ? <ul className="dash-attention">{data.attention_items.map((a, i) =>
            <li key={`${a.name}-${i}`}><span>{a.name}</span><span className="kind">{a.kind}</span><span className="days">{a.days !== null ? `${a.days} 天` : ""}</span></li>)}</ul>
            : <p className="dash-note">没有沉睡、疑似流失或跟进超期的客户。</p>}
          <p className="dash-note">判定阈值由老板在销售工作台的日历与分析设置中维护。</p></section>
        <section className="dash-panel"><h2>今日工作</h2><p className="sub">从客户与待办开始</p>
          <div className="cards" style={{ gridTemplateColumns: "1fr", marginTop: 12, gap: 12 }}>
            <section className="card" style={{ padding: 16 }}><span>客户与待办</span><p>记录跟进、安排下一步、跟进商机。</p><button onClick={openCRM}>进入 →</button></section>
            <section className="card" style={{ padding: 16 }}><span>销售工作台</span><p>趋势、贡献拆解与团队执行。</p><button onClick={openBI}>进入 →</button></section>
          </div></section>
      </div>
    </>}
  </div>;
}
