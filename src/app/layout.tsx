// Root layout for the VibeNet frontend.
//
// Responsibilities:
//   - Load global styles (Tailwind + Astryx reset/core/theme).
//   - Activate the Astryx "neutral" theme via the `data-astryx-theme` attribute
//     on <html>, so every Astryx component resolves its design tokens.
//   - Register the app fonts and expose base document metadata.

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VibeNet — Secure, Real-time E2EE Chat",
  description:
    "VibeNet is a secure, real-time end-to-end encrypted chat application.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-astryx-theme="neutral"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
