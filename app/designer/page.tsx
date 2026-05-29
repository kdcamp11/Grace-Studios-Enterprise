"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import MobileDropdown from "@/components/MobileDropdown";
import type { OrderStage } from "@/lib/supabase/types";
import { isAwaitingConcepts, isInDesignReview, normalizeStage } from "@/lib/order-stages";

interface BriefSummary {
  id: string;
  design_system: string | null;
  primary_colors: string | null;
  vision_prompt: string | null;
  logo_placement: string | null;
}

interface QueueOrder {
  id: string;
  order_number: string | null;
  stage: OrderStage;
  created_at: string;
  deposit_paid: boolean;
  design_fee_paid: boolean;
  concept_count: number;
  needs_concepts: boolean;
  clients: { name: string; sport: string | null; city: string | null } | null;
  briefs: BriefSummary | BriefSummary[] | null;
}

const DESIGN_SYSTEM_LABELS: Record<string, string> = {
  bold: "Bold",
  gradient: "Gradient",
  program: "Program",
  culture: "Culture",
};

const STAGE_LABELS: Record<string, string> = {
  onboarding:       "Brief Ready",
  design_confirmed: "Concept Approved",
};

function brief(order: QueueOrder): BriefSummary | null {
  if (!order.briefs) return null;
  return Array.isArray(order.briefs) ? order.briefs[0] ?? null : order.briefs;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 24) return h === 0 ? "< 1h ago" : `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function DesignerQueuePage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [orders, setOrders]   = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"needs_concepts" | "in_review">("needs_concepts");
  const [name, setName]       = useState("");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  useEffect(() => {
    getProfile().then((profile) => {
      if (!profile || (profile.role !== "designer" && profile.role !== "admin" && profile.role !== "super_admin")) {
        router.replace("/portal");
        return;
      }
      setName(profile.full_name ?? profile.email ?? "");
      fetch("/api/designer/queue")
        .then((r) => r.json())
        .then(({ orders }) => { setOrders(orders ?? []); setLoading(false); });
    });
  }, [router, supabase]);

  const needsConcepts = orders.filter((o) => isAwaitingConcepts(o.stage));
  // "In Review" also covers creative_in_review — orders the client has paid to
  // activate, which the designer still needs to work through.
  const inReview      = orders.filter(
    (o) => isInDesignReview(o.stage) || normalizeStage(o.stage) === "creative_in_review",
  );
  const displayed     = tab === "needs_concepts" ? needsConcepts : inReview;

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TenantLogo href="/designer" />
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.25em] text-brand-muted">Designer</p>
            <h1 className="font-display text-base font-bold uppercase tracking-wide text-brand-text">Concept Queue</h1>
          </div>
        </div>
        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-5">
          {name && <p className="text-xs font-barlow text-brand-muted">{name}</p>}
          <button type="button" onClick={handleSignOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
        {/* Mobile nav — hamburger dropdown */}
        <div className="lg:hidden">
          <MobileDropdown
            groups={[
              [{ label: "Sign Out", onClick: handleSignOut }],
            ]}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col items-center">
        <div className="w-full max-w-4xl space-y-5">

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Needs Concepts", value: needsConcepts.length, warn: needsConcepts.length > 0 },
              { label: "In Review",      value: inReview.length },
              { label: "Total Active",   value: orders.length },
            ].map(({ label, value, warn }) => (
              <div
                key={label}
                className="rounded-xl border border-brand-border bg-brand-surface px-4 py-3 text-center"
              >
                <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1">{label}</p>
                <p className={`font-display font-bold text-xl ${warn ? "text-brand-primary" : "text-brand-text"}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-brand-surface border border-brand-border rounded-xl p-1 w-fit">
            {([["needs_concepts", "Needs Concepts", needsConcepts.length], ["in_review", "Concept Approved", inReview.length]] as const).map(([t, label, count]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider transition-colors flex items-center gap-2 ${
                  tab === t
                    ? "bg-brand-primary text-white"
                    : "text-brand-muted hover:text-brand-text"
                }`}
              >
                {label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-display ${
                  tab === t ? "bg-white/20 text-white" : "bg-brand-border text-brand-muted"
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* Queue cards */}
          {displayed.length === 0 ? (
            <div className="rounded-xl border border-brand-border bg-brand-surface px-6 py-16 text-center">
              <p className="font-display font-bold uppercase tracking-widest text-sm text-brand-text mb-2">
                {tab === "needs_concepts" ? "Queue is clear" : "No approved concepts"}
              </p>
              <p className="text-sm font-barlow text-brand-muted">
                {tab === "needs_concepts"
                  ? "All briefs have concepts. Check back later."
                  : "No clients have selected a concept yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map((order) => {
                const b = brief(order);
                return (
                  <div
                    key={order.id}
                    onClick={() => router.push(`/designer/orders/${order.id}`)}
                    className="rounded-xl border border-brand-border bg-brand-surface hover:border-brand-primary transition-colors cursor-pointer px-5 py-4 flex items-start gap-5"
                  >
                    {/* Left: urgency indicator */}
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                      order.needs_concepts ? "bg-brand-primary" : "bg-emerald-500"
                    }`} />

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-display font-bold uppercase tracking-wide text-brand-text">
                              {order.clients?.name ?? "—"}
                            </p>
                            <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted">
                              #{order.order_number ?? order.id.slice(0, 6)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-barlow text-brand-muted">
                            {order.clients?.sport && <span className="capitalize">{order.clients.sport}</span>}
                            {order.clients?.city  && <><span>·</span><span>{order.clients.city}</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-display uppercase tracking-wider border ${
                            order.needs_concepts
                              ? "bg-brand-primary/10 text-brand-primary border-brand-primary/30"
                              : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          }`}>
                            {order.needs_concepts ? "No concepts yet" : `${order.concept_count} concept${order.concept_count !== 1 ? "s" : ""}`}
                          </span>
                          <span className="text-[10px] font-barlow text-brand-muted">{timeAgo(order.created_at)}</span>
                        </div>
                      </div>

                      {b && (
                        <div className="flex flex-wrap gap-2">
                          {b.design_system && (
                            <span className="px-2.5 py-1 rounded-full bg-brand-bg border border-brand-border text-[10px] font-display uppercase tracking-wider text-brand-muted">
                              {DESIGN_SYSTEM_LABELS[b.design_system] ?? b.design_system} System
                            </span>
                          )}
                          {b.primary_colors && (
                            <span className="px-2.5 py-1 rounded-full bg-brand-bg border border-brand-border text-[10px] font-barlow text-brand-muted">
                              {b.primary_colors}
                            </span>
                          )}
                          {b.logo_placement && (
                            <span className="px-2.5 py-1 rounded-full bg-brand-bg border border-brand-border text-[10px] font-barlow text-brand-muted capitalize">
                              Logo: {b.logo_placement.replace(/_/g, " ")}
                            </span>
                          )}
                          {b.vision_prompt && (
                            <span className="px-2.5 py-1 rounded-full bg-brand-bg border border-brand-border text-[10px] font-barlow text-brand-muted max-w-xs truncate">
                              &ldquo;{b.vision_prompt}&rdquo;
                            </span>
                          )}
                        </div>
                      )}

                      {!b && (
                        <p className="text-xs font-barlow text-brand-muted italic">Brief not yet submitted</p>
                      )}
                    </div>

                    <svg className="w-4 h-4 text-brand-muted flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
