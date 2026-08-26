import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ShieldAlert, Activity } from "lucide-react";

const sans = Plus_Jakarta_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SYS-HUB™ // High-Risk Container Biometric Logbook",
  description:
    "Zero-input biometric facial recognition telemetry for hazardous box containers. OSHA / ISO-45001 compliant access monitoring.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full dark`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('sys_hub_theme');
                  if (saved === 'light') {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.classList.add('light');
                  } else {
                    document.documentElement.classList.remove('light');
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#07090e] text-slate-200 font-sans selection:bg-amber-500 selection:text-black">
        {/* Sticky Black Yellow Safety Hazard Stripe Banner at top */}
        <div className="sticky top-0 z-[60] h-2.5 w-full hazard-stripes shadow-lg" />

        {/* Adaptive Navbar */}
        <Navbar />

        <main className="flex-1 flex flex-col bg-industrial-dots">{children}</main>

        {/* Industrial Telemetry Footer */}
        <footer className="border-t border-slate-800/80 bg-[#080a0f] px-4 py-3 text-xs text-slate-400 font-mono">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Activity className="w-3.5 h-3.5" />
                <span>EDGE BIOMETRICS ACTIVE</span>
              </span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-400">ZERO INPUT AUTO-LOGGING</span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <span>LATENCY: &lt; 85ms</span>
              <span>•</span>
              <span>VECTOR DISTANCE: &lt; 0.60</span>
            </div>
          </div>

          {/* Legal / Attribution Bar */}
          <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]">
            <p className="text-slate-500 tracking-wide">
              © {new Date().getFullYear()} SYS-HUB — All Rights Reserved.
            </p>
            <p className="flex items-center gap-1.5 text-slate-500">
              <ShieldAlert className="w-3 h-3 text-amber-400" />
              <span>
                Powered &amp; Developed by{" "}
                <a
                  href="https://www.garyyudo.site"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Garyyudo
                </a>
              </span>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
