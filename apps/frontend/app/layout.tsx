import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "松茂经营管理平台", description: "松茂内部经营管理平台 · M0" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
