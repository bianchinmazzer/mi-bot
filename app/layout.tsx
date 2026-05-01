import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matias Bianchin Mazzer — Digital Twin",
  description:
    "Talk to my AI-powered digital twin. Ask about my experience or book a meeting.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
