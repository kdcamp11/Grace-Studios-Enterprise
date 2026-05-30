"use client";

import React, { useState } from "react";
import TenantLogo from "@/components/TenantLogo";
import type { DesignMetadata } from "@/app/api/generate-concepts/route";

// ─── Shared board types ───────────────────────────────────────────────────────

export interface BoardData {
  teamName:         string;
  orderNumber:      string;
  metadata:         DesignMetadata;
  logoUrls:         string[];   // exact uploaded logos — composited by app, not AI
  gsLogoPlacement?: string;     // "chest" | "left_chest" | "right_chest" | etc.
}

// ─── Shared sub-components ────────────────────────────────────────────────────

export function ColorSwatch({ role, name, hex, pantone }: { role: string; name: string; hex: string; pantone?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <div
        className="w-7 h-7 rounded flex-shrink-0 border border-black/10"
        style={{ backgroundColor: hex || "#ccc" }}
      />
      <div className="min-w-0">
        <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-500 leading-tight truncate">{role}</p>
        <p className="text-[9px] text-gray-700 leading-tight">{pantone || name}</p>
      </div>
    </div>
  );
}

export function RenderImage({ url, alt, className, style, placeholder }: { url?: string; alt: string; className?: string; style?: React.CSSProperties; placeholder?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error,  setError]  = useState(false);

  if (!url) return (
    <div className={`bg-gray-50 flex items-center justify-center ${className ?? ""}`} style={style}>
      <span className="text-gray-300 text-[10px] font-display uppercase tracking-wider">{placeholder ?? "Rendering…"}</span>
    </div>
  );

  return (
    <div className={`relative bg-gray-50 overflow-hidden ${className ?? ""}`} style={style}>
      {!loaded && !error && <div className="absolute inset-0 animate-pulse bg-gray-100" />}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-gray-300 text-[10px]">Unavailable</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`w-full h-full object-contain transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}

// ─── Full renders spec board (current format) ────────────────────────────────

export function RendersBoard({ data, studioName, isBuilder }: { data: BoardData; studioName?: string; isBuilder?: boolean }) {
  const { teamName, orderNumber, metadata, logoUrls } = data;
  const renders       = metadata.renders;
  const colorway      = metadata.colorway      ?? [];
  const materials     = metadata.materials     ?? [];
  const features      = metadata.features      ?? [];
  const garmentType   = metadata.garmentType   ?? "Basketball Uniform";
  const designSystem  = (metadata.designSystem ?? "bold").toUpperCase();
  const logoPlacement = metadata.logoPlacement ?? "";

  const isTracksuit   = garmentType.toLowerCase().includes("tracksuit");
  const col1Label     = isTracksuit ? "Jacket" : "Jersey";
  const col2Label     = isTracksuit ? "Pants"  : "Shorts";

  // Primary logo: exact uploaded asset — composited by React into the clean logo zone
  // that the AI reserved. Typography (wordmark + number) is AI-rendered into the fabric.
  const primaryLogo = logoUrls?.[0] ?? null;

  return (
    <div
      className="rounded-xl overflow-hidden border border-gray-200 shadow-xl"
      style={{ backgroundColor: "#f9f8f5" }}
    >
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-px h-5 bg-gray-800" />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-gray-400">
            {isBuilder ? "Jersey Build" : "Creative Direction"}
          </span>
        </div>
        <span className="text-[9px] font-mono text-gray-300 tracking-widest">{orderNumber}</span>
      </div>

      {isBuilder ? (
        /* ── Builder: jersey + shorts side by side ───────────────────────── */
        <div className="flex flex-col md:flex-row" style={{ minHeight: 420 }}>
          {/* Left — team info */}
          <div
            className="flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-200 bg-white flex flex-col"
            style={{ width: 168 }}
          >
            <div className="px-5 pt-5 pb-4">
              <p className="text-[7px] font-bold uppercase tracking-[0.32em] text-gray-400 mb-1">{studioName ?? "Custom Sportswear"}</p>
              <p className="text-sm font-bold uppercase tracking-wide text-gray-900 leading-tight break-words">{teamName}</p>
              <p className="text-[8px] uppercase tracking-[0.18em] text-gray-400 mt-1">{garmentType}</p>
            </div>
            {primaryLogo && (
              <div className="px-5 py-3 border-t border-gray-100">
                <p className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400 mb-2">Team Logo</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={primaryLogo} alt={`${teamName} logo`} className="max-h-12 w-auto object-contain" style={{ maxWidth: "100%" }} />
              </div>
            )}
            <div className="hidden md:block px-5 py-4 border-t border-gray-100 mt-auto">
              <p className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400 mb-2">Design Preview</p>
              <p className="text-[8px] text-gray-500 leading-relaxed">
                Front colorway preview from your builder selections. Full views developed during production.
              </p>
            </div>
          </div>

          {/* Center — jersey + shorts two-column grid */}
          <div className="flex-1 flex flex-col" style={{ backgroundColor: "#f9f8f5" }}>
            {/* Column headers */}
            <div className="grid grid-cols-2 border-b border-gray-200">
              <div className="border-r border-gray-200 py-2 text-center">
                <span className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400">Jersey</span>
              </div>
              <div className="py-2 text-center">
                <span className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400">Shorts</span>
              </div>
            </div>
            {/* Images */}
            <div className="flex-1 grid grid-cols-2" style={{ minHeight: 360 }}>
              <div className="border-r border-gray-200 overflow-hidden">
                <RenderImage url={renders?.frontJersey} alt="Jersey front" className="w-full h-full" style={{ minHeight: 360 }} />
              </div>
              <div className="overflow-hidden">
                <RenderImage url={renders?.frontShorts} alt="Shorts front" className="w-full h-full" style={{ minHeight: 360 }} placeholder="Developed in Production" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* ── Mobile layout — 2×2 image grid only ────────────────────────────── */}
      <div className="md:hidden" style={{ backgroundColor: "#f9f8f5" }}>
        {/* Team info strip */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-900">{teamName}</p>
            <p className="text-[9px] uppercase tracking-[0.18em] text-gray-400 mt-0.5">{garmentType}</p>
          </div>
          <span className="inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-gray-900 text-white">
            {designSystem}
          </span>
        </div>

        {/* 2×2 image grid */}
        <div className="grid grid-cols-2">
          {/* Front jacket/jersey */}
          <div className="relative border-r border-b border-gray-200 bg-gray-50" style={{ aspectRatio: "1/1" }}>
            <span className="absolute top-2 left-2.5 text-[8px] font-bold uppercase tracking-[0.22em] text-gray-400 z-10 bg-white/80 px-1.5 py-0.5 rounded">
              {col1Label} Front
            </span>
            <RenderImage url={renders?.frontJersey} alt={`${col1Label} front`} className="absolute inset-0 w-full h-full" />
          </div>

          {/* Front shorts/pants */}
          <div className="relative border-b border-gray-200 bg-gray-50" style={{ aspectRatio: "1/1" }}>
            <span className="absolute top-2 left-2.5 text-[8px] font-bold uppercase tracking-[0.22em] text-gray-400 z-10 bg-white/80 px-1.5 py-0.5 rounded">
              {col2Label} Front
            </span>
            <RenderImage url={renders?.frontShorts} alt={`${col2Label} front`} className="absolute inset-0 w-full h-full" />
          </div>

          {/* Back jacket/jersey */}
          <div className="relative border-r border-gray-200 bg-gray-50" style={{ aspectRatio: "1/1" }}>
            <span className="absolute top-2 left-2.5 text-[8px] font-bold uppercase tracking-[0.22em] text-gray-400 z-10 bg-white/80 px-1.5 py-0.5 rounded">
              {col1Label} Back
            </span>
            <RenderImage url={renders?.backJersey} alt={`${col1Label} back`} className="absolute inset-0 w-full h-full" />
          </div>

          {/* Back shorts/pants */}
          <div className="relative bg-gray-50" style={{ aspectRatio: "1/1" }}>
            <span className="absolute top-2 left-2.5 text-[8px] font-bold uppercase tracking-[0.22em] text-gray-400 z-10 bg-white/80 px-1.5 py-0.5 rounded">
              {col2Label} Back
            </span>
            <RenderImage url={renders?.backShorts} alt={`${col2Label} back`} className="absolute inset-0 w-full h-full" />
          </div>
        </div>
      </div>

      {/* ── Desktop three-column body ───────────────────────────────────────── */}
      <div className="hidden md:flex" style={{ minHeight: 560 }}>

        {/* Left column — specs */}
        <div
          className="flex-shrink-0 border-r border-gray-200 flex flex-col"
          style={{ width: 196, backgroundColor: "#ffffff" }}
        >
          {/* Team */}
          <div className="px-5 pt-5 pb-4 border-b border-gray-100">
            <p className="text-[7px] font-bold uppercase tracking-[0.32em] text-gray-400 mb-1">{studioName ?? "Custom Sportswear"}</p>
            <p className="text-sm font-bold uppercase tracking-wide text-gray-900 leading-tight break-words">{teamName}</p>
            <p className="text-[8px] uppercase tracking-[0.18em] text-gray-400 mt-1">{garmentType}</p>
          </div>

          {/* Uploaded logo preview — locked asset confirmation */}
          {primaryLogo && (
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400 mb-2">Team Logo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={primaryLogo}
                alt={`${teamName} logo`}
                className="max-h-12 w-auto object-contain"
                style={{ maxWidth: "100%" }}
              />
            </div>
          )}

          {/* Design system badge */}
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400 mb-1.5">Design System</p>
            <span className="inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-gray-900 text-white">
              {designSystem}
            </span>
          </div>

          {/* Colorway */}
          {colorway.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400 mb-3">Colorway</p>
              {colorway.map((c, i) => <ColorSwatch key={i} {...c} />)}
            </div>
          )}

          {/* Materials */}
          {materials.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400 mb-2">Material</p>
              {materials.map((m, i) => (
                <p key={i} className="text-[8px] text-gray-600 leading-relaxed mb-0.5">{m}</p>
              ))}
            </div>
          )}

          {/* Features */}
          {features.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400 mb-2">Features</p>
              {features.map((f, i) => (
                <p key={i} className="text-[8px] text-gray-600 leading-snug mb-1.5">
                  <span className="text-gray-400 mr-1">•</span>
                  {f.replace(/^[•\-–]\s*/, "")}
                </p>
              ))}
            </div>
          )}

          {/* Logo placement */}
          {logoPlacement && (
            <div className="px-5 py-4">
              <p className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400 mb-1.5">Logo Placement</p>
              <p className="text-[8px] text-gray-600 leading-snug capitalize">{logoPlacement.replace(/_/g, " ")}</p>
            </div>
          )}
        </div>

        {/* Center — 2×2 render grid */}
        <div className="flex-1 flex flex-col border-r border-gray-200" style={{ backgroundColor: "#f9f8f5" }}>
          {/* Column labels */}
          <div className="grid grid-cols-2 border-b border-gray-200">
            <div className="border-r border-gray-200 py-2 text-center">
              <span className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400">{col1Label}</span>
            </div>
            <div className="py-2 text-center">
              <span className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400">{col2Label}</span>
            </div>
          </div>

          {/* Row labels + images */}
          <div className="flex-1 grid grid-cols-2 grid-rows-2">
            <div className="relative border-r border-b border-gray-200 overflow-hidden" style={{ minHeight: 240 }}>
              <span className="absolute top-2 left-2.5 text-[6px] font-bold uppercase tracking-[0.28em] text-gray-300 z-10">Front</span>
              <RenderImage url={renders?.frontJersey} alt={`${col1Label} front`} className="w-full h-full" />
            </div>

            <div className="relative border-b border-gray-200 overflow-hidden" style={{ minHeight: 240 }}>
              <span className="absolute top-2 left-2.5 text-[6px] font-bold uppercase tracking-[0.28em] text-gray-300 z-10">Front</span>
              <RenderImage url={renders?.frontShorts} alt={`${col2Label} front`} className="w-full h-full" />
            </div>

            <div className="relative border-r border-gray-200 overflow-hidden" style={{ minHeight: 240 }}>
              <span className="absolute top-2 left-2.5 text-[6px] font-bold uppercase tracking-[0.28em] text-gray-300 z-10">Back</span>
              <RenderImage url={renders?.backJersey} alt={`${col1Label} back`} className="w-full h-full" />
            </div>
            <div className="relative overflow-hidden" style={{ minHeight: 240 }}>
              <span className="absolute top-2 left-2.5 text-[6px] font-bold uppercase tracking-[0.28em] text-gray-300 z-10">Back</span>
              <RenderImage url={renders?.backShorts} alt={`${col2Label} back`} className="w-full h-full" />
            </div>
          </div>
        </div>

        {/* Right column — design notes */}
        <div
          className="flex-shrink-0 flex flex-col divide-y divide-gray-100"
          style={{ width: 168, backgroundColor: "#ffffff" }}
        >
          <div className="px-4 pt-5 pb-4">
            <p className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400 mb-2">Design Notes</p>
            <p className="text-[8px] text-gray-500 leading-relaxed">
              {(() => {
                const desc = (metadata.description ?? "").trim();
                if (!desc || desc.startsWith("{") || desc.startsWith("[")) return null;
                return desc.slice(0, 200);
              })()}
            </p>
          </div>

          <div className="px-4 py-4">
            <p className="text-[7px] font-bold uppercase tracking-[0.28em] text-gray-400 mb-2">Render Quality</p>
            <p className="text-[8px] text-gray-500 leading-relaxed">
              Semi-3D photorealistic. Typography sublimated into fabric by AI. Team logo composited from uploaded asset.
            </p>
          </div>

          <div className="px-4 py-4 flex-1 flex flex-col justify-end">
            <div className="opacity-20 mt-auto">
              <TenantLogo className="h-5" />
            </div>
          </div>
        </div>
      </div>{/* end desktop 3-col */}
        </>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-200 bg-white px-5 py-2.5 flex items-center justify-between">
        <p className="text-[7px] text-gray-400 italic leading-relaxed max-w-lg">
          {isBuilder
            ? "Builder preview is for colorway reference only. Final garment views are developed by a Grace Studios designer during production."
            : "AI concept renders are for visual direction only and may not exactly match final production. Colors, proportions, and details are subject to refinement. Logos are composited separately."}
        </p>
        <span className="text-[7px] font-mono text-gray-300 tracking-widest flex-shrink-0 ml-4">
          GRACE ATHLETICS: CONCEPT DRAFT
        </span>
      </div>
    </div>
  );
}
