import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swipe Fit",
  description: "Track and compare Google Fit progress for Fit Month participants.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
