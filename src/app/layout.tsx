// Root layout for the VibeNet frontend.
//
// Responsibilities:
//   - Load global styles (Tailwind + Astryx reset/core/theme).
//   - Activate the Astryx "neutral" theme via the `data-astryx-theme` attribute
//     on <html>, so every Astryx component resolves its design tokens —
//     including typography (Figtree, via --font-family-body/-heading in
//     theme-neutral/theme.css). Fonts are the theme's responsibility; the app
//     doesn't load any of its own.
//   - Expose base document metadata.

import type { Metadata } from "next";
import "./globals.css";
import "goey-toast/styles.css";
import { Footer } from "@/components/Footer";
import { Toaster } from "@/components/Toaster";

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
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Footer />
        <Toaster />
      </body>
    </html>
  );
}
