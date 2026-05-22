"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";
import type { UserRole } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";
import { useTenant } from "@/lib/tenant/context";
import type { User } from "@supabase/supabase-js";
import type { OrderStage } from "@/types/database";

const STAGE_LABELS: Record<OrderStage, string> = {
  onboarding:              "Brief Submitted — Awaiting Concepts",
  design_confirmed:        "Designer Mockup Ready — Review Required",
  files_sent:              "Files Approved — In Production",
  first_piece_in_progress: "First Piece In Progress",
  first_piece_review:      "⚡ First Piece Ready for Review",
  bulk_production:         "Bulk Production",
  qc_verified:             "QC Verified",
  shipped:                 "Shipped",
  delivered:               "Delivered",
  complete:                "Complete",
};

const STAGE_COLOR: Record<string, string> = {
  onboarding:          "text-brand-muted",
  design_confirmed:    "text-amber-500",
  files_sent:          "text-blue-400",
  first_piece_review:  "text-amber-400 font-semibold",
  complete:            "text-emerald-400",
};

interface Order {
  id: string;
  order_number: string;
  stage: OrderStage;
  created_at: string;
  has_concepts: boolean;
  has_pending_review: boolean;    // client_visible media awaiting client decision
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

      // Check if this user has an existing client profile (for smart CTA)
      fetch("/api/brief/client-profile")
        .then((r) => r.json())
        .then(({ client: cp }) => { if (cp) setHasProfile(true); })
        .catch(() => {});

      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("email", u.email)
        .single();

      if (!client) { setLoading(false); return; }

      const { data: orderRows } = await supabase
        .from("orders")
        .select("id, order_number, stage, created_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });

      if (!orderRows) { setLoading(false); return; }

      const orderIds = orderRows.map((o) => o.id);

      // Fetch concepts and first-piece-media in parallel
      const [{ data: concepts }, { data: mediaRows }] = await Promise.all([
        supabase.from("concepts").select("order_id").in("order_id", orderIds),
        supabase
          .from("first_piece_media")
          .select("order_id, client_approved")
          .in("order_id", orderIds)
          .eq("client_visible", true),
      ]);

      const conceptOrderIds = new Set((concepts ?? []).map((c) => c.order_id));

      // Orders with at least one client-visible item not yet reviewed by client
      const pendingReviewIds = new Set(
        (mediaRows ?? [])
          .filter((m) => m.client_approved === null)
          .map((m) => m.order_id)
      );

      setOrders(
        orderRows.map((o) => ({
          ...o,
          stage: o.stage as OrderStage,
          has_concepts:       conceptOrderIds.has(o.id),
          has_pending_review: pendingReviewIds.has(o.id),
        }))
      );
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
        <div className="flex items-center gap-4">
          <OrgLogo href="/portal" />
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            Client Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/brief/new" className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">
            {hasProfile ? "+ New Order" : "+ New Brief"}
          </a>
          {(role === "admin" || role === "super_admin") && (
            <a href="/admin" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Admin Portal</a>
          )}
          <a href="/settings" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Settings</a>
          <button type="button" onClick={handleSignOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
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
                  Concept generation is underway. Our AI is designing your jerseys now — check back in a few minutes.
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
            <p className="text-[10px] font-display uppercase tracking-[0.25em] text-brand-muted mb-1">
              {tenant.name}
            </p>
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
                  Submit your first brief and our AI will generate custom concepts within minutes.
                </p>
              </div>
              <a
                href="/brief/new"
                className="inline-block px-8 py-4 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary transition-colors"
              >
                {hasProfile ? "Start a New Order →" : "Submit Your First Brief →"}
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order, i) => {
                const orderLabel = order.order_number || order.id.slice(0, 8).toUpperCase();

                // First piece review takes priority over concepts if there's pending media
                const dest = order.has_pending_review
                  ? `/orders/${order.id}/tracker`
                  : order.has_concepts
                    ? `/orders/${order.id}/concepts`
                    : `/orders/${order.id}/tracker`;

                const cta = order.has_pending_review
                  ? "Review First Piece →"
                  : order.has_concepts
                    ? "Review Concepts →"
                    : "View Status →";

                return (
                  <div
                    key={order.id}
                    onClick={() => router.push(dest)}
                    style={{ animationDelay: `${i * 60}ms` }}
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
                        {!order.has_pending_review && order.has_concepts && (
                          <span className="px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary font-display font-bold text-[9px] uppercase tracking-widest border border-brand-primary/30">
                            Concepts Ready
                          </span>
                        )}
                      </div>
                      <p className={`text-xs font-barlow ${STAGE_COLOR[order.stage] ?? "text-brand-muted"}`}>
                        {STAGE_LABELS[order.stage] ?? order.stage}
                      </p>
                      <p className="text-[11px] text-brand-muted font-barlow">
                        {new Date(order.created_at).toLocaleDateString("en-US", {
                          month: "long", day: "numeric", year: "numeric",
                        })}
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
              })}
            </div>
          )}

        </div>
      </main>
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
