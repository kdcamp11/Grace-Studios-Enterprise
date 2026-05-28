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
import { OrbitControls } from "@react-three/drei";
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

// ── Zone definitions split by tab ─────────────────────────────────────────────

const JERSEY_ZONES = [
  { key: "jerseyTop",          label: "Jersey Body"        },
  { key: "collar",             label: "Collar & Trim"      },
  { key: "jerseySidePanels",   label: "Side Panels"        },
  { key: "jerseyLowerPanels",  label: "Lower Panels"       },
  { key: "sleevePanels",       label: "Sleeve Panels"      },
] as const;

const SHORTS_ZONES = [
  { key: "jerseyShorts",    label: "Shorts Body"  },
  { key: "shortSidePanels", label: "Trim & Detail" },
] as const;

const ZONES = [...JERSEY_ZONES, ...SHORTS_ZONES] as const;

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
  label: string;
  view: "jersey" | "shorts";
  imageDataUrl?: string;
  fileName?: string;
  text?: string;
  textColor: string;
  outlineColor: string;
  placed: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  size: number;
  twist: number; // rotation around surface normal (radians)
}

// ── Per-step constants for controls ──────────────────────────────────────────
const PAN_STEP   = 0.5;           // world units per pan click
const NUDGE      = 0.15;          // world units per artwork nudge click
const TWIST_STEP = Math.PI / 12;  // 15° per rotation click

// ── Texture helpers ───────────────────────────────────────────────────────────

/** Build a CanvasTexture whose canvas is sized to exactly fit the rendered text. */
function buildTextTexture(
  text: string,
  fillColor: string,
  strokeColor: string,
  isNumber: boolean,
): THREE.CanvasTexture {
  const H = 256;
  const fontSize = Math.floor(H * 0.72);

  // Measure text width on a scratch canvas before committing
  const probe = document.createElement("canvas");
  const pc = probe.getContext("2d")!;
  pc.font = `900 ${fontSize}px Impact, "Arial Black", Arial, sans-serif`;
  const measured = pc.measureText(text).width;

  // Canvas width = measured width + side padding so no glyph is clipped
  const pad = fontSize * 0.18;
  const W = Math.ceil(
    isNumber ? Math.max(measured + pad * 2, H * 0.7) : measured + pad * 2,
  );

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.font         = `900 ${fontSize}px Impact, "Arial Black", Arial, sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin     = "round";

  ctx.lineWidth   = Math.max(8, fontSize * 0.12);
  ctx.strokeStyle = strokeColor;
  ctx.strokeText(text, W / 2, H / 2);

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
  const [autoRotate,   setAutoRotate]   = useState(false);
  const orbitRef = useRef<any>(null);

  const handleGroupCenters = useCallback((centers: GroupCenters) => {
    setGroupCenters(centers);
  }, []);

  /** Slide the jersey in the viewport by shifting camera + target together.
   *  Negate dx/dy so button intent matches the visual: pressing RIGHT → jersey goes right.
   *  Do NOT call ctrl.update() — R3F's useFrame calls it every frame and calling it
   *  here would flush any pending sphericalDelta, causing an unintended rotation. */
  const panCamera = useCallback((dx: number, dy: number) => {
    const ctrl = orbitRef.current;
    if (!ctrl) return;
    ctrl.target.x          -= dx;
    ctrl.target.y          -= dy;
    ctrl.object.position.x -= dx;
    ctrl.object.position.y -= dy;
  }, []);

  const zoomCamera = useCallback((factor: number) => {
    const ctrl = orbitRef.current;
    if (!ctrl) return;
    const offset = new THREE.Vector3().subVectors(ctrl.object.position, ctrl.target);
    const dist = Math.max(5, Math.min(28, offset.length() * factor));
    ctrl.object.position.copy(ctrl.target).add(offset.normalize().multiplyScalar(dist));
    ctrl.update();
  }, []);

  // Reset camera to a clean front-facing view centred on the active garment
  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls || !groupCenters) return;
    const targetY = activeView === "jersey" ? groupCenters.jerseyTopY : groupCenters.shortsY;
    controls.target.set(0, targetY, 0);
    controls.object.position.set(0, targetY, 13);
    controls.update();
  }, [activeView, groupCenters]);

  // ── Mesh refs exposed by JerseyScene after load ─────────────────────────
  const jerseyTopMeshRef = useRef<THREE.Mesh | null>(null);
  const shortsMeshRef    = useRef<THREE.Mesh | null>(null);

  const handleJerseyTopReady = useCallback((mesh: THREE.Mesh | null) => {
    jerseyTopMeshRef.current = mesh;
  }, []);

  const handleShortsReady = useCallback((mesh: THREE.Mesh | null) => {
    shortsMeshRef.current = mesh;
  }, []);

  /**
   * Raycast from in front of the garment to place artwork.
   * `heightFraction` is 0–1 from bottom to top of the garment bounding box.
   * This is scale-independent so it works regardless of model units.
   */
  const autoPlacePosition = useCallback(
    (heightFraction = 0.55): { position: [number, number, number]; rotation: [number, number, number] } => {
      const mesh = activeView === "jersey" ? jerseyTopMeshRef.current : shortsMeshRef.current;
      if (mesh) {
        try {
          mesh.updateWorldMatrix(true, false);
          const box = new THREE.Box3().setFromObject(mesh);
          const size = new THREE.Vector3();
          box.getSize(size);
          // Pick Y by fraction of the garment height
          const targetY = box.min.y + size.y * heightFraction;
          const centerX = (box.min.x + box.max.x) / 2;

          const raycaster = new THREE.Raycaster();
          raycaster.set(
            new THREE.Vector3(centerX, targetY, 50),
            new THREE.Vector3(0, 0, -1),
          );
          const hits = raycaster.intersectObject(mesh, true);
          if (hits.length > 0) {
            const hit = hits[0];
            const normal = hit.face!.normal.clone()
              .transformDirection(mesh.matrixWorld)
              .normalize();
            return {
              position: [
                hit.point.x + normal.x * 0.02,
                hit.point.y + normal.y * 0.02,
                hit.point.z + normal.z * 0.02,
              ],
              rotation: normalToRotation(normal),
            };
          }
        } catch { /* fallback below */ }
      }
      // Fallback: use 0,0 world origin with a slight Z push — garment is centered at origin
      return { position: [0, 0, 0.5], rotation: [0, 0, 0] };
    },
    [activeView],
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
        const { position, rotation } = autoPlacePosition(0.68); // upper chest
        setArtworkDrafts((prev) => [
          ...prev,
          {
            id,
            type: "logo",
            label: file.name,
            view: activeView,
            imageDataUrl: dataUrl,
            fileName: file.name,
            textColor: "#ffffff",
            outlineColor: "#000000",
            placed: true,
            position,
            rotation,
            size: 0.8,
            twist: 0,
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

      // Fraction of garment height (0=bottom, 1=top): name near top, number mid, custom lower
      const fraction = type === "teamName" ? 0.72 : type === "number" ? 0.55 : 0.38;
      const { position, rotation } = autoPlacePosition(fraction);

      setArtworkDrafts((prev) => [
        ...prev,
        {
          id, type, label, text: text.trim(),
          view: activeView,
          textColor, outlineColor,
          placed: true,
          position,
          rotation,
          size: isNum ? 1.2 : 0.7,
          twist: 0,
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
      // Nudge 2 cm along the surface normal so the plane sits on the material
      setArtworkDrafts((prev) =>
        prev.map((a) =>
          a.id === placingId
            ? {
                ...a,
                placed:   true,
                position: [
                  hit.point.x + hit.normal.x * 0.02,
                  hit.point.y + hit.normal.y * 0.02,
                  hit.point.z + hit.normal.z * 0.02,
                ] as [number, number, number],
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

  const nudgeArtwork = useCallback((id: string, dx: number, dy: number) => {
    setArtworkDrafts((prev) =>
      prev.map((a) =>
        a.id === id && a.position
          ? { ...a, position: [a.position[0] + dx, a.position[1] + dy, a.position[2]] as [number, number, number] }
          : a,
      ),
    );
  }, []);

  const twistArtwork = useCallback((id: string, delta: number) => {
    setArtworkDrafts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, twist: a.twist + delta } : a)),
    );
  }, []);

  const scaleArtwork = useCallback((id: string, factor: number) => {
    setArtworkDrafts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, size: Math.max(0.1, Math.min(3, a.size * factor)) } : a,
      ),
    );
  }, []);

  /**
   * Build the ArtworkItem array that JerseyScene consumes.
   * Only placed items are included.
   */
  const sceneArtworks = useMemo<ArtworkItem[]>(
    () =>
      artworkDrafts
        .filter((a) => a.placed && a.position && a.view === activeView)
        .map((a) => ({
          id:       a.id,
          type:     a.type,
          texture:  textureMapRef.current[a.id] ?? null,
          position: a.position!,
          rotation: a.rotation ?? [0, 0, 0],
          size:     a.size,
          twist:    a.twist,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artworkDrafts, activeView],
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
        <div className="relative flex-1 min-h-0 bg-white" style={{ minHeight: "clamp(380px, 70vh, 999px)" }}>

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

          {/* ── Camera controls ── */}
          {!isPlacing && (() => {
            const btn = "w-9 h-9 flex items-center justify-center rounded-lg bg-brand-bg/90 border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-primary text-base font-bold transition-colors select-none";
            return (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1.5 bg-brand-bg/90 backdrop-blur border border-brand-border rounded-xl p-2.5 shadow-lg">
                <p className="text-[7px] font-display uppercase tracking-widest text-brand-muted/60">Position</p>
                <button className={btn} style={{ touchAction: "manipulation" }} onClick={() => panCamera(0,  PAN_STEP)} title="Move up">↑</button>
                <div className="flex gap-1.5">
                  <button className={btn} style={{ touchAction: "manipulation" }} onClick={() => panCamera(-PAN_STEP, 0)} title="Move left">←</button>
                  <button className={btn} style={{ touchAction: "manipulation" }} onClick={() => panCamera( PAN_STEP, 0)} title="Move right">→</button>
                </div>
                <button className={btn} style={{ touchAction: "manipulation" }} onClick={() => panCamera(0, -PAN_STEP)} title="Move down">↓</button>
                <div className="w-full h-px bg-brand-border my-0.5" />
                <p className="text-[7px] font-display uppercase tracking-widest text-brand-muted/60">Zoom</p>
                <div className="flex gap-1.5">
                  <button className={btn} style={{ touchAction: "manipulation" }} onClick={() => zoomCamera(0.85)} title="Zoom in">+</button>
                  <button className={btn} style={{ touchAction: "manipulation" }} onClick={() => zoomCamera(1.18)} title="Zoom out">−</button>
                </div>
                <button
                  className={`${btn} w-full mt-0.5 ${autoRotate ? "!text-brand-primary !border-brand-primary bg-brand-primary/10" : ""}`}
                  style={{ touchAction: "manipulation" }}
                  onClick={() => setAutoRotate((r) => !r)}
                  title="Toggle auto-rotate"
                >
                  ↺
                </button>
              </div>
            );
          })()}

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
              camera={{ position: [0, 0, 13], fov: 38 }}
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
                  separateGlbs={true}
                  onSurfaceClick={handleSurfaceClick}
                  isPlacing={isPlacing}
                  onJerseyTopReady={handleJerseyTopReady}
                  onShortsReady={handleShortsReady}
                  onGroupCenters={handleGroupCenters}
                />
              </Suspense>

              <OrbitControls
                ref={orbitRef}
                enabled={!isPlacing}
                enablePan={false}
                minDistance={5}
                maxDistance={28}
                target={[0, 0, 0]}
                autoRotate={autoRotate}
                autoRotateSpeed={2}
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

            {/* ── Zone colours (tab-specific) ── */}
            <section className="space-y-4">
              <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted/60">
                {activeView === "jersey" ? "Jersey Colors" : "Shorts Colors"}
              </p>
              {(activeView === "jersey" ? JERSEY_ZONES : SHORTS_ZONES).map((zone) => (
                <ColorControl
                  key={zone.key}
                  label={zone.label}
                  value={colors[zone.key as keyof ZoneColors]}
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

            {/* ── Placed / pending artwork list (tab-specific) ── */}
            {artworkDrafts.filter((a) => a.view === activeView).length > 0 && (
              <>
                <div className="h-px bg-brand-border" />
                <section className="space-y-3">
                  <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted/60">Artwork</p>
                  {artworkDrafts.filter((a) => a.view === activeView).map((art) => (
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

                      {art.placed && (() => {
                        const cb = "w-9 h-9 flex items-center justify-center rounded-lg bg-brand-surface border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-primary text-base font-bold transition-colors select-none";
                        return (
                          <>
                            {/* Position + Rotate row */}
                            <div className="flex items-start gap-3">
                              {/* D-pad */}
                              <div className="flex flex-col items-center gap-1">
                                <p className="text-[8px] font-display uppercase tracking-wider text-brand-muted/60 mb-0.5">Position</p>
                                <button className={cb} style={{ touchAction: "manipulation" }} onClick={() => nudgeArtwork(art.id, 0, NUDGE)}>↑</button>
                                <div className="flex gap-1">
                                  <button className={cb} style={{ touchAction: "manipulation" }} onClick={() => nudgeArtwork(art.id, -NUDGE, 0)}>←</button>
                                  <button className={cb} style={{ touchAction: "manipulation" }} onClick={() => nudgeArtwork(art.id, NUDGE, 0)}>→</button>
                                </div>
                                <button className={cb} style={{ touchAction: "manipulation" }} onClick={() => nudgeArtwork(art.id, 0, -NUDGE)}>↓</button>
                              </div>

                              {/* Rotate + Scale */}
                              <div className="flex flex-col gap-2 flex-1">
                                <div>
                                  <p className="text-[8px] font-display uppercase tracking-wider text-brand-muted/60 mb-1">Rotate</p>
                                  <div className="flex gap-1">
                                    <button className={`${cb} flex-1`} style={{ touchAction: "manipulation" }} onClick={() => twistArtwork(art.id, -TWIST_STEP)}>↺</button>
                                    <button className={`${cb} flex-1`} style={{ touchAction: "manipulation" }} onClick={() => twistArtwork(art.id,  TWIST_STEP)}>↻</button>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[8px] font-display uppercase tracking-wider text-brand-muted/60 mb-1">Scale</p>
                                  <div className="flex gap-1">
                                    <button className={`${cb} flex-1`} style={{ touchAction: "manipulation" }} onClick={() => scaleArtwork(art.id, 0.85)}>−</button>
                                    <button className={`${cb} flex-1`} style={{ touchAction: "manipulation" }} onClick={() => scaleArtwork(art.id, 1.18)}>+</button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Size fine-tune slider */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[9px] font-display uppercase tracking-[0.15em] text-brand-muted/70">Size</label>
                                <span className="text-[9px] font-barlow text-brand-muted/70">{(art.size * 100).toFixed(0)}%</span>
                              </div>
                              <input
                                type="range" min={10} max={300} step={5}
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
                          </>
                        );
                      })()}

                      {/* Click-to-place button */}
                      <button
                        onClick={() => setPlacingId(art.id)}
                        disabled={placingId === art.id}
                        className="w-full py-1.5 rounded-lg border border-brand-primary/40 text-[9px] font-display font-bold uppercase tracking-widest text-brand-primary hover:bg-brand-primary/10 disabled:opacity-50 transition-colors"
                      >
                        {art.placed
                          ? `Click to Re-place on ${activeView === "jersey" ? "Jersey" : "Shorts"}`
                          : `Click ${activeView === "jersey" ? "Jersey" : "Shorts"} to Place →`}
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
