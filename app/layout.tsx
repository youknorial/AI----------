import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI秘書タスク管理",
  description: "毎日のタスクと長期目標から1日のスケジュールを作るMVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
