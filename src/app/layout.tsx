import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NIAT · Backup Instructor Platform",
  description: "Dynamic backup-instructor operations for NIAT universities.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={sans.variable}>
      <head>
        {/* Satoshi — the NIAT brand display face (matches niatindia.com) */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&f[]=cormorant-garamond@400,500&display=swap"
        />
      </head>
      <body>
        <div className="aurora-bg" aria-hidden />
        <div className="grid-overlay" aria-hidden />
        {children}
      </body>
    </html>
  );
}
