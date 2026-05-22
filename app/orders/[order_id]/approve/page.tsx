"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";
import { useTenant } from "@/lib/tenant/context";
import type { RosterPlayer } from "@/types/database";

// ── Types ────────────────────────────────────────────────────────────────────

interface FullSummary {
  // Order
  orderNumber: string;
  packageTier: string | null;
  accountLead: string | null;
  depositPaid: boolean;
  balancePaid: boolean;
  orderNotes: string | null;

  // Client
  teamName: string;
  contactName: string;
  email: string;
  sport: string;
  city: string;

  // Garment specs
  jerseycut: string;
  sublimated: boolean | null;
  homeColorway: string | null;
  awayColorway: string | null;

  // Colors
  primaryColors: string;
  secondaryColors: string;
  accentColor: string | null;
  colorsToAvoid: string | null;
  hexConfirmed: boolean;
  brandMatch: boolean;

  // Design direction
  designSystem: string;
  visionPrompt: string | null;
  numberStyle: string | null;
  negativeReferences: string | null;

  // Branding
  logoPlacement: string | null;
  logosToInclude: string | null;
  sponsorText: string | null;
  playerNames: boolean;

  // Roster
  playerRoster: RosterPlayer[];

  // Reference
  referenceImageUrl: string | null;

  // Selected concept
  conceptImageUrl: string;
  conceptNumber: number;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-brand-surface rounded-xl border border-brand-border overflow-hidden">
      <div className="px-5 py-3 border-b border-brand-border bg-brand-surface">
        <p className="text-[9px] font-display uppercase tracking-[0.25em] text-brand-muted">{title}</p>
      </div>
      <div className="divide-y divide-brand-border">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-4 px-5 py-3">
      <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted w-36 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-brand-text flex-1 leading-relaxed ${mono ? "font-mono text-xs" : "font-barlow"}`}>{value}</span>
    </div>
  );
}

function BadgeRow({ label, value }: { label: string; value: boolean | null }) {
  if (value === null) return null;
  return (
    <div className="flex gap-4 px-5 py-3 items-center">
      <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted w-36 flex-shrink-0">{label}</span>
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-display uppercase tracking-wider
        ${value ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${value ? "bg-emerald-500" : "bg-red-500"}`} />
        {value ? "Yes" : "No"}
      </span>
    </div>
  );
}

function ColorRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value.trim());
  return (
    <div className="flex gap-4 px-5 py-3 items-center">
      <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted w-36 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2.5">
        {isHex && (
          <span className="w-5 h-5 rounded-full border border-brand-border flex-shrink-0 shadow-sm"
            style={{ backgroundColor: value }} />
        )}
        <span className="text-sm font-mono text-brand-text tracking-wide">{value}</span>
      </div>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="px-5 py-4">
      <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted mb-2">{label}</p>
      <p className="text-sm font-barlow text-brand-text leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function RosterTable({ roster }: { roster: RosterPlayer[] }) {
  if (!roster || roster.length === 0) return null;
  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted">Player Roster</p>
        <span className="text-[10px] font-barlow text-brand-muted">{roster.length} player{roster.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="rounded-lg border border-brand-border overflow-hidden">
        <table className="w-full text-xs font-barlow">
          <thead>
            <tr className="bg-brand-surface border-b border-brand-border">
              {["#", "Name", "Number", "Size", "Cut"].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-[9px] font-display uppercase tracking-wider text-brand-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {roster.map((player, i) => (
              <tr key={i} className="hover:bg-brand-surface transition-colors">
                <td className="px-3 py-2.5 text-brand-muted">{i + 1}</td>
                <td className="px-3 py-2.5 text-brand-text font-medium">{player.name || "—"}</td>
                <td className="px-3 py-2.5 text-brand-text font-mono">{player.number || "—"}</td>
                <td className="px-3 py-2.5 text-brand-muted capitalize">{player.size || "—"}</td>
                <td className="px-3 py-2.5 text-brand-muted capitalize">{player.cut || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovePage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const tenant = useTenant();

  const [summary, setSummary]     = useState<FullSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError]         = useState("");
  const [isAdminView, setIsAdminView] = useState(false);

  useEffect(() => {
    async function load() {
      const profile = await getProfile();
      if (profile) {
        if (profile.role === "supplier") { router.replace("/supplier"); return; }
        if (profile.role === "admin") setIsAdminView(true);
      }

      const { data: order } = await supabase
        .from("orders")
        .select("client_id, order_number, stage, package_tier, account_lead, notes, deposit_paid, balance_paid")
        .eq("id", order_id)
        .single();

      if (!order) { setLoading(false); return; }

      if (order.stage === "files_sent") {
        router.replace(`/orders/${order_id}/tracker`);
        return;
      }

      const [{ data: client }, { data: brief }, { data: concept }] = await Promise.all([
        supabase
          .from("clients")
          .select("name, contact_name, email, sport, city")
          .eq("id", order.client_id)
          .single(),
        supabase
          .from("briefs")
          .select(`
            design_system,
            primary_colors, secondary_colors, accent_color, colors_to_avoid,
            hex_confirmed, brand_match,
            jersey_cut, sublimated,
            home_colorway, away_colorway,
            number_style, player_names,
            logo_placement, logos_to_include, sponsor_text,
            reference_image_url, vision_prompt, negative_references,
            player_roster
          `)
          .eq("order_id", order_id)
          .single(),
        supabase
          .from("concepts")
          .select("image_url, concept_number")
          .eq("order_id", order_id)
          .eq("selected", true)
          .single(),
      ]);

      const roster: RosterPlayer[] = Array.isArray(brief?.player_roster)
        ? (brief.player_roster as RosterPlayer[])
        : [];

      setSummary({
        orderNumber:      order.order_number ?? order_id.slice(0, 8).toUpperCase(),
        packageTier:      order.package_tier,
        accountLead:      order.account_lead,
        depositPaid:      order.deposit_paid ?? false,
        balancePaid:      order.balance_paid ?? false,
        orderNotes:       order.notes,

        teamName:         client?.name ?? "",
        contactName:      client?.contact_name ?? "",
        email:            client?.email ?? "",
        sport:            client?.sport ?? "",
        city:             client?.city ?? "",

        jerseycut:        brief?.jersey_cut ?? "",
        sublimated:       brief?.sublimated ?? null,
        homeColorway:     brief?.home_colorway ?? null,
        awayColorway:     brief?.away_colorway ?? null,

        primaryColors:    brief?.primary_colors ?? "",
        secondaryColors:  brief?.secondary_colors ?? "",
        accentColor:      brief?.accent_color ?? null,
        colorsToAvoid:    brief?.colors_to_avoid ?? null,
        hexConfirmed:     brief?.hex_confirmed ?? false,
        brandMatch:       brief?.brand_match ?? false,

        designSystem:     brief?.design_system ?? "",
        visionPrompt:     brief?.vision_prompt ?? null,
        numberStyle:      brief?.number_style ?? null,
        negativeReferences: brief?.negative_references ?? null,

        logoPlacement:    (brief?.logo_placement ?? "").replace(/_/g, " "),
        logosToInclude:   brief?.logos_to_include ?? null,
        sponsorText:      brief?.sponsor_text ?? null,
        playerNames:      brief?.player_names ?? false,

        playerRoster:     roster,

        referenceImageUrl: brief?.reference_image_url ?? null,

        conceptImageUrl:  concept?.image_url ?? "",
        conceptNumber:    concept?.concept_number ?? 0,
      });

      setLoading(false);
    }
    load();
  }, [order_id, supabase, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleApprove() {
    setApproving(true);
    setError("");
    try {
      const res = await fetch("/api/approve-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval failed");
      router.push(`/orders/${order_id}/production`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <p className="text-brand-muted font-barlow">Order not found.</p>
      </div>
    );
  }

  const constructionLabel =
    summary.sublimated === true  ? "Sublimated"   :
    summary.sublimated === false ? "Tackle Twill" : null;

  const cutLabel = summary.jerseycut
    ? summary.jerseycut.charAt(0).toUpperCase() + summary.jerseycut.slice(1)
    : null;

  const systemLabel = summary.designSystem
    ? summary.designSystem.charAt(0).toUpperCase() + summary.designSystem.slice(1)
    : null;

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {isAdminView && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-xs font-display font-bold uppercase tracking-widest text-amber-700">Admin View — Client Portal</span>
        </div>
      )}
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <OrgLogo href="/portal" />
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            Client Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-5">

          {/* Title */}
          <div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text">
              Approve & Send to Production
            </h1>
            <p className="mt-1.5 text-sm text-brand-muted font-barlow">
              Review every production detail below before locking your order.
            </p>
          </div>

          {/* Selected concept image */}
          {summary.conceptImageUrl && (
            <div className="rounded-xl border border-brand-primary overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={summary.conceptImageUrl}
                alt={`Selected concept ${summary.conceptNumber}`}
                className="w-full object-contain bg-brand-surface max-h-[420px]"
              />
              <div className="px-4 py-3 bg-brand-surface border-t border-brand-border flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-brand-primary" />
                <span className="text-[10px] font-display uppercase tracking-[0.22em] text-brand-primary">
                  Selected — Concept {summary.conceptNumber}
                </span>
              </div>
            </div>
          )}

          {/* ── Order Details ─────────────────────────────────────────────── */}
          <Section title="Order Details">
            <Row label="Order #"      value={summary.orderNumber} mono />
            <Row label="Package"      value={summary.packageTier} />
            <Row label="Account Lead" value={summary.accountLead} />
            <div className="flex gap-4 px-5 py-3 items-center">
              <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted w-36 flex-shrink-0">Payment</span>
              <div className="flex gap-2">
                <span className={`px-2 py-0.5 rounded text-[9px] font-display uppercase tracking-wider
                  ${summary.depositPaid ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-brand-surface text-brand-muted border border-brand-border"}`}>
                  Deposit {summary.depositPaid ? "✓" : "Pending"}
                </span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-display uppercase tracking-wider
                  ${summary.balancePaid ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-brand-surface text-brand-muted border border-brand-border"}`}>
                  Balance {summary.balancePaid ? "✓" : "Pending"}
                </span>
              </div>
            </div>
            {summary.orderNotes && <TextBlock label="Notes" value={summary.orderNotes} />}
          </Section>

          {/* ── Client ───────────────────────────────────────────────────── */}
          <Section title="Client">
            <Row label="Team"    value={summary.teamName} />
            <Row label="Contact" value={summary.contactName} />
            <Row label="Email"   value={summary.email} mono />
            <Row label="Sport"   value={summary.sport} />
            <Row label="City"    value={summary.city} />
          </Section>

          {/* ── Garment Specs ─────────────────────────────────────────────── */}
          <Section title="Garment Specs">
            <Row label="Design System"  value={systemLabel} />
            <Row label="Jersey Cut"     value={cutLabel} />
            <Row label="Construction"   value={constructionLabel} />
            <Row label="Home Colorway"  value={summary.homeColorway} />
            <Row label="Away Colorway"  value={summary.awayColorway} />
          </Section>

          {/* ── Color Palette ─────────────────────────────────────────────── */}
          <Section title="Color Palette">
            <ColorRow label="Primary"     value={summary.primaryColors} />
            <ColorRow label="Secondary"   value={summary.secondaryColors} />
            <ColorRow label="Accent / Trim" value={summary.accentColor} />
            <ColorRow label="Avoid"       value={summary.colorsToAvoid} />
            <BadgeRow label="Hex Confirmed" value={summary.hexConfirmed} />
            <BadgeRow label="Brand Match"   value={summary.brandMatch} />
          </Section>

          {/* ── Design Direction ──────────────────────────────────────────── */}
          <Section title="Design Direction">
            <TextBlock label="Vision"             value={summary.visionPrompt} />
            <Row       label="Number Style"       value={summary.numberStyle} />
            <TextBlock label="Avoid / Negatives"  value={summary.negativeReferences} />
          </Section>

          {/* ── Branding & Placement ──────────────────────────────────────── */}
          <Section title="Branding & Placement">
            <Row       label="Logo Placement" value={summary.logoPlacement} />
            <TextBlock label="Logos"        value={summary.logosToInclude} />
            <TextBlock label="Sponsor Text" value={summary.sponsorText} />
            <BadgeRow  label="Player Names" value={summary.playerNames} />
          </Section>

          {/* ── Reference Image ───────────────────────────────────────────── */}
          {summary.referenceImageUrl && (
            <Section title="Reference Image">
              <div className="p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={summary.referenceImageUrl}
                  alt="Client reference"
                  className="w-full max-h-48 object-contain rounded-lg bg-brand-surface"
                />
              </div>
            </Section>
          )}

          {/* ── Player Roster ─────────────────────────────────────────────── */}
          {summary.playerRoster.length > 0 && (
            <Section title={`Player Roster (${summary.playerRoster.length})`}>
              <RosterTable roster={summary.playerRoster} />
            </Section>
          )}

          {/* ── Design Lock Warning ───────────────────────────────────────── */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-[10px] font-display uppercase tracking-[0.22em] text-amber-700 mb-2">Design Lock Notice</p>
            <p className="text-sm text-amber-800 font-barlow leading-relaxed">
              Once approved, your design is locked and sent to our production team. Any changes after this point are subject to revision fees.
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              {[
                { label: "Color change",  price: "$25"  },
                { label: "Logo change",   price: "$75"  },
                { label: "Layout change", price: "$150" },
              ].map(({ label, price }) => (
                <div key={label} className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg px-3 py-1.5">
                  <span className="text-[10px] font-barlow text-amber-700">{label}</span>
                  <span className="text-[10px] font-display font-bold text-amber-600">{price}</span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm font-barlow bg-red-950/30 border border-red-800/40 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {/* Approve button */}
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            className="w-full py-4 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
              bg-brand-text text-brand-bg hover:bg-brand-primary hover:text-white border border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {approving ? "Sending to Production…" : "Approve & Send to Production →"}
          </button>

          <p className="text-center text-[10px] text-brand-muted font-barlow pb-6">
            By approving, you confirm all details above are correct and authorize {tenant.name} to begin production.
          </p>

        </div>
      </main>
    </div>
  );
}
