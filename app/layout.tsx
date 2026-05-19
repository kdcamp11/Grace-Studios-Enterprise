import type { Metadata } from "next";
import { Barlow_Condensed, Barlow } from "next/font/google";
import CookieConsent from "@/components/CookieConsent";
import "./globals.css";

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow-condensed",
});

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: "Grace Studios Partner Platform",
  description: "Custom uniform design and fulfillment for sports programs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${barlowCondensed.variable} ${barlow.variable} antialiased bg-gs-dark text-gs-white font-barlow`}
      >
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
