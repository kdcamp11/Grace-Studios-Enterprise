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
  builder_render_url?: string | null;
  zone_colors?: Record<string, string> | string[] | null;
  client_concept_url?: string | null;
  garment_type?: string | null;
  team_name?: string | null;
  sport?: string | null;
  logos_to_include?: string | null;
  tracking_number?: string | null;
  concept_source?: string | null;
}

interface SavedDesign {
  id:           string;
  kind:         "ai" | "builder" | "upload";
  status:       "draft" | "submitted";
  createdAt:    string;
  teamName:     string | null;
  sport:        string | null;
  hasFile:      boolean;
  hasBuilder:   boolean;
  hasBrief:     boolean;
  thumbnailUrl: string | null;
  zoneColors:   Record<string, string> | null;
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
  const [orders, setOrders]   = useState<Order[]>([]);
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [tab, setTab] = useState<"creative" | "production" | "designs">("creative");

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
      const [profileRes, ordersRes, designsRes] = await Promise.all([
        fetch("/api/brief/client-profile"),
        fetch("/api/portal/orders"),
        fetch("/api/portal/designs"),
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

      if (designsRes.ok) {
        const { designs: fetchedDesigns } = await designsRes.json();
        setDesigns(fetchedDesigns ?? []);
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

          {/* Tabs + content */}
          {(() => {
            const creativeOrders   = orders.filter(isCreative);
            const productionOrders = orders.filter((o) => !isCreative(o));

            return (
              <div className="space-y-5">
                {/* Tab bar */}
                <div className="flex gap-2 flex-wrap">
                  {([
                    ["creative",   "Creative",      creativeOrders.length],
                    ["production", "Production",    productionOrders.length],
                    ["designs",    "Saved Designs", designs.length],
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

                {/* Tab content */}
                {tab === "designs" ? (
                  designs.length === 0 ? (
                    <div className="text-center py-20 space-y-6">
                      <div className="space-y-2">
                        <p className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text">
                          No saved designs yet
                        </p>
                        <p className="text-sm text-brand-muted font-barlow">
                          Start a brief to create your first design concept.
                        </p>
                      </div>
                      <a
                        href="/brief/choose"
                        className="inline-block px-8 py-4 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary transition-colors"
                      >
                        Start a New Design →
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {designs.map((d, i) => (
                        <SavedDesignCard key={d.id} design={d} index={i} />
                      ))}
                    </div>
                  )
                ) : tab === "creative" ? (
                  creativeOrders.length === 0 ? (
                    <div className="text-center py-20 space-y-6">
                      <div className="space-y-2">
                        <p className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text">
                          No orders yet
                        </p>
                        <p className="text-sm text-brand-muted font-barlow">
                          Submit your first brief and receive a design concept within minutes.
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
                    <div className="space-y-3">
                      {creativeOrders.map((order, i) => (
                        <CreativeCard key={order.id} order={order} index={i} />
                      ))}
                    </div>
                  )
                ) : (
                  productionOrders.length === 0 ? (
                    <p className="text-sm text-brand-muted font-barlow py-10 text-center">
                      No production orders yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {productionOrders.map((order, i) => (
                        <ProductionCard key={order.id} order={order} index={i} onOpen={() => router.push(`/orders/${order.id}/tracker`)} />
                      ))}
                    </div>
                  )
                )}
              </div>
            );
          })()}

        </div>
      </main>
    </div>
  );
}

function CreativeCard({ order, index }: { order: Order; index: number }) {
  const orderLabel   = order.order_number || order.id.slice(0, 8).toUpperCase();
  const notSubmitted = isAwaitingConcepts(order.stage); // creative_started / legacy onboarding
  const approved     = !notSubmitted;
  // The order's creation path is the source of truth. There are three kinds:
  //
  //   1. AI design brief   — concept_source null/"ai"; we generate concepts.
  //   2. Jersey builder     — concept_source "client_provided" + builder data
  //                           (zone_colors / builder render), no uploaded file.
  //   3. Uploaded concept   — concept_source "client_provided" + client_concept_url
  //                           (client uploaded a production file).
  //
  // Kinds 2 and 3 share the "client_provided" tag, so we split them by the
  // presence of an uploaded file. We never use saved colors/renders to decide
  // brief-vs-client — only the tag — since brief orders can also carry colors.
  const isClientProvided = order.concept_source === "client_provided";
  const isUpload  = isClientProvided && !!order.client_concept_url;
  const isBuilder = isClientProvided && !isUpload;

  // Routing for "View Design" and "Continue"
  //
  //   - Jersey builder: View Design → builder-review; Continue → jersey builder
  //   - Uploaded concept: View Design / Continue → upload-review
  //   - AI design brief: View Design / Continue → concepts (when concepts exist)
  const hasBuilderData = !!(order.builder_render_url || order.zone_colors || !notSubmitted);

  let viewDesignHref: string | null;
  let continueHref: string;
  if (isUpload) {
    viewDesignHref = `/brief/${order.id}/upload-review`;
    continueHref   = `/brief/${order.id}/upload-review`;
  } else if (isBuilder) {
    viewDesignHref = hasBuilderData ? `/brief/${order.id}/builder-review` : null;
    continueHref   = `/jersey-builder?orderId=${order.id}`;
  } else {
    viewDesignHref = order.has_concepts ? `/orders/${order.id}/concepts` : null;
    continueHref   = `/orders/${order.id}/concepts`;
  }

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
          {(order.garment_type || order.sport) && (
            <p className="text-[11px] uppercase tracking-wider text-brand-muted font-display">
              {order.garment_type ?? order.sport}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Thumbnail — clicking opens the review page for builder orders */}
          {(order.builder_render_url || order.preview_url) && !order.design_fee_paid && (
            <a
              href={viewDesignHref ?? "#"}
              className="relative w-14 h-14 rounded-lg overflow-hidden border border-brand-border flex-shrink-0 hover:border-brand-primary transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.builder_render_url ?? order.preview_url ?? ""}
                alt="Concept preview"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-bg/60 to-brand-bg/90 flex items-center justify-end pr-1.5">
                <svg className="w-3.5 h-3.5 text-brand-muted/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
            </a>
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
        {viewDesignHref && (
          <a
            href={viewDesignHref}
            className="px-4 py-2 rounded-lg font-display font-bold text-[11px] uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
          >
            {isBuilder ? "Review Design" : "View Design"}
          </a>
        )}
        {notSubmitted && (
          <a
            href={continueHref}
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
            title="Submit your brief first"
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

const KIND_LABEL: Record<string, string> = {
  ai:      "AI Brief",
  builder: "Jersey Builder",
  upload:  "File Upload",
};

function DesignThumbnail({ design }: { design: SavedDesign }) {
  if (design.thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={design.thumbnailUrl}
        alt="Design concept"
        className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-brand-border/60"
      />
    );
  }

  if (design.kind === "builder" && design.zoneColors) {
    const swatchColors = [
      design.zoneColors.jerseyTop,
      design.zoneColors.collar,
      design.zoneColors.jerseySidePanels,
      design.zoneColors.jerseyShorts,
    ].filter(Boolean).slice(0, 4);
    return (
      <div className="w-16 h-16 rounded-xl flex-shrink-0 border border-brand-border/60 overflow-hidden grid grid-cols-2">
        {swatchColors.map((color, i) => (
          <div key={i} style={{ backgroundColor: color }} className="w-full h-full" />
        ))}
        {swatchColors.length < 4 && Array.from({ length: 4 - swatchColors.length }).map((_, i) => (
          <div key={`empty-${i}`} className="w-full h-full bg-brand-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-16 h-16 rounded-xl flex-shrink-0 border border-brand-border/60 bg-brand-surface flex items-center justify-center">
      <svg className="w-6 h-6 text-brand-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    </div>
  );
}

function SavedDesignCard({ design, index }: { design: SavedDesign; index: number }) {
  function continueHref(): string {
    if (design.kind === "upload") {
      return design.hasFile
        ? `/designs/${design.id}/upload-review`
        : `/designs/${design.id}/upload`;
    }
    if (design.kind === "builder") {
      return `/jersey-builder?designId=${design.id}`;
    }
    // AI
    return design.hasBrief
      ? `/designs/${design.id}/concepts`
      : `/brief/${design.id}/style`;
  }

  return (
    <div
      style={{ animationDelay: `${index * 60}ms` }}
      className="animate-fade-up bg-brand-surface border border-brand-border rounded-2xl px-5 py-4
        transition-all duration-300 hover:border-brand-primary hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-start gap-4">
        <DesignThumbnail design={design} />

        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm truncate">
                {design.teamName ?? "Untitled Design"}
              </p>
              {design.sport && (
                <p className="text-[10px] uppercase tracking-wider text-brand-muted font-display">{design.sport}</p>
              )}
            </div>
            <span className="flex-shrink-0 px-2 py-0.5 rounded-full font-display font-bold text-[9px] uppercase tracking-widest border border-brand-border text-brand-muted">
              {KIND_LABEL[design.kind] ?? design.kind}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] font-barlow text-brand-muted">
              {design.status === "submitted" ? "Ready to activate" : "In progress"}
            </p>
            <p className="text-[10px] text-brand-muted font-barlow">
              {new Date(design.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={continueHref()}
              className="px-3 py-1.5 rounded-lg font-display font-bold text-[10px] uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
            >
              Continue
            </a>
            {design.status === "submitted" && (
              <a
                href={`/designs/${design.id}/checkout`}
                className="px-3 py-1.5 rounded-lg font-display font-bold text-[10px] uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary transition-colors"
              >
                Activate — $149 →
              </a>
            )}
          </div>
        </div>
      </div>
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
