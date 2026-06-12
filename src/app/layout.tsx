import type { Metadata } from "next";
import { Montserrat, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { env } from "@/lib/env";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/admin/toast-provider";
import { Toaster } from "@/components/admin/toaster";

// Brand typeface (Ovation guidelines): Montserrat for headings AND body.
// Variable font — one file covers every weight in use (400–700).
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-sans",
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
      className={`${montserrat.variable} ${mono.variable} scroll-smooth motion-reduce:scroll-auto`}
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
