"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { useRef } from "react";
import OrgLogo from "@/components/OrgLogo";

const SPORTS = ["All", "Basketball", "Tracksuits", "Football", "Soccer", "Baseball", "Volleyball", "Other"];

interface PortfolioItem {
  id: string;
  image_url: string;
  caption: string | null;
  sport: string | null;
  user_id: string;
  created_at: string;
}

interface SupplierGroup {
  supplier_id: string;
  name: string;
  items: PortfolioItem[];
}

export default function PortfolioPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [suppliers, setSuppliers] = useState<SupplierGroup[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("All");
  const [lightbox, setLightbox]   = useState<PortfolioItem | null>(null);

  useEffect(() => {
    async function load() {
      await sessionReady();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const res = await fetch("/api/portfolio");
      if (res.ok) {
        const { suppliers: data } = await res.json();
        setSuppliers(data ?? []);
      }
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Filter items across all suppliers
  const filtered: SupplierGroup[] = suppliers
    .map((s) => ({
      ...s,
      items: filter === "All" ? s.items : s.items.filter((i) => i.sport === filter),
    }))
    .filter((s) => s.items.length > 0);

  const totalItems = filtered.reduce((n, s) => n + s.items.length, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {/* Header — same as portal */}
      <header className="border-b border-brand-border px-6 sm:px-10 py-5 flex items-center justify-between">
        <OrgLogo href="/portal" />
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">My Orders</a>
          <a href="/brief/choose" className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">+ New Order</a>
          <a href="/contact" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Consultation</a>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-10 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto space-y-10">

          {/* Section label + title */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">
                Production Portfolio
              </span>
            </div>
            <h1
              className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-3"
              style={{ fontSize: "clamp(1.8rem, 3.5vw, 3rem)" }}
            >
              What We Produce
            </h1>
            <p className="text-sm font-barlow text-brand-muted leading-relaxed max-w-[420px]">
              Work from our production partners, custom sportswear built for programs like yours.
            </p>
          </div>

          {/* Sport filter */}
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((sport) => (
              <button
                key={sport}
                type="button"
                onClick={() => setFilter(sport)}
                className={`px-4 py-2 rounded-lg font-display font-bold text-[10px] uppercase tracking-widest border transition-colors ${
                  filter === sport
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "bg-brand-surface text-brand-muted border-brand-border hover:border-brand-primary hover:text-brand-primary"
                }`}
              >
                {sport}
              </button>
            ))}
          </div>

          {/* Results count */}
          {totalItems > 0 && (
            <p className="text-xs font-barlow text-brand-muted">
              {totalItems} {totalItems === 1 ? "piece" : "pieces"} · {filtered.length} {filtered.length === 1 ? "partner" : "partners"}
            </p>
          )}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="text-center py-24 space-y-4">
              <p className="font-display text-xl font-bold uppercase tracking-wide text-brand-text">
                {suppliers.length === 0 ? "No portfolio items yet" : `No ${filter} items yet`}
              </p>
              <p className="text-sm font-barlow text-brand-muted">
                {suppliers.length === 0
                  ? "Production partners will add their work here soon."
                  : "Try selecting a different sport filter."}
              </p>
              {filter !== "All" && (
                <button
                  type="button"
                  onClick={() => setFilter("All")}
                  className="text-xs font-display uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors"
                >
                  Show all →
                </button>
              )}
            </div>
          )}

          {/* Supplier sections */}
          {filtered.map((supplier) => (
            <div key={supplier.supplier_id} className="space-y-5">
              {/* Supplier header */}
              <div className="flex items-center gap-3">
                <div className="w-[3px] h-4 bg-brand-primary flex-shrink-0" />
                <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm">
                  {supplier.name}
                </p>
                <span className="text-[10px] font-barlow text-brand-muted">
                  {supplier.items.length} {supplier.items.length === 1 ? "piece" : "pieces"}
                </span>
              </div>

              {/* Image grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {supplier.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLightbox(item)}
                    className="group relative aspect-square rounded-xl overflow-hidden border border-brand-border hover:border-brand-primary transition-colors bg-brand-surface"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image_url}
                      alt={item.caption ?? item.sport ?? "Portfolio item"}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-brand-bg/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-start justify-end p-3 gap-1">
                      {item.sport && (
                        <span className="text-[9px] font-display uppercase tracking-widest text-brand-primary">
                          {item.sport}
                        </span>
                      )}
                      {item.caption && (
                        <p className="text-xs font-barlow text-brand-text leading-snug line-clamp-2">{item.caption}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-2xl w-full rounded-2xl overflow-hidden bg-brand-surface border border-brand-border"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.image_url}
              alt={lightbox.caption ?? "Portfolio item"}
              className="w-full max-h-[70vh] object-contain bg-brand-bg"
            />
            {(lightbox.sport || lightbox.caption) && (
              <div className="px-6 py-4 space-y-1">
                {lightbox.sport && (
                  <p className="text-[10px] font-display uppercase tracking-widest text-brand-primary">{lightbox.sport}</p>
                )}
                {lightbox.caption && (
                  <p className="text-sm font-barlow text-brand-muted">{lightbox.caption}</p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-brand-bg/80 border border-brand-border flex items-center justify-center text-brand-muted hover:text-brand-text transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <footer className="border-t border-brand-border px-6 py-5 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted">
          Grace Studios · Production Portfolio
        </p>
      </footer>
    </div>
  );
}
