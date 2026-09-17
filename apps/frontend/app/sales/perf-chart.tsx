"use client";

import { useEffect, useRef } from "react";
import { money } from "../lib/format";
import type { TrendPoint } from "./types";
import { Empty } from "./ui";

export function PerfChart({ points }: { points: TrendPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let chart: import("echarts").ECharts | undefined, dead = false;
    const observer = new ResizeObserver(() => chart?.resize());
    if (ref.current) observer.observe(ref.current);
    import("echarts").then(e => {
      if (dead || !ref.current) return;
      chart = e.init(ref.current, undefined, { renderer: "svg" });
      chart.setOption({
        animation: false,
        color: ["#0b62d8"],
        grid: { left: 76, right: 20, top: 30, bottom: 35 },
        tooltip: { trigger: "axis" },
        xAxis: {
          type: "category",
          data: points.map(p => p.date.slice(5, 7) + "月"),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#e4e4e7" } },
        },
        yAxis: { type: "value", name: "元", splitLine: { lineStyle: { color: "#f1f1f3" } } },
        series: [
          {
            name: "本期销售额",
            type: "bar",
            barMaxWidth: 45,
            data: points.map((pt, i) => ({
              value: pt.value === null ? null : Number(pt.value),
              itemStyle: { color: i === points.length - 1 ? "#0b62d8" : "#93c5fd", borderRadius: [3, 3, 0, 0] },
            })),
          },
          {
            name: "去年同期",
            type: "line",
            smooth: true,
            symbol: "none",
            data: points.map(pt => (pt.last_year === null ? null : Number(pt.last_year))),
            itemStyle: { color: "#8fb0d4" },
            lineStyle: { color: "#8fb0d4", width: 1.5 },
          },
        ],
      });
    });
    return () => { dead = true; observer.disconnect(); chart?.dispose(); };
  }, [points]);
  return points.some(p => p.value !== null) ? (
    <>
      <div className="sales-chart" ref={ref} role="img" aria-label="本期销售额与去年同期对比图，下方提供每月数值" />
      <details className="sales-definition">
        <summary>查看每月数值</summary>
        {points.map(p => <p key={p.date}>{p.date.slice(0, 7)}：本期 {money(p.value)} · 去年同期 {money(p.last_year)}</p>)}
      </details>
    </>
  ) : <Empty>数据尚未满足已核实趋势的展示条件。</Empty>;
}
