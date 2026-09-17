"use client";

import { ReactNode, useEffect, useRef } from "react";

export function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    workbench: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
    customers: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3Z",
    tasks: "M9 4H5v17h14V4h-4M9 2h6v5H9ZM8 13l3 3 5-6",
    performance: "M4 20V12h3v8ZM10 20V7h3v13ZM16 20V3h3v17Z",
    search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
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
