import type { Metadata } from "next";
import { BRAND_NAME } from "../../../packages/core/brand";
import "../../../packages/ui/base.css";

export const metadata: Metadata = {
  title: `${BRAND_NAME} 사원관리`,
  description: "로컬 가상 데이터 업무 화면",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
