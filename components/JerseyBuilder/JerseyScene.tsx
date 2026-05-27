"use client";

/**
 * JerseyScene — React Three Fiber scene that:
 *  1. Loads /public/Jersey.glb via useGLTF
 *  2. X-aligns the jersey-top node group to x=0 (GLB export has it at x≈-7.8)
 *     so jersey and shorts stack vertically instead of sitting side-by-side.
 *  3. Centres the assembled model at world origin.
 *  4. Applies per-zone colours by material name.
 *  5. Renders artwork as double-sided plane meshes on the jersey surface.
 *  6. Fires onGroupCenters with the y-centres of jersey-top and shorts so
 *     the parent can drive camera-target switching (jersey / shorts tabs).
 *
 * GLB material ↔ zone map (verified from public/Jersey.glb):
 *   jersey_top, jersey_shorts, short_side_panels, jersey_side_panels,
 *   collar, jersey_lower_panels, sleeve_panels
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

export interface GroupCenters {
  jerseyTopY: number;
  shortsY: number;
}

interface Props {
  colors: ZoneColors;
  artworks: ArtworkItem[];
  onSurfaceClick?: (hit: SurfaceHit) => void;
  isPlacing?: boolean;
  onJerseyTopReady?: (mesh: THREE.Mesh | null) => void;
  /** Y-centres of jersey-top and shorts groups (world space after centering) */
  onGroupCenters?: (centers: GroupCenters) => void;
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

// Jersey-top Object3D node names (from GLB inspection)
const JERSEY_TOP_NAMES = new Set([
  "Jersey Top Stitching",
  "Jersey Tiop Side Panels",   // typo in the original GLB export
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
  onGroupCenters,
}: Props) {
  const { scene } = useGLTF("/Jersey.glb");

  // ── Fix layout + centre at origin ────────────────────────────────────────
  // The GLB exports jersey-top nodes at x≈-7.8 and shorts at x≈0,
  // so they appear side-by-side.  We shift jersey-top nodes to x=0 so the
  // outfit stacks vertically (jersey above, shorts below), then centre the
  // whole model at world origin.
  const centerOffset = useMemo(() => {
    // ── 1. Collect jersey-top Object3D nodes ──────────────────────────────
    const jerseyTopNodes: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (JERSEY_TOP_NAMES.has(child.name)) jerseyTopNodes.push(child);
    });

    // ── 2. Align jersey-top X to match shorts (x=0) ───────────────────────
    if (jerseyTopNodes.length > 0) {
      scene.updateMatrixWorld(true);
      const jtBox = new THREE.Box3();
      jerseyTopNodes.forEach((n) => jtBox.expandByObject(n));
      const jtCenter = new THREE.Vector3();
      jtBox.getCenter(jtCenter);
      // Shift each node — subtraction is idempotent once center reaches ≈0
      jerseyTopNodes.forEach((n) => { n.position.x -= jtCenter.x; });
    }

    // ── 3. Centre the whole assembled model at world origin ───────────────
    scene.updateMatrixWorld(true);
    const globalBox = new THREE.Box3().setFromObject(scene);
    const globalCenter = new THREE.Vector3();
    globalBox.getCenter(globalCenter);
    return [-globalCenter.x, -globalCenter.y, -globalCenter.z] as [number, number, number];
  }, [scene]);

  // ── Expose group Y-centres for camera tab switching ───────────────────────
  useEffect(() => {
    if (!onGroupCenters) return;
    scene.updateMatrixWorld(true);

    // Jersey-top group center
    const jtNodes: THREE.Object3D[] = [];
    scene.traverse((c) => { if (JERSEY_TOP_NAMES.has(c.name)) jtNodes.push(c); });
    const jtBox = new THREE.Box3();
    jtNodes.forEach((n) => jtBox.expandByObject(n));
    const jtCenter = new THREE.Vector3();
    jtBox.getCenter(jtCenter);

    // Shorts group center — everything NOT in jersey-top
    const shortsBox = new THREE.Box3();
    scene.traverse((child) => {
      const node = child as THREE.Mesh;
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const isShorts = mats.some((m) => {
        const name = (m as THREE.MeshStandardMaterial).name;
        return name === "jersey_shorts" || name === "short_side_panels";
      });
      if (isShorts) shortsBox.expandByObject(node);
    });
    const shortsCenter = new THREE.Vector3();
    shortsBox.getCenter(shortsCenter);

    // Offset both by the centering shift so they're in world (post-primitive) space
    const cy = centerOffset[1];
    onGroupCenters({
      jerseyTopY: jtCenter.y + cy,
      shortsY:    shortsCenter.y + cy,
    });
  }, [scene, centerOffset, onGroupCenters]);

  // Per-zone material refs
  const matByZone = useRef<Partial<Record<keyof ZoneColors, THREE.MeshStandardMaterial>>>({});

  // ── Clone materials, expose jersey_top mesh ───────────────────────────────
  useEffect(() => {
    const newMats: typeof matByZone.current = {};
    let jerseyTopMesh: THREE.Mesh | null = null;

    scene.traverse((child) => {
      const node = child as THREE.Mesh;
      if (!node.isMesh) return;

      const rawMats = Array.isArray(node.material) ? node.material : [node.material];
      const cloned  = rawMats.map((m) => {
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

  // ── Surface-click (manual repositioning) ─────────────────────────────────
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isPlacing || !onSurfaceClick) return;
    e.stopPropagation();

    const mesh   = e.object as THREE.Mesh;
    const point  = e.point.clone();
    const normal = e.face?.normal.clone() ?? new THREE.Vector3(0, 0, 1);
    normal.transformDirection(mesh.matrixWorld).normalize();

    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    onSurfaceClick({ point, normal, mesh,
      materialName: (mat as THREE.MeshStandardMaterial)?.name ?? "" });
  };

  return (
    <group>
      <primitive
        object={scene}
        position={centerOffset}
        onClick={handleClick}
        onPointerOver={isPlacing ? () => { document.body.style.cursor = "crosshair"; } : undefined}
        onPointerOut={isPlacing  ? () => { document.body.style.cursor = "auto"; }      : undefined}
      />

      {/* Artwork — double-sided plane meshes */}
      {artworks.map((art) => {
        if (!art.texture) return null;
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
