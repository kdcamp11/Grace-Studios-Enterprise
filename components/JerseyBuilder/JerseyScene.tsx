"use client";

/**
 * JerseyScene — React Three Fiber scene that:
 *  1. Loads /public/Jersey.glb via useGLTF
 *  2. Rotates the jersey-top node group 180° on Y so it faces the same
 *     direction as the shorts, then centres the whole model at origin.
 *  3. Applies per-zone colours by material name (MAT_TO_ZONE dict).
 *  4. Renders artwork (logos, text, numbers) as double-sided plane meshes
 *     placed on the jersey surface — stays locked to the garment.
 *  5. Exposes the jersey_top mesh via onJerseyTopReady so the page can
 *     auto-place artwork without a manual click.
 *
 * GLB material ↔ zone map (verified from public/Jersey.glb):
 *   jersey_top          → main jersey body
 *   jersey_shorts       → shorts body
 *   short_side_panels   → shorts side panels
 *   jersey_side_panels  → jersey side panels
 *   collar              → collar ribbing
 *   jersey_lower_panels → lower side panels
 *   sleeve_panels       → sleeve panels
 */

import { useEffect, useRef, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
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

export interface ArtworkItem {
  id: string;
  type: "logo" | "teamName" | "number" | "customText";
  texture: THREE.Texture | null;
  position: [number, number, number];
  rotation: [number, number, number];
  size: number;
}

export interface SurfaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  mesh: THREE.Mesh;
  materialName: string;
}

interface Props {
  colors: ZoneColors;
  artworks: ArtworkItem[];
  onSurfaceClick?: (hit: SurfaceHit) => void;
  isPlacing?: boolean;
  /** Fired once after the GLB loads — passes the jersey_top mesh so the
   *  parent page can auto-place artwork via raycasting. */
  onJerseyTopReady?: (mesh: THREE.Mesh | null) => void;
}

// ── Material name → zone key ──────────────────────────────────────────────────

const MAT_TO_ZONE: Record<string, keyof ZoneColors> = {
  jersey_top:          "jerseyTop",
  collar:              "collar",
  jersey_shorts:       "jerseyShorts",
  jersey_side_panels:  "jerseySidePanels",
  jersey_lower_panels: "jerseyLowerPanels",
  sleeve_panels:       "sleevePanels",
  short_side_panels:   "shortSidePanels",
};

// Jersey-top nodes (from GLB inspection) whose front faces +Z — need
// rotating 180° on Y so the front matches the shorts (which face –Z).
const JERSEY_TOP_NODE_NAMES = new Set([
  "Jersey Top Stitching",
  "Jersey Tiop Side Panels",  // typo in the GLB export
  "Collar",
  "Jersey Top Lower Side Panels",
  "Sleeve Panels",
]);

// ── Component ─────────────────────────────────────────────────────────────────

export default function JerseyScene({
  colors,
  artworks,
  onSurfaceClick,
  isPlacing = false,
  onJerseyTopReady,
}: Props) {
  const { scene } = useGLTF("/Jersey.glb");

  // ── Fix orientation + centre at origin ───────────────────────────────────
  // The jersey-top nodes face +Z; the shorts face –Z.  Rotate jersey-top
  // nodes to –Z first so both halves face the same way, then compute the
  // centroid bounding box so everything sits at world origin.
  const centerOffset = useMemo(() => {
    // Step 1: align jersey-top to face –Z (idempotent – sets absolute value)
    scene.traverse((child) => {
      if (JERSEY_TOP_NODE_NAMES.has(child.name)) {
        child.rotation.y = Math.PI;
      }
    });

    // Step 2: centre the whole assembled model at origin
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    return [-center.x, -center.y, -center.z] as [number, number, number];
  }, [scene]);

  // Per-zone material refs (cloned instances we own)
  const matByZone = useRef<Partial<Record<keyof ZoneColors, THREE.MeshStandardMaterial>>>({});

  // ── Clone materials and expose jersey_top mesh ────────────────────────────
  useEffect(() => {
    const newMats: typeof matByZone.current = {};
    let jerseyTopMesh: THREE.Mesh | null = null;

    scene.traverse((child) => {
      const node = child as THREE.Mesh;
      if (!node.isMesh) return;

      const rawMats = Array.isArray(node.material) ? node.material : [node.material];

      const cloned = rawMats.map((m) => {
        const mat = (m as THREE.MeshStandardMaterial).clone();
        const zoneKey = MAT_TO_ZONE[mat.name];
        if (zoneKey) newMats[zoneKey] = mat;
        if (mat.name === "jersey_top") jerseyTopMesh = node;
        return mat;
      });

      node.material = Array.isArray(node.material) ? cloned : cloned[0];
    });

    matByZone.current = newMats;
    onJerseyTopReady?.(jerseyTopMesh);
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply zone colours ────────────────────────────────────────────────────
  useEffect(() => {
    (Object.entries(colors) as [keyof ZoneColors, string][]).forEach(([zone, hex]) => {
      const mat = matByZone.current[zone];
      if (!mat) return;
      mat.color.set(hex);
      mat.needsUpdate = true;
    });
  }, [colors]);

  // ── Surface-click for manual repositioning ───────────────────────────────
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isPlacing || !onSurfaceClick) return;
    e.stopPropagation();

    const mesh   = e.object as THREE.Mesh;
    const point  = e.point.clone();
    const normal = e.face?.normal.clone() ?? new THREE.Vector3(0, 0, -1);
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
      {/* Jersey GLB */}
      <primitive
        object={scene}
        position={centerOffset}
        onClick={handleClick}
        onPointerOver={isPlacing ? () => { document.body.style.cursor = "crosshair"; } : undefined}
        onPointerOut={isPlacing  ? () => { document.body.style.cursor = "auto"; }      : undefined}
      />

      {/* Artwork — double-sided plane meshes, locked to world space alongside
          the jersey (jersey never moves; only camera orbits) */}
      {artworks.map((art) => {
        if (!art.texture) return null;
        // Aspect ratio: numbers are taller than wide; logos are square; text is wide
        const aspect = art.type === "number" ? 0.6 : art.type === "logo" ? 1.0 : 2.2;
        return (
          <mesh key={art.id} position={art.position} rotation={art.rotation}>
            <planeGeometry args={[art.size * aspect, art.size]} />
            <meshBasicMaterial
              map={art.texture}
              transparent
              alphaTest={0.05}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

useGLTF.preload("/Jersey.glb");
