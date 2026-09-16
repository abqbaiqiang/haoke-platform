// C2 前端公共层：金额与日期/北京时间展示格式化（docs/29 任务书）。
// 后端金额已按两位小数量化为字符串，前端只做展示换算，不参与任何业务计算；
// 时间一律按 Asia/Shanghai 展示。
const TZ = "Asia/Shanghai";

export type MoneyOptions = {
  /** 空值占位文案，默认 "—"（财务等场景传各自的占位文案）。 */
  empty?: string;
  /** 是否加 ¥ 前缀（销售员端金额卡）。 */
  yuan?: boolean;
};

/** 金额：千分位 + 固定两位小数，支持负数；空值显示占位文案。 */
export function money(value: string | null | undefined, options: MoneyOptions = {}): string {
  if (value === null || value === undefined) return options.empty ?? "—";
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction.padEnd(2, "0");
  return (options.yuan ? "¥" : "") + (negative ? "-" : "") + body;
}

/** 带方向的变化金额（环比/同比贡献等）：正数显式加 +，负数用 − 前缀。 */
export function signedMoney(value: string): string {
  const negative = value.startsWith("-");
  return `${negative ? "−" : "+"}${money(negative ? value.slice(1) : value)}`;
}

/** 图表轴与柱顶的紧凑金额，避免长数字把画布撑破。 */
export function compact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value) >= 10000 ? `${(value / 10000).toFixed(1)}万` : String(Math.round(value));
}

/** 当前月份（yyyy-mm，按北京时间）。 */
export function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

/** 完整时间戳（zh-CN 短日期 + 时间）；style="medium" 时日期用中文年月日。 */
export function dateTime(value: string | null | undefined, empty = "—", style: "short" | "medium" = "short"): string {
  if (!value) return empty;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: TZ, dateStyle: style, timeStyle: "short" }).format(new Date(value));
}

/** 紧凑时间戳（M/D [+ HH:mm]），用于销售员端列表。 */
export function stamp(value: string | null | undefined, time = true): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: TZ, month: "numeric", day: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(new Date(value));
}

/** 顶栏长日期（yyyy年M月d日 星期X，按北京时间）。 */
export function longDate(date = new Date()): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: TZ, year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
}

/** 任一时刻对应的北京日期（yyyy-mm-dd），用于“今天”边界判断。 */
export function beijingDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

/** 与今天相差的自然日（北京时间）：正数在未来，负数在过去。 */
export function dayDiff(value: string): number {
  return Math.round((Date.parse(beijingDay(value)) - Date.parse(beijingDay(new Date()))) / 86400000);
}

/** ISO 时间转 datetime-local 输入框的显示值（北京时间）。 */
export function localTime(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16);
}
