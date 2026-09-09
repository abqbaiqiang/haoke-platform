"use client";

import { useEffect, useRef, useState } from "react";

type Order = { id: string; order_no: string; date: string; amount: string; version: number };
type Detail = { order_no: string; customer: string; lines: { line_no: number; quantity: string; amount: string }[] };
function money(value: string) { const [whole, fraction = ""] = value.split("."); return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction.padEnd(2, "0"); }

export default function OrdersDialog({ source, month, onClose }: { source: string; month: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setDetail(null);
    body.current?.scrollTo({ top: 0 });
    const path = orderId ? `/sales/orders/${orderId}` : `/sales/orders?${new URLSearchParams({ source_id: source, month, offset: String(offset) })}`;
    async function load() {
      try {
        const response = await fetch(`/api/data${path}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "订单加载失败，请重试");
        if (!controller.signal.aborted) { if (orderId) setDetail(result); else setOrders(result); }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "订单加载失败，请重试");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [source, month, offset, orderId, attempt]);

  return <dialog ref={dialog} className="orders-dialog" aria-labelledby="orders-dialog-title" onClose={onClose}>
    <div className="orders-dialog-header"><div><p className="eyebrow">销售月度核对</p><h2 id="orders-dialog-title">{month} 订单{orderId ? "明细" : ""}</h2></div><button autoFocus onClick={() => dialog.current?.close()} aria-label="关闭订单窗口">关闭</button></div>
    <div className="orders-dialog-body" ref={body} aria-busy={loading}>
      {orderId && <button className="orders-back" onClick={() => setOrderId(null)}>返回订单列表</button>}
      {loading && <p role="status">正在加载{orderId ? "订单明细" : "订单列表"}…</p>}
      {error && <div><p className="error" role="alert">{error}</p><button onClick={() => setAttempt(attempt + 1)}>重新加载</button></div>}
      {!loading && !error && (orderId ? detail && <section aria-label="订单明细"><h3>{detail.order_no} · {detail.customer}</h3><div className="table-scroll"><table><thead><tr><th>明细行</th><th>数量</th><th>金额（元）</th></tr></thead><tbody>{detail.lines.map(line => <tr key={line.line_no}><td>{line.line_no}</td><td>{line.quantity}</td><td>{money(line.amount)}</td></tr>)}</tbody></table></div></section> : <>
        <p>{orders.length ? `第 ${offset + 1}—${offset + orders.length} 单，点击单号查看明细。` : "本页暂无订单。"}</p>
        {!!orders.length && <div className="table-scroll"><table><thead><tr><th>单号</th><th>日期</th><th>金额（元）</th><th>版本</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td><button onClick={() => setOrderId(order.id)}>{order.order_no}</button></td><td>{order.date}</td><td>{money(order.amount)}</td><td>{order.version}</td></tr>)}</tbody></table></div>}
        <div className="data-toolbar"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))}>前 30 单</button><button disabled={orders.length < 30} onClick={() => setOffset(offset + 30)}>后 30 单</button></div>
      </>)}
    </div>
  </dialog>;
}
