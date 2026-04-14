import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "slushie.swirl",
  description: "AI-powered project scoping by Slushie",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-navy text-slate-100 font-sans min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
