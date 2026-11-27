import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], axes: ["opsz"], variable: "--font-newsreader", display: "swap" });

const description =
  "Websites are free to fake. History isn't. Paste a vendor, shop or marketplace link and get a verdict where every reason links to its proof.";

export const metadata: Metadata = {
  metadataBase: new URL("https://receipts-hex8.vercel.app"),
  title: "Receipts: check a site before you trust it",
  description,
  applicationName: "Receipts",
  openGraph: { title: "Receipts", description, siteName: "Receipts", type: "website" },
  twitter: { card: "summary_large_image", title: "Receipts", description },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
