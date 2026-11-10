import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  appearanceCookie,
  readAppearance,
} from "../../../packages/ui/appearance";
import { BRAND_NAME } from "../../../packages/core/brand";
import "../../../packages/ui/base.css";

export const metadata: Metadata = {
  title: `${BRAND_NAME} 사원관리`,
  description: "로컬 가상 데이터 업무 화면",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { theme, mode } = readAppearance(
    (await cookies()).get(appearanceCookie)?.value,
  );
  return (
    <html
      lang="ko"
      data-theme={theme}
      data-mode={mode}
      data-ag-theme-mode={mode}
    >
      <body>{children}</body>
    </html>
  );
}
