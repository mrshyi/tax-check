import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tax Check",
  description: "Overseas securities tax working paper for mainland China residents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
