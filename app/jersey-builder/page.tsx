"use client";

/**
 * Jersey Builder page
 *
 * Renders the GLB jersey inside a React Three Fiber canvas.
 * Logos, team names, numbers and custom text are applied as
 * THREE.js Decal geometry projected onto the jersey surface —
 * they stay locked to the garment when rotating or zooming.
 * No floating HTML overlays are used for jersey artwork.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useThree } from "@react-three/drei";
import * as THREE from "three";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import { saveBriefState } from "@/lib/brief-state";
import JerseyScene, {
  type ZoneColors,
  type ArtworkItem,
  type SurfaceHit,
  type GroupCenters,
} from "@/components/JerseyBuilder/JerseyScene";

// ── Zone definitions (matches GLB material names) ─────────────────────────────

const ZONES = [
  { key: "jerseyTop"        , label: "Jersey Top"               },
  { key: "collar"           , label: "Collar"                   },
  { key: "jerseyShorts"     , label: "Shorts"                   },
  { key: "jerseySidePanels" , label: "Jersey Side Panels"       },
  { key: "jerseyLowerPanels", label: "Jersey Lower Side Panels" },
  { key: "sleevePanels"     , label: "Sleeve Panels"            },
  { key: "shortSidePanels"  , label: "Shorts Side Panels"       },
] as const;

const DEFAULT_COLORS: ZoneColors = {
  jerseyTop:         "#1d3557",
  collar:            "#f4d03f",
  jerseyShorts:      "#1d3557",
  jerseySidePanels:  "#f4d03f",
  jerseyLowerPanels: "#f4d03f",
  sleevePanels:      "#f4d03f",
  shortSidePanels:   "#f4d03f",
};

// ── Artwork state (serialisable) ──────────────────────────────────────────────

interface ArtworkDraft {
  id: string;
  type: "logo" | "teamName" | "number" | "customText";
  label: string;          // UI display label
  // logo source
  imageDataUrl?: string;
  fileName?: string;
  // text source
  text?: string;
  textColor: string;
  outlineColor: string;
  // placement
  placed: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  size: number;
  // resolved texture (kept outside React state to avoid issues — see textureMapRef)
}

// ── Texture helpers ───────────────────────────────────────────────────────────

/** Build a CanvasTexture for a text / number artwork. */
function buildTextTexture(
  text: string,
  fillColor: string,
  strokeColor: string,
  isNumber: boolean,
): THREE.CanvasTexture {
  const W = isNumber ? 256 : 512;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  const fontSize = Math.floor(H * 0.72);
  ctx.font         = `900 ${fontSize}px Impact, "Arial Black", Arial, sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin     = "round";

  // Outline pass
  ctx.lineWidth   = Math.max(8, fontSize * 0.12);
  ctx.strokeStyle = strokeColor;
  ctx.strokeText(text, W / 2, H / 2);

  // Fill pass
  ctx.fillStyle = fillColor;
  ctx.fillText(text, W / 2, H / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Load an image (blob URL / data-URL) into a THREE.Texture. */
function buildLogoTexture(src: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = reject;
    img.src     = src;
  });
}

/** Compute a world-space Euler rotation that aligns the decal's +Z with `normal`. */
function normalToRotation(normal: THREE.Vector3): [number, number, number] {
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal.clone().normalize(),
  );
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}

// ── Colour swatch / picker ────────────────────────────────────────────────────

function ColorControl({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[10px] font-display font-bold uppercase tracking-[0.15em] text-brand-muted whitespace-nowrap">
        {label}
      </label>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] font-barlow text-brand-muted font-mono">{value.toUpperCase()}</span>
        <input
          type="color" value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-brand-border bg-transparent"
        />
      </div>
    </div>
  );
}

// ── Main builder ──────────────────────────────────────────────────────────────

function JerseyBuilderInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const orderId      = searchParams.get("orderId");
  const sport        = (searchParams.get("sport") ?? "").toLowerCase();
  const hasModel     = sport === "" || sport === "basketball";

  const [ready,   setReady]   = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // ── Auth check ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        await sessionReady();
        const profile = await getProfile();
        if (!profile) { router.replace("/login"); return; }
        if (profile.role === "supplier") { router.replace("/supplier"); return; }
        setReady(true);
      } catch { router.replace("/login"); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Zone colours ────────────────────────────────────────────────────────
  const [colors, setColors] = useState<ZoneColors>(DEFAULT_COLORS);

  // ── Artwork drafts ──────────────────────────────────────────────────────
  const [artworkDrafts, setArtworkDrafts] = useState<ArtworkDraft[]>([]);
  /**
   * Textures are stored outside React state to avoid serialisation overhead.
   * Key = artwork.id
   */
  const textureMapRef = useRef<Record<string, THREE.Texture>>({});

  // ── Artwork that is waiting to be placed (click-to-place mode) ───────────
  const [placingId, setPlacingId] = useState<string | null>(null);
  const isPlacing = placingId !== null;

  // ── Text artwork fields ─────────────────────────────────────────────────
  const [teamName,    setTeamName]    = useState("");
  const [jerseyNum,   setJerseyNum]   = useState("");
  const [customText,  setCustomText]  = useState("");
  const [textColor,   setTextColor]   = useState("#ffffff");
  const [outlineColor,setOutlineColor]= useState("#000000");

  // ── View toggle (JERSEY / SHORTS) ────────────────────────────────────────
  const [activeView,   setActiveView]   = useState<"jersey" | "shorts">("jersey");
  const [groupCenters, setGroupCenters] = useState<GroupCenters | null>(null);
  const orbitRef = useRef<any>(null);

  const handleGroupCenters = useCallback((centers: GroupCenters) => {
    setGroupCenters(centers);
  }, []);

  // Move camera target when tab changes
  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls || !groupCenters) return;
    const targetY = activeView === "jersey" ? groupCenters.jerseyTopY : groupCenters.shortsY;
    controls.target.set(0, targetY, 0);
    controls.update();
  }, [activeView, groupCenters]);

  // ── Jersey-top mesh (exposed by JerseyScene after load) ─────────────────
  const jerseyTopMeshRef = useRef<THREE.Mesh | null>(null);

  const handleJerseyTopReady = useCallback((mesh: THREE.Mesh | null) => {
    jerseyTopMeshRef.current = mesh;
  }, []);

  /** Raycast from directly in front of the jersey chest to find the surface
   *  point for auto-placing artwork.  Falls back to a hardcoded chest position
   *  if the mesh isn't ready or the ray misses. */
  const autoPlacePosition = useCallback(
    (yOffset = 0): { position: [number, number, number]; rotation: [number, number, number] } => {
      const mesh = jerseyTopMeshRef.current;
      if (mesh) {
        try {
          mesh.updateWorldMatrix(true, false);
          const box = new THREE.Box3().setFromObject(mesh);
          const center = new THREE.Vector3();
          box.getCenter(center);

          // Jersey front faces +Z (toward camera at z=+18).
          // Shoot a ray from z=+50 going –Z to hit the front surface.
          const raycaster = new THREE.Raycaster();
          raycaster.set(
            new THREE.Vector3(center.x, center.y + yOffset, 50),
            new THREE.Vector3(0, 0, -1),
          );
          const hits = raycaster.intersectObject(mesh, true);
          if (hits.length > 0) {
            const hit = hits[0];
            const normal = hit.face!.normal.clone()
              .transformDirection(mesh.matrixWorld)
              .normalize();
            return {
              position: [hit.point.x, hit.point.y, hit.point.z],
              rotation: normalToRotation(normal),
            };
          }
        } catch { /* ignore — use fallback */ }
      }
      // Fallback: chest-area estimate for the centred model
      return { position: [0, 1 + yOffset, -0.5], rotation: [0, 0, 0] };
    },
    [],
  );

  // ── Logo upload ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      for (const file of files) {
        const id = crypto.randomUUID();
        const dataUrl = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(file);
        });
        const texture = await buildLogoTexture(dataUrl);
        textureMapRef.current[id] = texture;
        const { position, rotation } = autoPlacePosition(1.5); // upper chest
        setArtworkDrafts((prev) => [
          ...prev,
          {
            id,
            type: "logo",
            label: file.name,
            imageDataUrl: dataUrl,
            fileName: file.name,
            textColor: "#ffffff",
            outlineColor: "#000000",
            placed: true,
            position,
            rotation,
            size: 0.6,
          },
        ]);
      }
    },
    [autoPlacePosition],
  );

  /** Add a text artwork and auto-place it on the jersey front. */
  const addTextArtwork = useCallback(
    (type: ArtworkDraft["type"], text: string) => {
      if (!text.trim()) return;
      const id    = crypto.randomUUID();
      const isNum = type === "number";
      const texture = buildTextTexture(text.trim(), textColor, outlineColor, isNum);
      textureMapRef.current[id] = texture;

      const label = type === "teamName" ? `Name: ${text}`
                  : type === "number"   ? `# ${text}`
                  : `Text: ${text}`;

      // Auto-place: team name at upper chest, number at centre, custom at lower
      const yOffset = type === "teamName" ? 1.5 : type === "number" ? 0 : -1;
      const { position, rotation } = autoPlacePosition(yOffset);

      setArtworkDrafts((prev) => [
        ...prev,
        {
          id, type, label, text: text.trim(),
          textColor, outlineColor,
          placed: true,
          position,
          rotation,
          size: isNum ? 0.9 : 0.5,
        },
      ]);
    },
    [textColor, outlineColor, autoPlacePosition],
  );

  /** Called when user clicks on the jersey while isPlacing is true (Move). */
  const handleSurfaceClick = useCallback(
    (hit: SurfaceHit) => {
      if (!placingId) return;
      const rotation = normalToRotation(hit.normal);
      setArtworkDrafts((prev) =>
        prev.map((a) =>
          a.id === placingId
            ? {
                ...a,
                placed:   true,
                position: [hit.point.x, hit.point.y, hit.point.z] as [number, number, number],
                rotation,
              }
            : a,
        ),
      );
      setPlacingId(null);
    },
    [placingId],
  );

  /** Remove an artwork and dispose its texture. */
  const removeArtwork = useCallback((id: string) => {
    textureMapRef.current[id]?.dispose();
    delete textureMapRef.current[id];
    setArtworkDrafts((prev) => prev.filter((a) => a.id !== id));
    setPlacingId((p) => (p === id ? null : p));
  }, []);

  /**
   * Build the ArtworkItem array that JerseyScene consumes.
   * Only placed items are included.
   */
  const sceneArtworks = useMemo<ArtworkItem[]>(
    () =>
      artworkDrafts
        .filter((a) => a.placed && a.position)
        .map((a) => ({
          id:       a.id,
          type:     a.type,
          texture:  textureMapRef.current[a.id] ?? null,
          position: a.position!,
          rotation: a.rotation ?? [0, 0, 0],
          size:     a.size,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artworkDrafts],
  );

  if (!ready) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:h-screen bg-brand-bg flex flex-col lg:overflow-hidden">

      {/* Header */}
      <header className="flex-shrink-0 border-b border-brand-border px-6 sm:px-10 py-4 flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/grace-enterprise-logo.jpeg"
          alt="Grace Enterprise"
          style={{ width: 160 }}
          className="h-auto object-contain"
        />
        <div className="flex items-center gap-5">
          <Link href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Portal</Link>
          <Link href="/brief/new?path=ai" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Text Brief</Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* ── 3-D Viewport ─────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-0 bg-[#f0f0f0]" style={{ minHeight: "clamp(280px, 50vh, 999px)" }}>

          {/* Viewport label */}
          <div className="absolute top-4 left-5 z-10 flex items-center gap-2 pointer-events-none">
            <div className="w-[3px] h-4 bg-brand-primary" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.25em] text-brand-text/70">Jersey Builder</span>
          </div>

          {/* Placing-mode banner */}
          {isPlacing && (
            <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 bg-brand-primary text-white px-4 py-1.5 rounded-full text-[11px] font-display font-bold uppercase tracking-wider shadow pointer-events-none">
              Click jersey to place artwork
            </div>
          )}

          {/* Cancel placing */}
          {isPlacing && (
            <button
              onClick={() => setPlacingId(null)}
              className="absolute top-14 left-1/2 z-10 -translate-x-1/2 bg-brand-bg/90 border border-brand-border text-[10px] font-display uppercase tracking-widest text-brand-muted px-3 py-1 rounded-full hover:text-brand-primary transition-colors"
            >
              Cancel placement
            </button>
          )}

          {/* JERSEY / SHORTS view tabs */}
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 flex gap-1 bg-brand-bg/80 backdrop-blur border border-brand-border rounded-full px-1 py-1">
            {(["jersey", "shorts"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setActiveView(v)}
                className={`px-4 py-1 rounded-full text-[10px] font-display font-bold uppercase tracking-widest transition-colors ${
                  activeView === v
                    ? "bg-brand-primary text-white"
                    : "text-brand-muted hover:text-brand-text"
                }`}
              >
                {v === "jersey" ? "Jersey" : "Shorts"}
              </button>
            ))}
          </div>

          {hasModel && mounted ? (
            <Canvas
              camera={{ position: [0, 0, 18], fov: 50 }}
              style={{ width: "100%", height: "100%" }}
              gl={{ preserveDrawingBuffer: true, antialias: true }}
            >
              {/* Lights aimed at the jersey front (+Z side) */}
              <ambientLight intensity={0.9} />
              <directionalLight position={[4, 6, 4]}   intensity={1.4} />
              <directionalLight position={[-4, 3, 4]}  intensity={0.8} />
              <directionalLight position={[0, -2, 4]}  intensity={0.4} />
              <pointLight       position={[0, 4, 3]}   intensity={0.6} />

              <Suspense fallback={null}>
                <JerseyScene
                  colors={colors}
                  artworks={sceneArtworks}
                  activeView={activeView}
                  onSurfaceClick={handleSurfaceClick}
                  isPlacing={isPlacing}
                  onJerseyTopReady={handleJerseyTopReady}
                  onGroupCenters={handleGroupCenters}
                />
              </Suspense>

              <OrbitControls
                ref={orbitRef}
                enabled={!isPlacing}
                enablePan={false}
                minDistance={5}
                maxDistance={40}
                target={[0, 0, 0]}
              />
            </Canvas>
          ) : hasModel ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#f0f0f0]">
              <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            /* No GLB for this sport yet */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#f0f0f0]">
              <p className="text-sm font-display font-bold uppercase tracking-widest text-brand-muted">
                3D Preview Coming Soon
              </p>
              <p className="text-[11px] font-barlow text-brand-muted/60 max-w-[220px] text-center">
                Visual builder for {sport ? sport.charAt(0).toUpperCase() + sport.slice(1) : "this sport"} is in progress.
              </p>
            </div>
          )}

          {/* Hint — sits above the JERSEY/SHORTS tab row when artwork is placed */}
          {sceneArtworks.length > 0 && !isPlacing && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 bg-brand-bg/80 backdrop-blur px-3 py-1.5 rounded-full border border-brand-border pointer-events-none">
              <p className="text-[10px] font-barlow text-brand-muted whitespace-nowrap">
                Drag to rotate · Scroll to zoom · Artwork is locked to garment
              </p>
            </div>
          )}
        </div>

        {/* ── Controls panel ───────────────────────────────────────────────── */}
        <div className="flex-shrink-0 w-full lg:w-[340px] border-t lg:border-t-0 lg:border-l border-brand-border bg-brand-bg flex flex-col lg:max-h-none lg:overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-7 space-y-7">

            {/* ── Zone colours ── */}
            <section className="space-y-4">
              <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted/60">Jersey Colors</p>
              {ZONES.map((zone) => (
                <ColorControl
                  key={zone.key}
                  label={zone.label}
                  value={colors[zone.key]}
                  onChange={(v) => setColors((prev) => ({ ...prev, [zone.key]: v }))}
                />
              ))}
            </section>

            <div className="h-px bg-brand-border" />

            {/* ── Artwork colour palette ── */}
            <section className="space-y-3">
              <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted/60">Artwork Colors</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-display uppercase tracking-widest text-brand-muted mb-1">Fill</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border border-brand-border" />
                    <span className="text-[9px] font-barlow font-mono text-brand-muted">{textColor.toUpperCase()}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-display uppercase tracking-widest text-brand-muted mb-1">Outline</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={outlineColor} onChange={(e) => setOutlineColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border border-brand-border" />
                    <span className="text-[9px] font-barlow font-mono text-brand-muted">{outlineColor.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-brand-border" />

            {/* ── Text artwork ── */}
            <section className="space-y-4">
              <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted/60">Text &amp; Numbers</p>

              {/* Team name */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted">Team Name</label>
                <div className="flex gap-2">
                  <input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. GRACE"
                    maxLength={20}
                    className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-xs font-barlow text-brand-text placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
                  />
                  <button
                    onClick={() => { addTextArtwork("teamName", teamName); setTeamName(""); }}
                    disabled={!teamName.trim()}
                    className="px-3 py-2 rounded-lg bg-brand-primary text-white text-[9px] font-display font-bold uppercase tracking-widest disabled:opacity-40 hover:bg-brand-secondary transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Jersey number */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted">Jersey Number</label>
                <div className="flex gap-2">
                  <input
                    value={jerseyNum}
                    onChange={(e) => setJerseyNum(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    placeholder="e.g. 23"
                    maxLength={3}
                    className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-xs font-barlow text-brand-text placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
                  />
                  <button
                    onClick={() => { addTextArtwork("number", jerseyNum); setJerseyNum(""); }}
                    disabled={!jerseyNum.trim()}
                    className="px-3 py-2 rounded-lg bg-brand-primary text-white text-[9px] font-display font-bold uppercase tracking-widest disabled:opacity-40 hover:bg-brand-secondary transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Custom text */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted">Custom Text</label>
                <div className="flex gap-2">
                  <input
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="e.g. VARSITY"
                    maxLength={24}
                    className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-xs font-barlow text-brand-text placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
                  />
                  <button
                    onClick={() => { addTextArtwork("customText", customText); setCustomText(""); }}
                    disabled={!customText.trim()}
                    className="px-3 py-2 rounded-lg bg-brand-primary text-white text-[9px] font-display font-bold uppercase tracking-widest disabled:opacity-40 hover:bg-brand-secondary transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            </section>

            <div className="h-px bg-brand-border" />

            {/* ── Logo upload ── */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted/60">Team Logo</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[9px] font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors"
                >
                  + Upload
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                multiple
                onChange={handleLogoUpload}
                className="hidden"
              />
              {artworkDrafts.filter((a) => a.type === "logo").length === 0 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 rounded-lg border border-dashed border-brand-border text-xs font-barlow text-brand-muted hover:border-brand-primary hover:text-brand-primary transition-colors"
                >
                  Upload Logo (PNG, SVG, JPG)
                </button>
              )}
              <p className="text-[9px] font-barlow text-brand-muted/60">
                PNG with transparent background works best.
              </p>
            </section>

            {/* ── Placed / pending artwork list ── */}
            {artworkDrafts.length > 0 && (
              <>
                <div className="h-px bg-brand-border" />
                <section className="space-y-3">
                  <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted/60">Artwork</p>
                  {artworkDrafts.map((art) => (
                    <div
                      key={art.id}
                      className={`rounded-xl border px-3 py-3 space-y-2.5 transition-colors ${
                        placingId === art.id
                          ? "border-brand-primary bg-brand-primary/5"
                          : "border-brand-border bg-brand-surface"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {/* Thumbnail for logos */}
                        {art.type === "logo" && art.imageDataUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={art.imageDataUrl} alt="" className="w-7 h-7 object-contain rounded flex-shrink-0" />
                        )}
                        <p className="text-[10px] font-barlow text-brand-text truncate flex-1">{art.label}</p>
                        <span
                          className={`text-[8px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0 ${
                            art.placed ? "bg-green-900/30 text-green-400" : "bg-brand-primary/20 text-brand-primary"
                          }`}
                        >
                          {art.placed ? "Placed" : "Pending"}
                        </span>
                        <button
                          onClick={() => removeArtwork(art.id)}
                          className="text-[9px] font-display uppercase tracking-widest text-brand-muted hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Size slider — only for placed items */}
                      {art.placed && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] font-display uppercase tracking-[0.15em] text-brand-muted/70">Size</label>
                            <span className="text-[9px] font-barlow text-brand-muted/70">{(art.size * 100).toFixed(0)}%</span>
                          </div>
                          <input
                            type="range" min={5} max={60} step={1}
                            value={Math.round(art.size * 100)}
                            onChange={(e) =>
                              setArtworkDrafts((prev) =>
                                prev.map((a) =>
                                  a.id === art.id ? { ...a, size: Number(e.target.value) / 100 } : a
                                )
                              )
                            }
                            className="w-full h-1.5 rounded-full appearance-none bg-brand-border accent-[var(--brand-primary)] cursor-pointer"
                          />
                        </div>
                      )}

                      {/* Re-place button */}
                      <button
                        onClick={() => setPlacingId(art.id)}
                        disabled={placingId === art.id}
                        className="w-full py-1.5 rounded-lg border border-brand-primary/40 text-[9px] font-display font-bold uppercase tracking-widest text-brand-primary hover:bg-brand-primary/10 disabled:opacity-50 transition-colors"
                      >
                        {art.placed ? "Move on Jersey" : "Click Jersey to Place →"}
                      </button>
                    </div>
                  ))}
                </section>
              </>
            )}

          </div>

          {/* ── CTA ── */}
          <div className="border-t border-brand-border px-6 py-5 space-y-3">
            {(() => {
              const colorParams = new URLSearchParams(
                Object.fromEntries(ZONES.map((z) => [z.key + "Color", colors[z.key as keyof ZoneColors]]))
              ).toString();
              const href = orderId
                ? `/brief/${orderId}/builder-review?${colorParams}`
                : `/brief/new?path=builder`;
              return (
                <Link
                  href={href}
                  onClick={() =>
                    saveBriefState({
                      zoneColors: {
                        jerseyTop:         colors.jerseyTop,
                        collar:            colors.collar,
                        jerseyShorts:      colors.jerseyShorts,
                        jerseySidePanels:  colors.jerseySidePanels,
                        jerseyLowerPanels: colors.jerseyLowerPanels,
                        sleevePanels:      colors.sleevePanels,
                        shortSidePanels:   colors.shortSidePanels,
                      },
                      logosToInclude: artworkDrafts
                        .map((a) => a.label)
                        .filter(Boolean)
                        .join(", "),
                    })
                  }
                  className="flex items-center justify-center w-full py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
                >
                  Review My Design →
                </Link>
              );
            })()}
            <p className="text-[9px] font-barlow text-brand-muted/70 text-center leading-relaxed">
              Review your selections before submitting to Grace Studios.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function JerseyBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-bg flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <JerseyBuilderInner />
    </Suspense>
  );
}
