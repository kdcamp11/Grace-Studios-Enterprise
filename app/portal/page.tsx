"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";
import type { UserRole } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";
import MobileDropdown from "@/components/MobileDropdown";
import { useTenant } from "@/lib/tenant/context";
import type { User } from "@supabase/supabase-js";
import type { OrderStage } from "@/types/database";
import {
  STAGE_COLOR,
  stageLabel,
  stageType,
  normalizeStage,
  isAwaitingConcepts,
} from "@/lib/order-stages";

interface Order {
  id: string;
  order_number: string;
  stage: OrderStage;
  created_at: string;
  has_concepts: boolean;
  has_pending_review: boolean;    // client_visible media awaiting client decision
  order_type?: "creative" | "production";
  design_fee_paid?: boolean;
  preview_url?: string | null;
  team_name?: string | null;
  sport?: string | null;
  logos_to_include?: string | null;
  tracking_number?: string | null;
}

function isCreative(o: Order): boolean {
  return o.order_type === "creative" || stageType(o.stage) === "creative";
}

function PortalContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const supabaseRef  = useRef(createClient());
  const supabase     = supabaseRef.current;

  const tenant    = useTenant();
  const submitted = searchParams.get("submitted");
  const [user, setUser]     = useState<User | null>(null);
  const [role, setRole]     = useState<UserRole | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [tab, setTab] = useState<"creative" | "production">("creative");

  useEffect(() => {
    async function load() {
      // Await any one-time localStorage→cookie session migration so users
      // upgraded from the old supabase-js client don't get bounced to /login.
      await sessionReady();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { router.replace("/login"); return; }
      setUser(u);

      // Redirect suppliers to their portal; admins can view client portal too
      const profile = await getProfile();
      if (profile) setRole(profile.role);
      if (profile && profile.role === "supplier") {
        router.replace("/supplier");
        return;
      }

      // Use admin API for all data — bypasses RLS on clients + orders tables.
      // Direct Supabase client reads were being silently blocked by RLS policies.
      const [profileRes, ordersRes] = await Promise.all([
        fetch("/api/brief/client-profile"),
        fetch("/api/portal/orders"),
      ]);

      if (profileRes.ok) {
        const { client: cp } = await profileRes.json();
        if (cp && !cp.is_prefill) setHasProfile(true);
      }

      if (ordersRes.ok) {
        const { orders: fetchedOrders } = await ordersRes.json();
        setOrders(
          (fetchedOrders ?? []).map((o: Order & { stage: string }) => ({
            ...o,
            stage: o.stage as OrderStage,
          }))
        );
      }

      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-brand-border px-6 sm:px-10 py-5 flex items-center justify-between">
        <OrgLogo href="/portal" />

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-5">
          <a href="/brief/choose" className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">
            {hasProfile ? "+ New Order" : "+ New Brief"}
          </a>
          {(role === "admin" || role === "super_admin") && (
            <a href="/admin" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Admin Portal</a>
          )}
          <a href="/portfolio" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Portfolio</a>
          <a href="/portal/consultation" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Work with Grace Studios</a>
          <a href="/billing" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Billing</a>
          <a href="/portal/settings" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Settings</a>
          <button type="button" onClick={handleSignOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>

        {/* Mobile nav — hamburger dropdown */}
        <div className="lg:hidden">
          <MobileDropdown
            groups={[
              [
                { label: hasProfile ? "+ New Order" : "+ New Brief", href: "/brief/choose" },
                ...(role === "admin" || role === "super_admin" ? [{ label: "Admin Portal", href: "/admin" }] : []),
              ],
              [
                { label: "Portfolio",             href: "/portfolio" },
                { label: "Work with Grace Studios", href: "/portal/consultation" },
                { label: "Billing",               href: "/billing" },
                { label: "Settings",              href: "/portal/settings" },
              ],
              [{ label: "Sign Out", onClick: handleSignOut }],
            ]}
          />
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-10 py-10 sm:py-14 flex flex-col items-center">
        <div className="w-full max-w-2xl space-y-8 animate-fade-up">

          {/* Brief submitted banner */}
          {submitted && (
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 flex items-start gap-5">
              <div className="w-10 h-10 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold uppercase tracking-wide text-brand-text">Brief Received</p>
                <p className="text-sm text-brand-muted font-barlow mt-1 leading-relaxed">
                  Your design concept is being prepared now, backed by Grace Studios design philosophy. Check back in a few minutes.
                </p>
                <a
                  href={`/orders/${submitted}/concepts`}
                  className="inline-block mt-4 px-5 py-2.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
                >
                  View Concepts →
                </a>
              </div>
            </div>
          )}

          {/* Section header */}
          <div className="border-b border-brand-border pb-4">
            <h2 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text leading-none">
              Your Orders
            </h2>
          </div>

          {/* Orders */}
          {orders.length === 0 ? (
            <div className="text-center py-20 space-y-6">
              <div className="space-y-2">
                <p className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text">
                  No orders yet
                </p>
                <p className="text-sm text-brand-muted font-barlow">
                  Submit your first brief and receive a design concept, backed by Grace Studios design philosophy, within minutes.
                </p>
              </div>
              <a
                href="/brief/choose"
                className="inline-block px-8 py-4 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary transition-colors"
              >
                {hasProfile ? "Start a New Order →" : "Submit Your First Brief →"}
              </a>
            </div>
          ) : (
            (() => {
              const creativeOrders   = orders.filter(isCreative);
              const productionOrders  = orders.filter((o) => !isCreative(o));
              const active            = tab === "creative" ? creativeOrders : productionOrders;

              return (
                <div className="space-y-5">
                  {/* Tabs */}
                  <div className="flex gap-2">
                    {([
                      ["creative", "Creative", creativeOrders.length],
                      ["production", "Production", productionOrders.length],
                    ] as const).map(([key, label, count]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`px-4 py-2 rounded-lg font-display font-bold text-xs uppercase tracking-widest transition-colors
                          ${tab === key
                            ? "bg-brand-primary text-white"
                            : "bg-brand-surface border border-brand-border text-brand-muted hover:text-brand-text"
                          }`}
                      >
                        {label} ({count})
                      </button>
                    ))}
                  </div>

                  {active.length === 0 ? (
                    <p className="text-sm text-brand-muted font-barlow py-10 text-center">
                      No {tab} orders yet.
                    </p>
                  ) : tab === "creative" ? (
                    <div className="space-y-3">
                      {active.map((order, i) => (
                        <CreativeCard key={order.id} order={order} index={i} />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {active.map((order, i) => (
                        <ProductionCard key={order.id} order={order} index={i} onOpen={() => router.push(`/orders/${order.id}/tracker`)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          )}

        </div>
      </main>
    </div>
  );
}

function CreativeCard({ order, index }: { order: Order; index: number }) {
  const orderLabel = order.order_number || order.id.slice(0, 8).toUpperCase();
  const norm       = normalizeStage(order.stage);
  const notSubmitted = isAwaitingConcepts(order.stage); // creative_started / legacy onboarding
  const approved   = !notSubmitted; // clickable once brief is submitted

  return (
    <div
      style={{ animationDelay: `${index * 60}ms` }}
      className="animate-fade-up bg-brand-surface border border-brand-border rounded-2xl px-6 py-5 space-y-4 transition-all duration-300 hover:border-brand-primary hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="font-display font-bold uppercase tracking-wide text-brand-text text-base truncate">
            {order.team_name || `Order ${orderLabel}`}
          </p>
          {order.sport && (
            <p className="text-[11px] uppercase tracking-wider text-brand-muted font-display">{order.sport}</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Locked concept thumbnail — shown when concepts exist but not yet activated */}
          {order.preview_url && !order.design_fee_paid && (
            <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-brand-border flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.preview_url}
                alt="Concept preview"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-bg/60 to-brand-bg/90 flex items-center justify-end pr-1.5">
                <svg className="w-3.5 h-3.5 text-brand-muted/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
            </div>
          )}

          <span className="px-2 py-0.5 rounded-full font-display font-bold text-[9px] uppercase tracking-widest border border-brand-border text-brand-muted">
            {order.design_fee_paid ? "Activated" : "Awaiting Activation"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className={`text-xs font-barlow ${STAGE_COLOR[order.stage] ?? "text-brand-muted"}`}>
          {stageLabel(order.stage)}
        </p>
        <p className="text-[11px] text-brand-muted font-barlow">
          {new Date(order.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <a
          href={`/brief/${order.id}/builder-review`}
          className="px-4 py-2 rounded-lg font-display font-bold text-[11px] uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
        >
          View Design
        </a>
        {notSubmitted && (
          <a
            href={`/brief/${order.id}/builder-review`}
            className="px-4 py-2 rounded-lg font-display font-bold text-[11px] uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary transition-colors"
          >
            Continue
          </a>
        )}
        {approved ? (
          <a
            href={`/orders/${order.id}/checkout`}
            className="px-4 py-2 rounded-lg font-display font-bold text-[11px] uppercase tracking-widest bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
          >
            Proceed to Production
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Coming soon"
            className="px-4 py-2 rounded-lg font-display font-bold text-[11px] uppercase tracking-widest border border-brand-border text-brand-muted/50 cursor-not-allowed"
          >
            Proceed to Production
          </button>
        )}
      </div>
    </div>
  );
}

function ProductionCard({ order, index, onOpen }: { order: Order; index: number; onOpen: () => void }) {
  const orderLabel = order.order_number || order.id.slice(0, 8).toUpperCase();
  const cta = order.has_pending_review
    ? "Review First Piece →"
    : order.has_concepts
      ? "Review Concepts →"
      : "View Status →";

  return (
    <div
      onClick={onOpen}
      style={{ animationDelay: `${index * 60}ms` }}
      className={`animate-fade-up group bg-brand-surface border rounded-2xl px-6 py-5 flex items-center justify-between gap-4 cursor-pointer transition-all duration-300
        ${order.has_pending_review
          ? "border-amber-400/60 hover:border-amber-500 hover:shadow-[0_4px_24px_rgba(251,191,36,0.15)]"
          : "border-brand-border hover:border-brand-primary hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
        }`}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-display font-bold uppercase tracking-wide text-brand-text text-base">
            Order {orderLabel}
          </p>
          {order.has_pending_review && (
            <span className="px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 font-display font-bold text-[9px] uppercase tracking-widest border border-amber-400/30">
              Action Required
            </span>
          )}
        </div>
        <p className={`text-xs font-barlow ${STAGE_COLOR[order.stage] ?? "text-brand-muted"}`}>
          {stageLabel(order.stage)}
        </p>
        {order.tracking_number && (
          <p className="text-[11px] text-brand-muted font-barlow">Tracking: {order.tracking_number}</p>
        )}
        <p className="text-[11px] text-brand-muted font-barlow">
          {new Date(order.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>
      <span className={`flex-shrink-0 text-xs font-display font-bold uppercase tracking-wider transition-colors
        ${order.has_pending_review
          ? "text-amber-600 group-hover:text-amber-700"
          : "text-brand-muted group-hover:text-brand-primary"
        }`}>
        {cta}
      </span>
    </div>
  );
}

export default function PortalPage() {
  return (
    <Suspense>
      <PortalContent />
    </Suspense>
  );
}
