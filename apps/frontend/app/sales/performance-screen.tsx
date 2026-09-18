"use client";

import { Fragment } from "react";
import { currentMonth } from "../lib/format";
import type { OrderRow as Order, Page } from "../lib/types";
import type { Data, PerfPreset, Performance, Route, Source } from "./types";
import { PerfChart } from "./perf-chart";
import { Empty, Panel, Pager, yoySpan, money } from "./ui";

/** 业绩屏幕：期间筛选 / 业绩总览 / 风险 / 趋势 / 关键数据 / TOP5 / 客户结构 / 商品 / 转化 / 原始单据。 */
export function PerformanceScreen({ perf, sources, currentSource, onSourceChange, perfPreset, onPresetChange, perfMonths, onMonthsChange, month, onMonthChange, perfRangeValue, orders, orderOffset, onOrderOffsetChange, onOrderDetail, allCustomerOffset, onAllCustomerOffsetChange, onShowAllCustomers, onShowAllProducts, go }: {
  perf: Data<Performance>;
  sources: Data<Source[]>;
  currentSource: string;
  onSourceChange: (v: string) => void;
  perfPreset: PerfPreset;
  onPresetChange: (k: PerfPreset) => void;
  perfMonths: 6 | 12;
  onMonthsChange: (n: 6 | 12) => void;
  month: string;
  onMonthChange: (v: string) => void;
  perfRangeValue: { from: string; to: string; label: string };
  orders: Data<Page<Order>>;
  orderOffset: number;
  onOrderOffsetChange: (n: number) => void;
  onOrderDetail: (id: string) => void;
  allCustomerOffset: number;
  onAllCustomerOffsetChange: (n: number) => void;
  onShowAllCustomers: () => void;
  onShowAllProducts: () => void;
  go: (r: Route) => void;
}) {
  const p = perf.data, st = p?.structure;
  const oldRatio = st?.old_ratio != null ? Number(st.old_ratio) : null, newRatio = st?.new_ratio != null ? Number(st.new_ratio) : null;
  return (
    <div className="perf-root">
      <div className="perf-toolbar">
        <div className="perf-presets" role="group" aria-label="统计期间">{([["this", "本月"], ["last", "上月"], ["quarter", "本季度"], ["year", "今年"]] as [PerfPreset, string][]).map(([k, label]) => <button key={k} aria-pressed={perfPreset === k} onClick={() => onPresetChange(k)}>{label}</button>)}</div>
        <label>统计月份<input type="month" max={currentMonth()} value={perfPreset === "this" ? month : perfRangeValue.from.slice(0, 7)} disabled={perfPreset !== "this"} onChange={e => onMonthChange(e.target.value)} /></label>
        {(sources.data?.length || 0) > 1 && <label>交易来源<select value={currentSource} onChange={e => onSourceChange(e.target.value)}>{sources.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      </div>
      {!sources.loading && !sources.data?.length && <Panel title="交易数据"><Empty>暂无可见交易来源。CRM 客户与跟进仍可使用，请联系老板核实销售人员映射。</Empty></Panel>}
      <div className="perf-hero-row">
        <section className="sales-panel perf-hero">
          {p ? <div className="perf-hero-main">
            <div className="perf-hero-primary">
              <span className="perf-hero-label">{perfRangeValue.label}销售额</span>
              <strong className="perf-hero-amount">{money(p.month_amount)}</strong>
              <div className="perf-hero-target"><span>目标 {money(p.target_amount)}</span><div className="sales-progress" role="img" aria-label={p.completion != null ? `目标完成率 ${p.completion}%` : "目标完成率暂不可用"}><i style={{ width: `${p.completion != null ? Math.max(0, Math.min(100, Number(p.completion))) : 0}%` }} /></div><span>完成率 {p.completion != null ? `${p.completion}%` : "—"}</span></div>
            </div>
            <div className="perf-hero-yoy"><span>同比（较去年同期）</span><strong className={`perf-yoy-value${p.yoy == null ? "" : Number(p.yoy) >= 0 ? " up" : " down"}`}>{p.yoy == null ? "—" : `${Number(p.yoy) >= 0 ? "+" : ""}${p.yoy}%`}</strong><span>去年同期 {money(p.last_year_amount)}</span></div>
            <div className="perf-hero-aux">
              <div><span>距目标还差</span><strong>{money(p.remaining)}</strong></div>
              <div><span>剩余工作日</span><strong>{p.workdays_remaining != null ? `${p.workdays_remaining} 天` : "—"}</strong></div>
              <div><span>日均需完成</span><strong>{money(p.daily_required)}</strong></div>
            </div>
          </div> : <Empty>{perf.loading ? "正在加载业绩…" : "暂无业绩数据。"}</Empty>}
          <details className="sales-definition"><summary>业绩口径与数据状态</summary>{p && <><p>截至 {p.through ?? "—"}{p.verified ? " · 数据已核实" : " · 数据待核实"}。</p>{p.warnings.map(w => <p key={w}>{w}</p>)}{p.last_year_amount === null && <p>导入历史不足去年同期，同比暂不可比。</p>}</>}</details>
        </section>
        <section className="sales-panel perf-risk">
          <div className="wb-panel-head"><h2>需要重点关注</h2><button onClick={() => go({ screen: "customers" })}>查看全部 →</button></div>
          {p?.risks.length ? <ul className="perf-risk-list">{p.risks.map(r => <li key={r.kind}><button onClick={() => go({ screen: "customers" })}><span>{r.kind}</span><strong>{r.count} 家</strong></button></li>)}</ul> : <Empty>{perf.loading ? "正在加载…" : "暂无客户风险提醒。"}</Empty>}
        </section>
      </div>
      <div className="perf-mid">
        <section className="sales-panel perf-trend">
          <div className="wb-panel-head"><h2>销售趋势</h2><div className="perf-trend-toggle">{([6, 12] as const).map(n => <button key={n} aria-pressed={perfMonths === n} onClick={() => onMonthsChange(n)}>{n === 6 ? "近 6 个月" : "近 12 个月"}</button>)}</div></div>
          {p ? <PerfChart points={p.trend} /> : <Empty>{perf.loading ? "正在加载趋势…" : "暂无趋势数据。"}</Empty>}
          <p className="sales-note">当前月截至 {p?.through ?? "—"}，未结束月份不与完整历史月直接比较。</p>
        </section>
        <section className="sales-panel perf-key">
          <div className="wb-panel-head"><h2>{perfRangeValue.label}关键数据</h2></div>
          <ul className="perf-key-list">{[["成交客户数", "deal_customers"], ["新客户数", "new_customers"], ["跟进客户数", "followup_customers"], ["有效沟通", "effective"], ["报价客户数", "quoted_customers"], ["老客户复购", "repeat_customers"]].map(([label, k]) => <li key={k}><span>{label}</span><strong>{p?.key_metrics[k] ?? "—"}</strong></li>)}</ul>
        </section>
        <section className="sales-panel perf-top">
          <div className="wb-panel-head"><h2>TOP 5 客户</h2><button onClick={onShowAllCustomers}>查看全部 →</button></div>
          {p?.top_customers.length ? <div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>#</th><th>客户名称</th><th>{perfRangeValue.label}销售额</th><th>去年同期</th><th>同比</th></tr></thead><tbody>{p.top_customers.map((t, i) => <tr key={t.id}><td>{i + 1}</td><td><button className="sales-customer-link" onClick={() => go({ screen: "customers", customerId: t.id })}>{t.name}</button></td><td>{money(t.amount)}</td><td>{money(t.last_year)}</td><td>{yoySpan(t.yoy)}</td></tr>)}</tbody></table></div> : <Empty>{perf.loading ? "正在加载客户…" : "暂无成交客户。"}</Empty>}
        </section>
      </div>
      <div className="perf-bottom">
        <section className="sales-panel perf-structure">
          <h2>客户质量</h2>
          <div className="perf-quality">{[["新增客户", p?.quality?.new], ["活跃客户", p?.quality?.active], ["沉睡客户", p?.quality?.dormant], ["复购客户", p?.quality?.repeat]].map(([label, v]) => <div key={label as string} className="wb-dyn"><span>{label}</span><strong>{v ?? "—"}</strong><small>家</small></div>)}</div>
          <p className="sales-note">活跃＝本期有成交客户；沉睡＝超沉睡阈值未成交；避免单个大客户影响判断（docs/32 §3.5）。</p>
          {st ? <><div className="perf-structure-bar" role="img" aria-label={oldRatio != null || newRatio != null ? `老客户销售额占比 ${st.old_ratio ?? "—"}%，新客户销售额占比 ${st.new_ratio ?? "—"}%` : "客户结构暂无数据"}>{oldRatio == null && newRatio == null ? <i style={{ width: "100%", background: "#d8dee7" }} /> : <>{oldRatio != null && <i style={{ width: `${oldRatio}%`, background: "#0b62d8" }}><span>{st.old_ratio}%</span></i>}{newRatio != null && <i style={{ width: `${newRatio}%`, background: "#2fa46a" }}><span>{st.new_ratio}%</span></i>}{(oldRatio == null || newRatio == null) && <i style={{ width: `${100 - (oldRatio ?? 0) - (newRatio ?? 0)}%`, background: "#d8dee7" }} />}</>}</div>
            <div className="perf-structure-legend"><span><i style={{ background: "#0b62d8" }} aria-hidden />老客户销售额</span><span><i style={{ background: "#2fa46a" }} aria-hidden />新客户销售额</span></div>
            <div className="perf-structure-stats"><div><span>新增客户</span><strong>{st.new_customers ?? "—"}</strong></div><div><span>新客户成交</span><strong>{st.new_deals ?? "—"}</strong></div><div><span>老客户复购</span><strong>{st.repeat_customers ?? "—"}</strong></div><div><span>TOP5客户贡献</span><strong>{st.top5_share != null ? `${st.top5_share}%` : "—"}</strong></div></div></> : <Empty>{perf.loading ? "正在加载客户结构…" : "暂无客户结构数据。"}</Empty>}
        </section>
        <section className="sales-panel perf-products">
          <div className="wb-panel-head"><h2>商品销售 TOP 5</h2><button onClick={onShowAllProducts}>查看全部 →</button></div>
          {p?.products.length ? <table className="sales-table"><thead><tr><th>#</th><th>商品</th><th>{perfRangeValue.label}销售额</th><th>同比</th><th>成交客户数</th></tr></thead><tbody>{p.products.map((pr, i) => <tr key={pr.name}><td>{i + 1}</td><td>{pr.name}</td><td>{money(pr.amount)}</td><td>{yoySpan(pr.yoy)}</td><td>{pr.customers ?? "—"}</td></tr>)}</tbody></table> : <Empty>{perf.loading ? "正在加载商品…" : "暂无商品销售数据。"}</Empty>}
        </section>
        <section className="sales-panel perf-funnel">
          <div className="wb-panel-head"><h2>{perfRangeValue.label}销售动作转化</h2></div>
          {p?.funnel.length ? <div className="perf-funnel-flow">{p.funnel.map((f, i) => <Fragment key={f.stage}>{i > 0 && <span className="perf-funnel-arrow" aria-hidden>→</span>}<div className="perf-funnel-stage"><span>{f.stage}</span><strong>{f.current ?? "—"}</strong>{f.prev != null && f.prev > 0 && f.current != null ? <small>较上月 {f.current >= f.prev ? "+" : ""}{f.current - f.prev}</small> : null}</div></Fragment>)}</div> : <Empty>{perf.loading ? "正在加载转化数据…" : "暂无转化数据。"}</Empty>}
          <p className="sales-note">均为去重客户数：新增客户＝本月新建档；有效沟通＝本月有效跟进；报价＝发送过报价；成交＝已核实销售单（docs/32 §3.5）。</p>
        </section>
      </div>
      <details className="sales-definition perf-orders"><summary>精斗云交易记录（原始单据）</summary><p className="sales-note">原始单据金额与状态，不等于核实后的业绩；跟进记录在工作台单独查看。</p>{orders.loading ? <Empty>正在加载交易记录…</Empty> : orders.data?.rows.length ? <div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>日期</th><th>单号</th><th>原始金额</th><th>来源状态</th><th>操作</th></tr></thead><tbody>{orders.data.rows.map(o => <tr key={o.id}><td>{o.date}</td><td>{o.number}</td><td>{money(o.amount)}</td><td>{o.status}</td><td><button className="sales-customer-link" onClick={() => onOrderDetail(o.id)}>查看明细</button></td></tr>)}</tbody></table></div> : <Empty>该期间暂无可见交易记录。</Empty>}<Pager offset={orderOffset} total={orders.data?.total || 0} size={30} onChange={onOrderOffsetChange} /></details>
    </div>
  );
}
