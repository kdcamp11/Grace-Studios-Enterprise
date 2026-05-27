"use client";

/**
 * JerseyScene — React Three Fiber scene that:
 *  1. Loads /public/Jersey.glb via useGLTF
 *  2. Applies per-zone colors by material name (not index-split)
 *  3. Renders logos, team names, numbers, and custom text as THREE.js
 *     Decal geometry projected onto the jersey mesh surface — they stay
 *     locked to the garment when rotating / zooming.
 *  4. Emits onClick hits so the page can trigger "click to place" flow.
 *
 * GLB material ↔ zone map (verified from public/Jersey.glb):
 *   jersey_top          → main jersey body (primary placement surface)
 *   jersey_shorts       → shorts body
 *   short_side_panels   → shorts side panels
 *   jersey_side_panels  → jersey side panels
 *   collar              → collar ribbing
 *   jersey_lower_panels → lower side panels
 *   sleeve_panels       → sleeve panels
 */

import { useEffect, useRef, useMemo } from "react";
import { useGLTF, Decal } from "@react-three/drei";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ZoneColors {
  jerseyTop: string;
  collar: string;
  jerseyShorts: string;
  jerseySidePanels: string;
  jerseyLowerPanels: string;
  sleevePanels: string;
  shortSidePanels: string;
}

/** A piece of artwork (logo, text, number) placed on the jersey surface. */
export interface ArtworkItem {
  id: string;
  texture: THREE.Texture | null;
  /** World-space position of the decal centre */
  position: [number, number, number];
  /** World-space Euler rotation that aligns +Z with the surface normal */
  rotation: [number, number, number];
  /** World-space scale (width ≈ height ≈ depth) */
  size: number;
  /** The specific mesh the decal projects onto */
  mesh: THREE.Mesh | null;
}

export interface SurfaceHit {
  point: THREE.Vector3;
  /** Surface normal in WORLD space */
  normal: THREE.Vector3;
  mesh: THREE.Mesh;
  materialName: string;
}

interface Props {
  colors: ZoneColors;
  artworks: ArtworkItem[];
  /** Called when the model is clicked and `isPlacing` is true */
  onSurfaceClick?: (hit: SurfaceHit) => void;
  /** Cursor changes to crosshair; clicks trigger onSurfaceClick */
  isPlacing?: boolean;
}

// ── Material name → zone key map ──────────────────────────────────────────────

const MAT_TO_ZONE: Record<string, keyof ZoneColors> = {
  jersey_top:         "jerseyTop",
  collar:             "collar",
  jersey_shorts:      "jerseyShorts",
  jersey_side_panels: "jerseySidePanels",
  jersey_lower_panels:"jerseyLowerPanels",
  sleeve_panels:      "sleevePanels",
  short_side_panels:  "shortSidePanels",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function JerseyScene({
  colors,
  artworks,
  onSurfaceClick,
  isPlacing = false,
}: Props) {
  const { scene } = useGLTF("/Jersey.glb");

  // Per-zone material refs (cloned instances we own)
  const matByZone = useRef<Partial<Record<keyof ZoneColors, THREE.MeshStandardMaterial>>>({});
  // Mesh refs keyed by material name — used as the `mesh` prop on <Decal>
  const meshRefByMat = useRef<Record<string, React.MutableRefObject<THREE.Mesh>>>({});

  // ── Clone materials and map by name once on load ──────────────────────────
  useEffect(() => {
    const newMats: typeof matByZone.current = {};
    const newMeshRefs: typeof meshRefByMat.current = {};

    scene.traverse((child) => {
      const node = child as THREE.Mesh;
      if (!node.isMesh) return;

      const rawMats = Array.isArray(node.material)
        ? node.material
        : [node.material];

      const cloned = rawMats.map((m) => {
        const mat = (m as THREE.MeshStandardMaterial).clone();

        const zoneKey = MAT_TO_ZONE[mat.name];
        if (zoneKey) {
          newMats[zoneKey] = mat;
          // Store a stable ref object pointing to this mesh
          newMeshRefs[mat.name] = { current: node } as React.MutableRefObject<THREE.Mesh>;
        }

        return mat;
      });

      node.material = Array.isArray(node.material) ? cloned : cloned[0];
    });

    matByZone.current   = newMats;
    meshRefByMat.current = newMeshRefs;
  }, [scene]);

  // ── Apply zone colors whenever they change ────────────────────────────────
  useEffect(() => {
    (Object.entries(colors) as [keyof ZoneColors, string][]).forEach(([zone, hex]) => {
      const mat = matByZone.current[zone];
      if (!mat) return;
      mat.color.set(hex);
      mat.needsUpdate = true;
    });
  }, [colors]);

  // ── Click handler for "place artwork" mode ────────────────────────────────
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isPlacing || !onSurfaceClick) return;
    e.stopPropagation();

    const mesh   = e.object as THREE.Mesh;
    const point  = e.point.clone();
    const normal = e.face?.normal.clone() ?? new THREE.Vector3(0, 0, 1);
    // Transform object-space normal → world space
    normal.transformDirection(mesh.matrixWorld).normalize();

    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    onSurfaceClick({
      point,
      normal,
      mesh,
      materialName: (mat as THREE.MeshStandardMaterial)?.name ?? "",
    });
  };

  return (
    <group>
      {/* Jersey GLB — cursor changes when placing artwork */}
      <primitive
        object={scene}
        scale={0.9}
        position={[0, -0.6, 0]}
        rotation={[0, Math.PI, 0]}
        onClick={handleClick}
        onPointerOver={isPlacing ? () => { document.body.style.cursor = "crosshair"; } : undefined}
        onPointerOut={isPlacing  ? () => { document.body.style.cursor = "auto"; }      : undefined}
      />

      {/* Decals — one per placed artwork item */}
      {artworks.map((art) => {
        if (!art.mesh || !art.texture) return null;
        const meshRef = { current: art.mesh } as React.MutableRefObject<THREE.Mesh>;

        return (
          <Decal
            key={art.id}
            mesh={meshRef}
            position={art.position}
            rotation={art.rotation}
            scale={art.size}
            map={art.texture}
            polygonOffsetFactor={-10}
            depthWrite={false}
          />
        );
      })}
    </group>
  );
}

useGLTF.preload("/Jersey.glb");
