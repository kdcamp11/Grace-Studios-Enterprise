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
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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
  side: "front" | "back";
  imageDataUrl?: string;
  fileName?: string;
  text?: string;
  textColor: string;
  outlineColor: string;
  fontFamily: string;
  placed: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  size: number;
  scaleX: number; // horizontal stretch multiplier (1.0 = natural aspect ratio)
  twist: number; // rotation around surface normal (radians)
}

// ── Per-step constants for controls ──────────────────────────────────────────

// ── Available text fonts ──────────────────────────────────────────────────────
const FONTS = [
  { label: "Classic",    family: "Impact, 'Arial Black', Arial, sans-serif",    google: null },
  { label: "Elite",      family: "'Bebas Neue', Impact, sans-serif",             google: "Bebas+Neue" },
  { label: "Street",     family: "'Anton', Impact, sans-serif",                  google: "Anton" },
  { label: "Retro",      family: "'Graduate', serif",                            google: "Graduate" },
  { label: "Luxury",     family: "'Cinzel', serif",                              google: "Cinzel:wght@700;900" },
  { label: "Minimal",    family: "'Barlow Condensed', Impact, sans-serif",       google: "Barlow+Condensed:wght@800" },
  { label: "Aggressive", family: "'Black Ops One', Impact, sans-serif",          google: "Black+Ops+One" },
] as const;
type FontFamily = (typeof FONTS)[number]["family"];
const DEFAULT_FONT: FontFamily = "Impact, 'Arial Black', Arial, sans-serif";

// ── Texture helpers ───────────────────────────────────────────────────────────

/** Build a CanvasTexture whose canvas is sized to exactly fit the rendered text. */
function buildTextTexture(
  text: string,
  fillColor: string,
  strokeColor: string,
  isNumber: boolean,
  fontFamily: string = DEFAULT_FONT,
): THREE.CanvasTexture {
  const H = 512;
  const fontSize = Math.floor(H * 0.72);
  const fontSpec  = `900 ${fontSize}px ${fontFamily}`;

  // Measure text width on a scratch canvas before committing
  const probe = document.createElement("canvas");
  const pc = probe.getContext("2d")!;
  pc.font = fontSpec;
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
  ctx.font         = fontSpec;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin     = "round";

  ctx.lineWidth   = Math.max(4, fontSize * 0.04);
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

// ── Scene rotation — runs inside R3F's useFrame so it's guaranteed to apply ──

function SceneRotationController({
  groupRef,
  yRef,
  xRef,
}: {
  groupRef: React.RefObject<THREE.Group>;
  yRef: React.MutableRefObject<number>;
  xRef: React.MutableRefObject<number>;
}) {
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    // Smooth lerp towards target angles
    g.rotation.y += (yRef.current - g.rotation.y) * 0.14;
    g.rotation.x += (xRef.current - g.rotation.x) * 0.14;
  });
  return null;
}

// ── Camera auto-fitter — fires inside Canvas when a new mesh is ready ────────
//
// Measures the jersey/shorts bounding box and drives the camera to whatever
// distance makes the garment fill ~75 % of the viewport height (or ~85 % of
// the width — whichever needs a farther camera).  Only activates on narrow
// (mobile) canvases; desktop keeps the manual cameraZ value.

function CameraFitter({
  jerseyRef,
  shortsRef,
  activeView,
  orbitRef,
  tick,
}: {
  jerseyRef: React.RefObject<THREE.Mesh | null>;
  shortsRef: React.RefObject<THREE.Mesh | null>;
  activeView: "jersey" | "shorts";
  orbitRef: React.RefObject<any>;
  tick: number;
}) {
  const { camera, size } = useThree();

  useEffect(() => {
    if (tick === 0) return;
    if (size.width >= 768) return; // desktop: leave camera alone

    const mesh     = activeView === "jersey" ? jerseyRef.current : shortsRef.current;
    const controls = orbitRef.current;
    if (!mesh || !controls) return;

    try {
      mesh.updateWorldMatrix(true, false);
      const box    = new THREE.Box3().setFromObject(mesh);
      const center = new THREE.Vector3();
      const bsize  = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(bsize);

      const cam     = camera as THREE.PerspectiveCamera;
      const vFovRad = (cam.fov * Math.PI) / 180;
      const aspect  = size.width / size.height;
      const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);

      // Camera distance so jersey fills 82 % of height and at most 90 % of width
      const distV = (bsize.y / 2) / (0.82 * Math.tan(vFovRad / 2));
      const distH = (bsize.x / 2) / (0.90 * Math.tan(hFovRad / 2));
      const dist  = Math.max(distV, distH, 4); // never closer than near-clip

      controls.target.copy(center);
      controls.object.position.set(center.x, center.y, dist);
      controls.update();
    } catch { /* no-op: keep current camera */ }
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
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

  // On mobile (portrait), bring the camera closer so the jersey fills the screen
  const cameraZ = mounted && window.innerWidth < 768 ? 9 : 13;

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

  // ── Font selection per text type ──────────────────────────────────────────
  const [teamNameFont,   setTeamNameFont]   = useState<string>(DEFAULT_FONT);
  const [jerseyNumFont,  setJerseyNumFont]  = useState<string>(DEFAULT_FONT);
  const [customTextFont, setCustomTextFont] = useState<string>(DEFAULT_FONT);

  // Load Google Fonts once on mount so canvas has them available
  useEffect(() => {
    const googleFamilies = FONTS.filter((f) => f.google).map((f) => f.google).join("&family=");
    if (!googleFamilies) return;
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${googleFamilies}&display=swap`;
    document.head.appendChild(link);
    link.onload = () => {
      FONTS.forEach((f) => {
        if (f.google) document.fonts.load(`900 64px ${f.family}`).catch(() => {});
      });
    };
  }, []);

  // ── View toggle (JERSEY / SHORTS) + Front / Back side ───────────────────
  const [activeView,   setActiveView]   = useState<"jersey" | "shorts">("jersey");
  const [activeSide,   setActiveSide]   = useState<"front" | "back">("front");
  const [groupCenters, setGroupCenters] = useState<GroupCenters | null>(null);
  const orbitRef           = useRef<any>(null);
  const sceneGroupRef      = useRef<THREE.Group>(null);
  const sceneYRotRef       = useRef(0);
  const sceneXTiltRef      = useRef(0);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const groupCentersRef = useRef<GroupCenters | null>(null);
  const handleGroupCenters = useCallback((centers: GroupCenters) => {
    // Only update state when values actually change — prevents re-render loops
    if (
      groupCentersRef.current?.jerseyTopY === centers.jerseyTopY &&
      groupCentersRef.current?.shortsY === centers.shortsY
    ) return;
    groupCentersRef.current = centers;
    setGroupCenters(centers);
  }, []);


  const flipScene = useCallback(() => {
    sceneYRotRef.current += Math.PI;
    setActiveSide((s) => (s === "front" ? "back" : "front"));
  }, []);

  // Recenter camera when the garment model reports its bounding box centre.
  // On mobile, CameraFitter handles camera placement after GLB load — skip here.
  useEffect(() => {
    if (cameraZ === 9) return; // mobile: CameraFitter takes over
    const controls = orbitRef.current;
    if (!controls || !groupCenters) return;
    const targetY = activeView === "jersey" ? groupCenters.jerseyTopY : groupCenters.shortsY;
    controls.target.set(0, targetY, 0);
    controls.object.position.set(0, targetY, cameraZ);
    controls.update();
  }, [activeView, groupCenters, cameraZ]);

  // On tab switch: reset camera, scene rotation, and return to front side.
  useEffect(() => {
    const controls = orbitRef.current;
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.object.position.set(0, 0, cameraZ);
      controls.update();
    }
    sceneYRotRef.current = 0;
    sceneXTiltRef.current = 0;
    setActiveSide("front");
  }, [activeView, cameraZ]);

  // ── Mesh refs exposed by JerseyScene after load ─────────────────────────
  const jerseyTopMeshRef = useRef<THREE.Mesh | null>(null);
  const shortsMeshRef    = useRef<THREE.Mesh | null>(null);

  // Incrementing this tick triggers CameraFitter to re-fit the camera
  const [cameraFitTick, setCameraFitTick] = useState(0);

  const handleJerseyTopReady = useCallback((mesh: THREE.Mesh | null) => {
    jerseyTopMeshRef.current = mesh;
    if (mesh) setCameraFitTick((t) => t + 1);
  }, []);

  const handleShortsReady = useCallback((mesh: THREE.Mesh | null) => {
    shortsMeshRef.current = mesh;
    if (mesh) setCameraFitTick((t) => t + 1);
  }, []);

  // Restore saved zone colors from the server when opened with an existing orderId
  useEffect(() => {
    if (!orderId) return;
    fetch(`/api/portal/design?order_id=${encodeURIComponent(orderId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { zoneColors?: Record<string, string> | null } | null) => {
        if (!data?.zoneColors || Array.isArray(data.zoneColors)) return;
        setColors((prev) => ({ ...prev, ...data.zoneColors as ZoneColors }));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /**
   * Raycast from the current viewing direction to auto-place artwork on the
   * active garment surface.  Hit and normal are converted to sceneGroup local
   * space so placements are stable regardless of the current flip rotation.
   */
  const autoPlacePosition = useCallback(
    (heightFraction = 0.55): { position: [number, number, number]; rotation: [number, number, number] } => {
      const mesh = activeView === "jersey" ? jerseyTopMeshRef.current : shortsMeshRef.current;
      if (mesh) {
        try {
          mesh.updateWorldMatrix(true, false);
          const box = new THREE.Box3().setFromObject(mesh);
          const bsize = new THREE.Vector3();
          box.getSize(bsize);
          const targetY = box.min.y + bsize.y * heightFraction;
          const centerX = (box.min.x + box.max.x) / 2;

          const raycaster = new THREE.Raycaster();
          raycaster.set(
            new THREE.Vector3(centerX, targetY, 50),
            new THREE.Vector3(0, 0, -1),
          );
          const hits = raycaster.intersectObject(mesh, true);
          if (hits.length > 0) {
            const hit = hits[0];
            const worldNormal = hit.face!.normal.clone()
              .transformDirection(mesh.matrixWorld)
              .normalize();

            // Convert world-space hit → sceneGroup local space so the position
            // is correct regardless of flip rotation (Y = 0 or Y = π)
            const group = sceneGroupRef.current;
            const worldPt = hit.point.clone().addScaledVector(worldNormal, 0.02);
            if (group) {
              group.updateWorldMatrix(true, false);
              const localPt = group.worldToLocal(worldPt.clone());
              const invMat  = group.matrixWorld.clone().invert();
              const localN  = worldNormal.clone().applyMatrix4(invMat).normalize();
              return {
                position: [0, localPt.y, localPt.z],  // X=0 keeps every artwork on the jersey centre line
                rotation: normalToRotation(localN),
              };
            }
            return {
              position: [0, worldPt.y, worldPt.z],
              rotation: normalToRotation(worldNormal),
            };
          }
        } catch { /* fallback below */ }
      }
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
            side: activeSide,
            imageDataUrl: dataUrl,
            fileName: file.name,
            textColor: "#ffffff",
            outlineColor: "#000000",
            fontFamily: DEFAULT_FONT,
            placed: true,
            position,
            rotation,
            size: 1.0,
            scaleX: 1,
            twist: 0,
          },
        ]);
      }
    },
    [activeSide, autoPlacePosition],
  );

  /** Add a text artwork and auto-place it on the jersey front. */
  const addTextArtwork = useCallback(
    async (type: ArtworkDraft["type"], text: string, fontFamily: string) => {
      if (!text.trim()) return;
      const id    = crypto.randomUUID();
      const isNum = type === "number";

      // Ensure the chosen font is available in canvas before drawing
      await document.fonts.load(`900 512px ${fontFamily}`).catch(() => {});

      const texture = buildTextTexture(text.trim(), textColor, outlineColor, isNum, fontFamily);
      textureMapRef.current[id] = texture;

      const label = type === "teamName" ? `Name: ${text}`
                  : type === "number"   ? `# ${text}`
                  : `Text: ${text}`;

      // All text artworks land at the same centre-chest position so they stack on the same axis
      const { position, rotation } = autoPlacePosition(0.55);

      setArtworkDrafts((prev) => [
        ...prev,
        {
          id, type, label, text: text.trim(),
          view: activeView,
          side: activeSide,
          textColor, outlineColor, fontFamily,
          placed: true,
          position,
          rotation,
          size: isNum ? 1.5 : 0.9,
          scaleX: 1,
          twist: 0,
        },
      ]);
    },
    [textColor, outlineColor, activeSide, autoPlacePosition],
  );

  /** Called when user clicks on the jersey while isPlacing is true (Move). */
  const handleSurfaceClick = useCallback(
    (hit: SurfaceHit) => {
      if (!placingId) return;

      // Convert world-space hit → sceneGroup local space (same as autoPlacePosition)
      const group = sceneGroupRef.current;
      const worldPt = hit.point.clone().addScaledVector(hit.normal, 0.02);
      let position: [number, number, number];
      let rotation: [number, number, number];

      if (group) {
        group.updateWorldMatrix(true, false);
        const localPt = group.worldToLocal(worldPt.clone());
        const invMat  = group.matrixWorld.clone().invert();
        const localN  = hit.normal.clone().applyMatrix4(invMat).normalize();
        position = [localPt.x, localPt.y, localPt.z];
        rotation = normalToRotation(localN);
      } else {
        position = [worldPt.x, worldPt.y, worldPt.z];
        rotation = normalToRotation(hit.normal);
      }

      setArtworkDrafts((prev) =>
        prev.map((a) => (a.id === placingId ? { ...a, placed: true, position, rotation } : a)),
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

  /** Snap artwork to a preset position on the active garment. */
  const snapArtwork = useCallback(
    (id: string, preset: "center" | "upper" | "mid" | "lower") => {
      if (preset === "center") {
        setArtworkDrafts((prev) =>
          prev.map((a) =>
            a.id === id && a.position
              ? { ...a, position: [0, a.position[1], a.position[2]] as [number, number, number] }
              : a,
          ),
        );
        return;
      }
      const fraction = preset === "upper" ? 0.72 : preset === "mid" ? 0.55 : 0.38;
      const { position, rotation } = autoPlacePosition(fraction);
      setArtworkDrafts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, position, rotation } : a)),
      );
    },
    [autoPlacePosition],
  );

  /** Rebuild a text artwork's texture with new fill / outline color. */
  const updateArtworkColor = useCallback(
    (id: string, field: "textColor" | "outlineColor", value: string) => {
      setArtworkDrafts((prev) => {
        const art = prev.find((a) => a.id === id);
        if (!art || art.type === "logo" || !art.text) return prev;
        const newTextColor    = field === "textColor"    ? value : art.textColor;
        const newOutlineColor = field === "outlineColor" ? value : art.outlineColor;
        const newTex = buildTextTexture(art.text, newTextColor, newOutlineColor, art.type === "number", art.fontFamily);
        textureMapRef.current[id]?.dispose();
        textureMapRef.current[id] = newTex;
        return prev.map((a) => a.id === id ? { ...a, [field]: value } : a);
      });
    },
    [],
  );

  /**
   * Build the ArtworkItem array that JerseyScene consumes.
   * Only placed items are included.
   */
  const sceneArtworks = useMemo<ArtworkItem[]>(
    () =>
      artworkDrafts
        .filter((a) => a.placed && a.position && a.view === activeView && a.side === activeSide)
        .map((a) => ({
          id:       a.id,
          type:     a.type,
          texture:  textureMapRef.current[a.id] ?? null,
          position: a.position!,
          rotation: a.rotation ?? [0, 0, 0],
          size:     a.size,
          scaleX:   a.scaleX,
          twist:    a.twist,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artworkDrafts, activeView, activeSide],
  );

  // ── Review CTA — skips Team Info for returning clients ───────────────────
  const [isReviewing, setIsReviewing] = useState(false);

  const handleReviewMyDesign = useCallback(async () => {
    setIsReviewing(true);

    // Capture current canvas render for the portal thumbnail
    const canvasEl = canvasContainerRef.current?.querySelector("canvas");
    const imageDataUrl = canvasEl?.toDataURL("image/jpeg", 0.8) ?? null;

    const designState = {
      zoneColors: {
        jerseyTop:         colors.jerseyTop,
        collar:            colors.collar,
        jerseyShorts:      colors.jerseyShorts,
        jerseySidePanels:  colors.jerseySidePanels,
        jerseyLowerPanels: colors.jerseyLowerPanels,
        sleevePanels:      colors.sleevePanels,
        shortSidePanels:   colors.shortSidePanels,
      },
      logosToInclude: artworkDrafts.map((a) => a.label).filter(Boolean).join(", "),
      // Store the data URL in localStorage so builder-review shows the image
      // immediately without waiting for the server upload to complete.
      renderUrl: imageDataUrl,
    };
    saveBriefState(designState);

    if (orderId) {
      // Save render to storage so the portal thumbnail shows immediately
      if (imageDataUrl) {
        fetch(`/api/orders/${orderId}/save-builder-preview`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ imageDataUrl, sport: "Basketball", garmentType: "Basketball Jersey & Shorts" }),
        }).catch(() => {});
      }
      router.push(`/brief/${orderId}/builder-review`);
      return;
    }

    // No orderId yet — try to silently create an order for returning clients
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const profileRes = await fetch("/api/brief/client-profile");
        if (profileRes.ok) {
          const { client } = await profileRes.json() as {
            client: { name: string; contact_name?: string; email: string; city?: string; is_prefill?: boolean } | null;
          };
          if (client && !client.is_prefill) {
            const startRes = await fetch("/api/brief/start", {
              method:  "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
              body:    JSON.stringify({ teamName: client.name, contactName: client.contact_name ?? "", email: client.email, city: client.city ?? "", sport: "Basketball" }),
            });
            if (startRes.ok) {
              const { orderId: newId, clientId } = await startRes.json() as { orderId: string; clientId: string };
              const stateWithMeta = { ...designState, teamName: client.name, contactName: client.contact_name ?? "", email: client.email, city: client.city ?? "", sport: "Basketball", orderId: newId, clientId };
              saveBriefState(stateWithMeta);
              // Save render now that we have an orderId
              if (imageDataUrl) {
                fetch(`/api/orders/${newId}/save-builder-preview`, {
                  method:  "POST",
                  headers: { "Content-Type": "application/json" },
                  body:    JSON.stringify({ imageDataUrl, sport: "Basketball", garmentType: "Basketball Jersey & Shorts" }),
                }).catch(() => {});
              }
              router.push(`/brief/${newId}/builder-review`);
              return;
            }
          }
        }
      }
    } catch { /* fall through to Team Info */ }

    // New client or error: collect info first
    router.push("/brief/new?path=builder-review");
  }, [orderId, colors, artworkDrafts, router]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-dvh lg:h-screen bg-brand-bg flex flex-col overflow-hidden">

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
        <div ref={canvasContainerRef} className="relative flex-1 min-h-0 bg-white">

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

          {/* JERSEY / SHORTS view tabs + Front/Back flip */}
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 flex items-center gap-2">
            <div className="flex gap-1 bg-brand-bg/80 backdrop-blur border border-brand-border rounded-full px-1 py-1">
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
            <button
              style={{ touchAction: "manipulation" }}
              onClick={flipScene}
              className={`flex items-center gap-1 px-3 py-1.5 backdrop-blur border rounded-full text-[10px] font-display font-bold uppercase tracking-widest transition-colors ${
                activeSide === "back"
                  ? "bg-brand-primary text-white border-brand-primary"
                  : "bg-brand-bg/80 border-brand-border text-brand-muted hover:text-brand-primary hover:border-brand-primary"
              }`}
              title="Flip front / back"
            >
              ↔ {activeSide === "front" ? "Front" : "Back"}
            </button>
          </div>

          {hasModel && mounted ? (
            <Canvas
              camera={{ position: [0, 0, cameraZ], fov: 38 }}
              style={{ width: "100%", height: "100%" }}
              gl={{ preserveDrawingBuffer: true, antialias: true }}
            >
              {/* Lights aimed at the jersey front (+Z side) */}
              <ambientLight intensity={0.9} />
              <directionalLight position={[4, 6, 4]}   intensity={1.4} />
              <directionalLight position={[-4, 3, 4]}  intensity={0.8} />
              <directionalLight position={[0, -2, 4]}  intensity={0.4} />
              <pointLight       position={[0, 4, 3]}   intensity={0.6} />

              <SceneRotationController groupRef={sceneGroupRef} yRef={sceneYRotRef} xRef={sceneXTiltRef} />
              <CameraFitter
                jerseyRef={jerseyTopMeshRef}
                shortsRef={shortsMeshRef}
                activeView={activeView}
                orbitRef={orbitRef}
                tick={cameraFitTick}
              />

              <group ref={sceneGroupRef}>
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
              </group>

              <OrbitControls
                ref={orbitRef}
                enabled={!isPlacing}
                enablePan={false}
                minDistance={5}
                maxDistance={28}
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
        <div className="flex-shrink-0 w-full lg:w-[340px] border-t lg:border-t-0 lg:border-l border-brand-border bg-brand-bg flex flex-col max-h-[42dvh] overflow-hidden lg:max-h-none lg:overflow-hidden">
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
                <select
                  value={teamNameFont}
                  onChange={(e) => setTeamNameFont(e.target.value)}
                  className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-1.5 text-[10px] font-barlow text-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
                >
                  {FONTS.map((f) => (
                    <option key={f.family} value={f.family}>{f.label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. GRACE"
                    maxLength={20}
                    className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-xs font-barlow text-brand-text placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
                  />
                  <button
                    onClick={() => { addTextArtwork("teamName", teamName, teamNameFont); setTeamName(""); }}
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
                <select
                  value={jerseyNumFont}
                  onChange={(e) => setJerseyNumFont(e.target.value)}
                  className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-1.5 text-[10px] font-barlow text-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
                >
                  {FONTS.map((f) => (
                    <option key={f.family} value={f.family}>{f.label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    value={jerseyNum}
                    onChange={(e) => setJerseyNum(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    placeholder="e.g. 23"
                    maxLength={3}
                    className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-xs font-barlow text-brand-text placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
                  />
                  <button
                    onClick={() => { addTextArtwork("number", jerseyNum, jerseyNumFont); setJerseyNum(""); }}
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
                <select
                  value={customTextFont}
                  onChange={(e) => setCustomTextFont(e.target.value)}
                  className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-1.5 text-[10px] font-barlow text-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
                >
                  {FONTS.map((f) => (
                    <option key={f.family} value={f.family}>{f.label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="e.g. VARSITY"
                    maxLength={24}
                    className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-xs font-barlow text-brand-text placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
                  />
                  <button
                    onClick={() => { addTextArtwork("customText", customText, customTextFont); setCustomText(""); }}
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

            {/* ── Placed / pending artwork list (view + side specific) ── */}
            {artworkDrafts.filter((a) => a.view === activeView && a.side === activeSide).length > 0 && (
              <>
                <div className="h-px bg-brand-border" />
                <section className="space-y-3">
                  <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted/60">
                    {activeView === "jersey" ? "Jersey" : "Shorts"} {activeSide === "front" ? "Front" : "Back"} Artwork
                  </p>
                  {artworkDrafts.filter((a) => a.view === activeView && a.side === activeSide).map((art) => (
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

                      {art.placed && (
                        <div className="space-y-3">

                          {/* Snap alignment — shown first so it's the primary quick action */}
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-display uppercase tracking-[0.15em] text-brand-muted/70">Snap To</p>
                            <div className="grid grid-cols-4 gap-1">
                              {([
                                { id: "center", label: "⊕ Ctr",  title: "Snap to horizontal centre" },
                                { id: "upper",  label: "↑ Top",  title: "Snap to upper chest" },
                                { id: "mid",    label: "· Mid",  title: "Snap to mid chest" },
                                { id: "lower",  label: "↓ Bot",  title: "Snap to lower body" },
                              ] as const).map((p) => (
                                <button
                                  key={p.id}
                                  title={p.title}
                                  onClick={() => snapArtwork(art.id, p.id)}
                                  className="py-1.5 rounded-lg border border-brand-border bg-brand-surface text-[8px] font-display uppercase tracking-wider text-brand-muted hover:border-brand-primary hover:text-brand-primary transition-colors"
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Fine-tune sliders */}
                          <div className="h-px bg-brand-border/50" />

                          {/* Left / Right */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-display uppercase tracking-[0.15em] text-brand-muted/70">Left / Right</label>
                              <span className="text-[9px] font-barlow text-brand-muted/70">
                                {((art.position?.[0] ?? 0) >= 0 ? "+" : "") + (art.position?.[0] ?? 0).toFixed(2)}
                              </span>
                            </div>
                            <input
                              type="range" min={-200} max={200} step={5}
                              value={Math.round((art.position?.[0] ?? 0) * 100)}
                              onChange={(e) =>
                                setArtworkDrafts((prev) =>
                                  prev.map((a) =>
                                    a.id === art.id && a.position
                                      ? { ...a, position: [Number(e.target.value) / 100, a.position[1], a.position[2]] as [number, number, number] }
                                      : a,
                                  ),
                                )
                              }
                              className="w-full h-1.5 rounded-full appearance-none bg-brand-border accent-[var(--brand-primary)] cursor-pointer"
                            />
                          </div>

                          {/* Up / Down */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-display uppercase tracking-[0.15em] text-brand-muted/70">Up / Down</label>
                              <span className="text-[9px] font-barlow text-brand-muted/70">
                                {((art.position?.[1] ?? 0) >= 0 ? "+" : "") + (art.position?.[1] ?? 0).toFixed(2)}
                              </span>
                            </div>
                            <input
                              type="range" min={-200} max={200} step={5}
                              value={Math.round((art.position?.[1] ?? 0) * 100)}
                              onChange={(e) =>
                                setArtworkDrafts((prev) =>
                                  prev.map((a) =>
                                    a.id === art.id && a.position
                                      ? { ...a, position: [a.position[0], Number(e.target.value) / 100, a.position[2]] as [number, number, number] }
                                      : a,
                                  ),
                                )
                              }
                              className="w-full h-1.5 rounded-full appearance-none bg-brand-border accent-[var(--brand-primary)] cursor-pointer"
                            />
                          </div>

                          {/* Rotation */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-display uppercase tracking-[0.15em] text-brand-muted/70">Rotate</label>
                              <span className="text-[9px] font-barlow text-brand-muted/70">{Math.round((art.twist * 180) / Math.PI)}°</span>
                            </div>
                            <input
                              type="range" min={-180} max={180} step={5}
                              value={Math.round((art.twist * 180) / Math.PI)}
                              onChange={(e) =>
                                setArtworkDrafts((prev) =>
                                  prev.map((a) =>
                                    a.id === art.id
                                      ? { ...a, twist: (Number(e.target.value) * Math.PI) / 180 }
                                      : a,
                                  ),
                                )
                              }
                              className="w-full h-1.5 rounded-full appearance-none bg-brand-border accent-[var(--brand-primary)] cursor-pointer"
                            />
                          </div>

                          {/* Width */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-display uppercase tracking-[0.15em] text-brand-muted/70">Width</label>
                              <span className="text-[9px] font-barlow text-brand-muted/70">{((art.scaleX) * 100).toFixed(0)}%</span>
                            </div>
                            <input
                              type="range" min={25} max={400} step={5}
                              value={Math.round(art.scaleX * 100)}
                              onChange={(e) =>
                                setArtworkDrafts((prev) =>
                                  prev.map((a) =>
                                    a.id === art.id ? { ...a, scaleX: Number(e.target.value) / 100 } : a,
                                  ),
                                )
                              }
                              className="w-full h-1.5 rounded-full appearance-none bg-brand-border accent-[var(--brand-primary)] cursor-pointer"
                            />
                          </div>

                          {/* Height */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-display uppercase tracking-[0.15em] text-brand-muted/70">Height</label>
                              <span className="text-[9px] font-barlow text-brand-muted/70">{(art.size * 100).toFixed(0)}%</span>
                            </div>
                            <input
                              type="range" min={10} max={300} step={5}
                              value={Math.round(art.size * 100)}
                              onChange={(e) =>
                                setArtworkDrafts((prev) =>
                                  prev.map((a) =>
                                    a.id === art.id ? { ...a, size: Number(e.target.value) / 100 } : a,
                                  ),
                                )
                              }
                              className="w-full h-1.5 rounded-full appearance-none bg-brand-border accent-[var(--brand-primary)] cursor-pointer"
                            />
                          </div>

                          {/* Per-artwork color editing (text artworks only) */}
                          {art.type !== "logo" && (
                            <>
                              <div className="h-px bg-brand-border/50" />
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[9px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Fill</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      value={art.textColor}
                                      onChange={(e) => updateArtworkColor(art.id, "textColor", e.target.value)}
                                      className="w-8 h-8 rounded cursor-pointer border border-brand-border bg-transparent"
                                    />
                                    <span className="text-[9px] font-barlow font-mono text-brand-muted">{art.textColor.toUpperCase()}</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[9px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Outline</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      value={art.outlineColor}
                                      onChange={(e) => updateArtworkColor(art.id, "outlineColor", e.target.value)}
                                      className="w-8 h-8 rounded cursor-pointer border border-brand-border bg-transparent"
                                    />
                                    <span className="text-[9px] font-barlow font-mono text-brand-muted">{art.outlineColor.toUpperCase()}</span>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}

                        </div>
                      )}

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
            <button
              onClick={handleReviewMyDesign}
              disabled={isReviewing}
              className="flex items-center justify-center w-full py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isReviewing ? "Preparing…" : "Review My Design →"}
            </button>
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
