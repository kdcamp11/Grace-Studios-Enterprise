"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/admin";
import { getProfile } from "@/lib/profile";
import GraceLogo from "@/components/GraceLogo";
import type { OrderStage } from "@/types/database";

const STAGE_LABELS: Record<OrderStage, string> = {
  onboarding: "Brief Submitted",
  design_confirmed: "Concepts Generating",
  files_sent: "Design Approved",
  first_piece_in_progress: "First Piece",
  first_piece_review: "First Piece Review",
  bulk_production: "Bulk Production",
  qc_verified: "QC Verified",
  shipped: "Shipped",
  delivered: "Delivered",
  complete: "Complete",
};

const STAGE_COLOR: Record<string, string> = {
  onboarding:              "bg-gray-100 text-gray-600 border border-gray-200",
  design_confirmed:        "bg-amber-50 text-amber-700 border border-amber-200",
  files_sent:              "bg-blue-50 text-blue-700 border border-blue-200",
  first_piece_in_progress: "bg-purple-50 text-purple-700 border border-purple-200",
  first_piece_review:      "bg-purple-50 text-purple-800 border border-purple-300",
  bulk_production:         "bg-indigo-50 text-indigo-700 border border-indigo-200",
  qc_verified:             "bg-teal-50 text-teal-700 border border-teal-200",
  shipped:                 "bg-cyan-50 text-cyan-700 border border-cyan-200",
  delivered:               "bg-green-50 text-green-700 border border-green-200",
  complete:                "bg-green-100 text-green-800 border border-green-300",
};

interface AdminOrder {
  id: string;
  order_number: string;
  stage: OrderStage;
  created_at: string;
  client_name: string;
  client_email: string;
  sport: string;
}

const ALL_STAGES = "all";

export default function AdminPage() {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStage | "all">(ALL_STAGES);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const profile = await getProfile();
      if (!user || (!isAdmin(user.email) && profile?.role !== "admin")) {
        router.replace("/portal");
        return;
      }

      const { data } = await supabase
        .from("orders")
        .select("id, order_number, stage, created_at, clients(name, email, sport)")
        .order("created_at", { ascending: false });

      if (data) {
        setOrders(
          data.map((o) => {
            const client = Array.isArray(o.clients) ? o.clients[0] : o.clients;
            return {
              id: o.id,
              order_number: o.order_number,
              stage: o.stage as OrderStage,
              created_at: o.created_at,
              client_name: (client as { name: string })?.name ?? "—",
              client_email: (client as { email: string })?.email ?? "—",
              sport: (client as { sport: string })?.sport ?? "—",
            };
          })
        );
      }
      setLoading(false);
    });
  }, [supabase, router]);

  const filtered = orders.filter((o) => {
    const matchesStage = filter === ALL_STAGES || o.stage === filter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      o.client_name.toLowerCase().includes(q) ||
      o.client_email.toLowerCase().includes(q) ||
      o.order_number?.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q);
    return matchesStage && matchesSearch;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gs-dark flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">
      <header className="border-b border-gs-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <GraceLogo className="h-7" href="/admin" />
          <a href="/admin" className="text-xs font-display font-bold uppercase tracking-widest text-gs-gold hover:text-gs-gold-light transition-colors">
            Admin Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/admin/suppliers" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Suppliers</a>
          <a href="/admin/team" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Team</a>
          <a href="/supplier" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Supplier Portal</a>
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Client Portal</a>
          <a href="/settings" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Settings</a>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-4xl space-y-5">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-gs-white">Admin Portal</h1>
              <p className="text-sm text-gs-muted font-barlow mt-1">All Orders · {filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, email, or order ID…"
              className="flex-1 bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-2.5 text-gs-white font-barlow text-sm placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as OrderStage | "all")}
              className="bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-2.5 text-gs-white font-barlow text-sm focus:outline-none focus:border-gs-gold transition-colors cursor-pointer"
            >
              <option value="all">All Stages</option>
              {Object.entries(STAGE_LABELS).map(([stage, label]) => (
                <option key={stage} value={stage}>{label}</option>
              ))}
            </select>
          </div>

          {/* Order table */}
          {filtered.length === 0 ? (
            <p className="text-center text-gs-muted font-barlow py-16">No orders match your filters.</p>
          ) : (
            <div className="rounded-xl border border-gs-border overflow-hidden">
              <table className="w-full text-sm font-barlow">
                <thead>
                  <tr className="bg-gs-dark-3 border-b border-gs-border">
                    <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-gs-muted">Order</th>
                    <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-gs-muted">Client</th>
                    <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-gs-muted hidden sm:table-cell">Sport</th>
                    <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-gs-muted">Stage</th>
                    <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-gs-muted hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/admin/orders/${order.id}`)}
                      className="border-b border-gs-border last:border-b-0 hover:bg-gs-dark-3 cursor-pointer transition-colors group"
                    >
                      <td className="px-5 py-4">
                        <span className="font-mono text-gs-white text-xs">
                          {order.order_number || order.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-gs-white font-medium group-hover:text-gs-gold transition-colors">{order.client_name}</p>
                        <p className="text-gs-muted text-xs">{order.client_email}</p>
                      </td>
                      <td className="px-5 py-4 text-gs-muted hidden sm:table-cell">{order.sport}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-display uppercase tracking-wider ${STAGE_COLOR[order.stage] ?? "bg-gray-800 text-gray-400"}`}>
                          {STAGE_LABELS[order.stage] ?? order.stage}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gs-muted text-xs hidden md:table-cell">
                        {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-5 py-4 text-gs-muted group-hover:text-gs-gold transition-colors text-xs font-display font-bold">→</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
