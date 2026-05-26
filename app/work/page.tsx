"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import TenantLogo from "@/components/TenantLogo";
import { useTenant } from "@/lib/tenant/context";

interface PortfolioItem {
  id: string;
  image_url: string;
  caption: string | null;
  sport: string | null;
  created_at: string;
}

const ALL_SPORTS = ["All", "Basketball", "Tracksuits", "Football", "Soccer", "Baseball", "Volleyball", "Other"];

function WorkGalleryContent() {
  const tenant      = useTenant();
  const router      = useRouter();
  const searchParams = useSearchParams();
  const sportParam  = searchParams.get("sport") ?? "All";

  const [items, setItems]       = useState<PortfolioItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activeSport, setActiveSport] = useState(sportParam);
  const [availableSports, setAvailableSports] = useState<string[]>([]);

  // Load all items once to determine which sport filters have content
  useEffect(() => {
    fetch("/api/public/portfolio")
      .then((r) => r.json())
      .then(({ items: all }: { items: PortfolioItem[] }) => {
        const sports = Array.from(new Set((all ?? []).map((i) => i.sport).filter(Boolean))) as string[];
        setAvailableSports(sports);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = activeSport === "All"
      ? "/api/public/portfolio"
      : `/api/public/portfolio?sport=${encodeURIComponent(activeSport)}`;

    fetch(url)
      .then((r) => r.json())
      .then(({ items: data }: { items: PortfolioItem[] }) => {
        setItems(data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeSport]);

  function selectSport(sport: string) {
    setActiveSport(sport);
    const params = new URLSearchParams(searchParams.toString());
    if (sport === "All") params.delete("sport");
    else params.set("sport", sport);
    router.replace(`/work${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }

  const visibleFilters = ALL_SPORTS.filter(
    (s) => s === "All" || availableSports.includes(s)
  );

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TenantLogo className="h-7" href="/" />
        </div>
        <nav className="flex items-center gap-5">
          <a href="/brief/choose" className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">
            Start Your Order →
          </a>
          <a href="/login" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">
            Sign In
          </a>
        </nav>
      </header>

      <main className="flex-1 px-4 py-12 max-w-6xl mx-auto w-full">

        {/* Hero */}
        <div className="mb-10 space-y-2">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-muted">
            {tenant.name}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-wide text-brand-text leading-none">
            Our Work
          </h1>
          <p className="text-sm text-brand-muted font-barlow max-w-lg">
            Custom sportswear crafted for teams across the country. Every piece is made to order.
          </p>
        </div>

        {/* Sport filters */}
        {visibleFilters.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {visibleFilters.map((sport) => (
              <button
                key={sport}
                type="button"
                onClick={() => selectSport(sport)}
                className={`px-4 py-2 rounded-full text-xs font-display font-bold uppercase tracking-wider transition-all duration-150
                  ${activeSport === sport
                    ? "bg-brand-primary text-white"
                    : "bg-brand-surface border border-brand-border text-brand-muted hover:border-brand-primary hover:text-brand-text"
                  }`}
              >
                {sport}
              </button>
            ))}
          </div>
        )}

        {/* Gallery */}
        {loading ? (
          <div className="py-24 flex justify-center">
            <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-24 text-center space-y-4">
            <p className="font-display text-xl font-bold uppercase tracking-wide text-brand-text">
              Nothing here yet
            </p>
            <p className="text-sm text-brand-muted font-barlow">
              {activeSport !== "All" ? `No ${activeSport} work posted yet.` : "No portfolio items posted yet."}
            </p>
            {activeSport !== "All" && (
              <button
                type="button"
                onClick={() => selectSport("All")}
                className="text-xs font-display uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors"
              >
                View all work →
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-6">
              {items.length} piece{items.length !== 1 ? "s" : ""}
              {activeSport !== "All" ? ` · ${activeSport}` : ""}
            </p>

            {/* Masonry-style grid using CSS columns */}
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="break-inside-avoid group relative bg-brand-surface border border-brand-border rounded-xl overflow-hidden"
                >
                  <div className="overflow-hidden">
                    <img
                      src={item.image_url}
                      alt={item.caption ?? `${item.sport ?? "Custom"} sportswear`}
                      className="w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>
                  {(item.caption || item.sport) && (
                    <div className="px-3 py-2.5">
                      {item.sport && (
                        <span className="text-[9px] font-display uppercase tracking-wider text-brand-muted">
                          {item.sport}
                        </span>
                      )}
                      {item.caption && (
                        <p className="text-xs font-barlow text-brand-text mt-0.5 leading-relaxed">
                          {item.caption}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-16 text-center border-t border-brand-border pt-12 space-y-4">
              <p className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text">
                Ready for your own?
              </p>
              <p className="text-sm text-brand-muted font-barlow">
                Submit a brief and get AI-generated concepts within minutes.
              </p>
              <a
                href="/brief/choose"
                className="inline-block mt-2 px-8 py-4 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary transition-colors"
              >
                Start Your Order →
              </a>
            </div>
          </>
        )}

      </main>

      <footer className="border-t border-brand-border px-6 py-6 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted">
          {tenant.name} · Custom Sportswear
        </p>
      </footer>
    </div>
  );
}

export default function WorkPage() {
  return (
    <Suspense>
      <WorkGalleryContent />
    </Suspense>
  );
}
