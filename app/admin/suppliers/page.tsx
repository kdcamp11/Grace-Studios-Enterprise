"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import type { OrderStage } from "@/types/database";

interface SupplierRow {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  created_at: string;
  order_count: number;
  active_count: number;
}

const ACTIVE_STAGES: OrderStage[] = [
  "files_sent",
  "first_piece_in_progress",
  "first_piece_review",
  "bulk_production",
  "qc_verified",
];

export default function AdminSuppliersPage() {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const profile = await getProfile();
      if (!user || (profile?.role !== "admin" && profile?.role !== "super_admin")) {
        router.replace("/portal");
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, company, created_at")
        .eq("role", "supplier")
        .order("created_at", { ascending: false });

      if (!profiles || profiles.length === 0) {
        setLoading(false);
        return;
      }

      const ids = profiles.map((p) => p.id);
      const { data: orders } = await supabase
        .from("orders")
        .select("id, stage, supplier_user_id")
        .in("supplier_user_id", ids);

      const countMap: Record<string, { total: number; active: number }> = {};
      for (const o of orders ?? []) {
        if (!o.supplier_user_id) continue;
        if (!countMap[o.supplier_user_id]) countMap[o.supplier_user_id] = { total: 0, active: 0 };
        countMap[o.supplier_user_id].total += 1;
        if (ACTIVE_STAGES.includes(o.stage as OrderStage)) {
          countMap[o.supplier_user_id].active += 1;
        }
      }

      setSuppliers(
        profiles.map((p) => ({
          ...p,
          order_count: countMap[p.id]?.total ?? 0,
          active_count: countMap[p.id]?.active ?? 0,
        }))
      );
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function removeSupplier(id: string) {
    if (!confirm("Remove this supplier's access? Their account remains but they'll lose supplier status.")) return;
    setRemoving(id);
    await fetch(`/api/admin/suppliers/${id}`, { method: "DELETE" });
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
    setRemoving(null);
  }

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
          <TenantLogo className="h-7" href="/admin" />
          <a href="/admin" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            Admin Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/supplier" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Supplier Portal</a>
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Client Portal</a>
          <a href="/admin" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-3xl space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-xl font-bold uppercase tracking-wide text-brand-text">
                Production Partners
              </h1>
              <p className="text-xs text-brand-muted font-barlow mt-1">
                {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""} registered
              </p>
            </div>
            <a
              href="/signup"
              target="_blank"
              className="px-4 py-2 rounded-lg border border-brand-border text-xs font-display uppercase tracking-wider text-brand-muted hover:border-brand-primary hover:text-brand-primary transition-all"
            >
              Invite → /signup
            </a>
          </div>

          {suppliers.length === 0 ? (
            <div className="border border-brand-border rounded-xl p-12 text-center">
              <p className="text-brand-muted font-barlow text-sm">No supplier accounts yet.</p>
              <p className="text-xs text-brand-muted font-barlow mt-1 opacity-60">
                Have production partners sign up at <span className="font-mono">/signup</span> and select Production Partner.
              </p>
            </div>
          ) : (
            <div className="border border-brand-border rounded-xl overflow-hidden">
              <table className="w-full text-sm font-barlow">
                <thead>
                  <tr className="bg-brand-surface border-b border-brand-border">
                    <th className="text-left px-5 py-3 text-[10px] font-display uppercase tracking-wider text-brand-muted">Supplier</th>
                    <th className="text-left px-5 py-3 text-[10px] font-display uppercase tracking-wider text-brand-muted hidden sm:table-cell">Company</th>
                    <th className="text-center px-4 py-3 text-[10px] font-display uppercase tracking-wider text-brand-muted">Orders</th>
                    <th className="text-center px-4 py-3 text-[10px] font-display uppercase tracking-wider text-brand-muted">Active</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id} className="border-b border-brand-border last:border-0 hover:bg-brand-surface/40">
                      <td className="px-5 py-4">
                        <p className="text-brand-text font-medium">{s.full_name ?? "—"}</p>
                        <p className="text-xs text-brand-muted">{s.email}</p>
                      </td>
                      <td className="px-5 py-4 text-brand-muted hidden sm:table-cell">
                        {s.company ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-brand-text font-mono text-sm">{s.order_count}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {s.active_count > 0 ? (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 text-[10px] font-display uppercase tracking-wider">
                            {s.active_count}
                          </span>
                        ) : (
                          <span className="text-brand-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => router.push(`/admin?supplier=${s.id}`)}
                            className="text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
                          >
                            View Orders
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSupplier(s.id)}
                            disabled={removing === s.id}
                            className="text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-[#C41E1E] transition-colors disabled:opacity-40"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
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
