import type { Metadata } from "next";
import "./globals.css";
import "./cockpit.css";
import "./sales.css";

export const metadata: Metadata = { title: "好客齐鲁经营管理平台", description: "好客齐鲁经营驾驶舱与客户管理平台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
