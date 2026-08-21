import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#7A0016",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://backup-instructor-required.vercel.app"),
  applicationName: "Backup OS",
  title: { default: "NIAT · Backup OS", template: "%s · Backup OS" },
  description: "Backup OS — arrange, deliver, and settle backup instructors across NIAT campuses.",
  openGraph: {
    title: "NIAT · Backup OS",
    description: "Backup OS — arrange, deliver, and settle backup instructors across NIAT campuses.",
    siteName: "Backup OS",
    type: "website",
  },
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
