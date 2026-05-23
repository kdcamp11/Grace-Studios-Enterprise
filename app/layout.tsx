import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Barlow } from "next/font/google";
import { headers } from "next/headers";
import { TenantProvider } from "@/lib/tenant/provider";
import { resolveTenant } from "@/lib/tenant/resolve";
import CookieConsent from "@/components/CookieConsent";
import SupportWidget from "@/components/SupportWidget";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const headersList = headers();
  const hostname = headersList.get("x-hostname") ?? "localhost:3000";
  const tenant = await resolveTenant(hostname);

  return {
    title: tenant ? `${tenant.name} Partner Platform` : "Partner Platform",
    description: "Custom uniform design and fulfillment for sports programs",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = headers();
  const hostname = headersList.get("x-hostname") ?? "localhost:3000";
  const tenant = await resolveTenant(hostname);

  // Fallback tenant shape for local dev before first tenant is seeded
  const fallbackTenant = {
    id: "00000000-0000-0000-0000-000000000000",
    created_at: new Date().toISOString(),
    name: "Platform",
    slug: "dev",
    custom_domain: null,
    logo_url: null,
    brand_primary: "#111111",
    brand_secondary: "#333333",
    brand_bg: "#ffffff",
    brand_surface: "#f5f5f5",
    brand_border: "#d4d4d4",
    brand_text: "#0a0a0a",
    brand_muted: "#888888",
    enabled_sports: ["basketball", "football", "soccer"],
    enabled_products: ["jersey", "shorts"],
    design_fee: 0,
    commission_rate: 0,
    active: true,
    plan: "starter" as const,
    owner_email: "",
    support_email: null,
    support_url: null,
    stripe_account_id: null,
    stripe_customer_id: null,
    platform_fee_percent: 0,
    onboarding_complete: true,
  };

  return (
    <html lang="en">
      <body
        className={`${barlowCondensed.variable} ${barlow.variable} antialiased font-barlow`}
        style={{ backgroundColor: "var(--brand-bg)", color: "var(--brand-text)" }}
      >
        <TenantProvider tenant={tenant ?? fallbackTenant}>
          {children}
          <CookieConsent />
          <SupportWidget />
        </TenantProvider>
      </body>
    </html>
  );
}
