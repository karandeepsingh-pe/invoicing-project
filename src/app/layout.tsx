import type { Metadata } from "next";
import { Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { env } from "@/lib/env";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/admin/toast-provider";
import { Toaster } from "@/components/admin/toaster";

// Editorial pairing (2026-06-13, user-confirmed): Playfair Display for
// display headings, Inter for body/UI. Ovation palette carries the brand.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: env.NEXT_PUBLIC_APP_NAME,
  description: "Internal client billing automation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable} ${mono.variable} scroll-smooth motion-reduce:scroll-auto`}
    >
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <ThemeProvider>
          <ToastProvider>
            {children}
            <Toaster />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
