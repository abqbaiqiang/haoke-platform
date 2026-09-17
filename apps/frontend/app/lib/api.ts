"use client";

// C2 前端公共层：统一 API 请求与列表数据加载（docs/29 任务书）。
// 所有请求 cache: no-store；后端返回 {error:{message}} 结构时抛出可展示的错误。

import { useEffect, useState } from "react";

export type ApiInit = RequestInit & {
  /** 请求体对象；传入时自动 POST + application/json。 */
  json?: unknown;
};

export async function api<T>(url: string, init: ApiInit = {}): Promise<T> {
  const { json, ...rest } = init;
  const hasJson = json !== undefined;
  const response = await fetch(url, {
    cache: "no-store",
    ...rest,
    method: rest.method ?? (hasJson ? "POST" : "GET"),
    headers: { ...(hasJson ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: hasJson ? JSON.stringify(json) : rest.body,
  });
  const data = await response.json();
  if (!response.ok) {
    // 结构化错误（如跨客户产品推荐冲突的 conflicts）挂在 payload 上供调用方读取。
    const error = new Error((data as { error?: { message?: string } })?.error?.message || "请求失败，请重试") as Error & { payload?: { code?: string; message?: string; conflicts?: unknown[] } };
    error.payload = (data as { error?: { code?: string; message?: string; conflicts?: unknown[] } })?.error;
    throw error;
  }
  return data as T;
}

/** 同一后端模块前缀的 api（如 /api/crm）：调用处仍写模块内路径。 */
export function scopedApi(prefix: string) {
  return <T,>(path: string, init: ApiInit = {}): Promise<T> => api<T>(prefix + path, init);
}

/** 列表/详情数据加载：URL 变化或 revision/retry 变化时重新请求，保留 AbortController 语义。 */
export function useData<T>(url: string | null, revision: unknown = 0): { data?: T; error?: string; loading: boolean; retry: () => void } {
  const [state, setState] = useState<{ url: string | null; data?: T; error?: string; loading: boolean }>({ url: null, loading: false });
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    if (!url) { setState({ url: null, loading: false }); return; }
    const controller = new AbortController();
    setState({ url, loading: true });
    api<T>(url, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ url, data, loading: false }); })
      .catch(e => { if (!controller.signal.aborted) setState({ url, error: e instanceof Error ? e.message : "请求失败，请重试", loading: false }); });
    return () => controller.abort();
  }, [url, revision, retryCount]);
  return { ...(state.url === url ? state : { loading: !!url }), retry: () => setRetryCount(n => n + 1) };
}
