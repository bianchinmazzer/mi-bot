import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matias Bianchin Mazzer — Digital Twin",
  description:
    "Talk to my AI-powered digital twin. Ask about my experience or book a meeting.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="overflow-hidden">
      <body className="antialiased overflow-hidden">{children}</body>
    </html>
  );
}
