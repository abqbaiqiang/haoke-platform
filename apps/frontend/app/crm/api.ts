"use client";

import { api as baseApi } from "../lib/api";

/** CRM API：统一走 /api/crm 前缀与 lib/api 的请求/错误处理。 */
export const api = (<T,>(path: string, method = "GET", body?: unknown): Promise<T> =>
  baseApi<T>(`/api/crm${path}`, body === undefined ? { method } : { method, json: body }));
