import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClearLedger — CA Work Automation",
  description: "Convert bank PDFs and financial files to Tally XML, GST JSON, and clean CSV in minutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}