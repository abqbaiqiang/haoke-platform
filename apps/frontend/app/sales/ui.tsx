"use client";

import { ReactNode, useEffect, useRef } from "react";
import { money as baseMoney } from "../lib/format";

/** 销售员端金额统一带 ¥ 前缀。 */
export const money = (v: string | null | undefined) => baseMoney(v, { yuan: true });

export function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    workbench: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
    customers: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3Z",
    tasks: "M9 4H5v17h14V4h-4M9 2h6v5H9ZM8 13l3 3 5-6",
    performance: "M4 20V12h3v8ZM10 20V7h3v13ZM16 20V3h3v17Z",
    search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 0 1-3.4 0",
    clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    alert: "M12 3 2 20h20L12 3ZM12 9v5M12 17h.01",
    calendar: "M8 2v4M16 2v4M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    checkcircle: "M20 6 9 17l-5-5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.workbench} />
    </svg>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="sales-empty">{children}</div>;
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="sales-panel">
      <div className="sales-panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Pager({ offset, total, size = 20, onChange }: { offset: number; total: number; size?: number; onChange: (n: number) => void }) {
  return (
    <div className="sales-pager">
      <span>共 {total} 条{total > 0 && ` · 第 ${Math.floor(offset / size) + 1} / ${Math.ceil(total / size)} 页`}</span>
      <button disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - size))}>上一页</button>
      <button disabled={offset + size >= total} onClick={() => onChange(offset + size)}>下一页</button>
    </div>
  );
}

export function Modal({ title, children, close, locked = false }: { title: string; children: ReactNode; close: () => void; locked?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    d?.showModal();
    return () => { d?.close(); previous?.focus(); };
  }, []);
  return (
    <dialog ref={ref} className="sales-modal" aria-label={title} onCancel={e => { e.preventDefault(); if (!locked) close(); }}>
      <div className="sales-modal-head">
        <h2>{title}</h2>
        <button type="button" disabled={locked} aria-label="关闭窗口" onClick={close}>关闭</button>
      </div>
      {children}
    </dialog>
  );
}

/** 同比展示：正绿升、负红降，空值显示“—”。 */
export function yoySpan(v: string | null): ReactNode {
  if (v == null) return "—";
  const n = Number(v);
  return <span className={n >= 0 ? "perf-up" : "perf-down"}>{n >= 0 ? "↑" : "↓"} {Math.abs(n)}%</span>;
}
