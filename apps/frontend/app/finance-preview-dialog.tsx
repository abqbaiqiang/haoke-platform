"use client";

import { useEffect, useRef, useState } from "react";

type Preview = { filename: string; status: string; statement_type: "profit" | "balance_sheet";
  entity_name: string; period: string; blank_as_zero: boolean; requires_blank_confirmation: boolean; warnings: string[];
  records: { row: number; metric_code: string; metric_name: string; period_value: string | null; ytd_value: string | null;
    begin_value: string | null; end_value: string | null }[] };
function money(value: string | null) {
  if (value == null) return "未填报（空白）";
  const [whole, fraction = ""] = value.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction.padEnd(2, "0");
}

export default function FinancePreviewDialog({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null); setError("");
    async function load() {
      try {
        const response = await fetch(`/api/data/imports/${batchId}/finance-preview`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "财务预览加载失败，请重试");
        if (!controller.signal.aborted) setPreview(result);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "财务预览加载失败，请重试"); }
    }
    load();
    return () => controller.abort();
  }, [batchId, attempt]);
  const profit = preview?.statement_type === "profit";
  return <dialog ref={dialog} className="orders-dialog" aria-labelledby="finance-preview-title" onClose={onClose}>
    <div className="orders-dialog-header"><h2 id="finance-preview-title">财务报表预览</h2><button autoFocus aria-label="关闭财务预览" onClick={() => dialog.current?.close()}>关闭</button></div>
    <div className="orders-dialog-body">
      {!preview && !error && <p role="status">正在加载财务预览…</p>}
      {error && <><p role="alert" className="error">{error}</p><button onClick={() => setAttempt(attempt + 1)}>重新加载</button></>}
      {preview && <><h3>{preview.filename}</h3><p>{preview.entity_name} · {preview.period.slice(0, 7)} · 单位：元</p>
        <p className="data-warning">{preview.status === "pending" ? "待确认，尚未导入。" : "已导入批次的预检快照。"}这里只展示该批次内容，查看不会确认导入或确认财务期间。</p>
        <p>{preview.requires_blank_confirmation ? "空白核对策略尚未确认，原始空白保持未填报。" : preview.blank_as_zero ? "本次选择空白按零参与算术核对，原始空白仍保留。" : "未选择空白按零核对。"}</p>
        <p>{profit ? "左列为本月，右列为本年累计。" : "左列为期末，右列为年初；年初不是上月。"}</p>
        <div className="table-scroll"><table><thead><tr><th>原始行</th><th>科目</th><th>{profit ? "本月金额（元）" : "期末余额（元）"}</th><th>{profit ? "本年累计（元）" : "年初余额（元）"}</th></tr></thead><tbody>{preview.records.map(row => <tr key={row.metric_code}><td>{row.row}</td><td>{row.metric_name}</td><td>{money(profit ? row.period_value : row.end_value)}</td><td>{money(profit ? row.ytd_value : row.begin_value)}</td></tr>)}</tbody></table></div>
        {preview.warnings.map((warning, index) => <p className="data-warning" key={index}>{warning}</p>)}
        <a href={`/api/data/imports/${batchId}/file`}>下载本批次原始文件</a>
      </>}
    </div>
  </dialog>;
}
