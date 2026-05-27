"use client";

/**
 * JerseyScene — React Three Fiber scene
 *
 *  • Loads /public/Jersey.glb via useGLTF
 *  • Centres the whole model at world origin once on load
 *  • Applies per-zone colours by material name
 *  • activeView="jersey" → shows only jersey-top meshes (body, collar, panels, sleeves)
 *  • activeView="shorts" → shows only shorts meshes
 *  • Artwork rendered as double-sided plane meshes, locked to world space
 *  • Exposes jersey_top mesh + group Y-centres for camera-target switching
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
  activeView: "jersey" | "shorts";
  onSurfaceClick?: (hit: SurfaceHit) => void;
  isPlacing?: boolean;
  onJerseyTopReady?: (mesh: THREE.Mesh | null) => void;
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

// Node names for each group (from GLB inspection)
const JERSEY_TOP_NODE_NAMES = new Set([
  "Jersey Top Stitching",
  "Jersey Tiop Side Panels",
  "Collar",
  "Jersey Top Lower Side Panels",
  "Sleeve Panels",
]);

const SHORTS_NODE_NAMES = new Set([
  "Legs",
  "Shorts Side Panels",
]);

// ── Component ─────────────────────────────────────────────────────────────────

export default function JerseyScene({
  colors,
  artworks,
  activeView,
  onSurfaceClick,
  isPlacing = false,
  onJerseyTopReady,
  onGroupCenters,
}: Props) {
  const { scene } = useGLTF("/Jersey.glb");

  // ── Centre the whole model at world origin (runs once per scene) ──────────
  const centerOffset = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    return [-center.x, -center.y, -center.z] as [number, number, number];
  }, [scene]);

  // ── Expose group Y centres for tab camera switching ───────────────────────
  useEffect(() => {
    if (!onGroupCenters) return;
    scene.updateMatrixWorld(true);

    const jerseyBox = new THREE.Box3();
    const shortsBox  = new THREE.Box3();

    scene.traverse((child) => {
      if (JERSEY_TOP_NODE_NAMES.has(child.name)) jerseyBox.expandByObject(child);
      if (SHORTS_NODE_NAMES.has(child.name))     shortsBox.expandByObject(child);
    });

    const jc = new THREE.Vector3();
    const sc = new THREE.Vector3();
    jerseyBox.getCenter(jc);
    shortsBox.getCenter(sc);

    // jc / sc are already in world space because R3F sets scene.position = centerOffset
    // during its commit phase, before useEffect runs.  Don't add centerOffset again.
    onGroupCenters({ jerseyTopY: jc.y, shortsY: sc.y });
  }, [scene, centerOffset, onGroupCenters]);

  // ── Visibility: show only the active group ───────────────────────────────
  useEffect(() => {
    scene.traverse((child) => {
      const isJerseyTop = JERSEY_TOP_NODE_NAMES.has(child.name);
      const isShorts    = SHORTS_NODE_NAMES.has(child.name);
      if (isJerseyTop || isShorts) {
        child.visible = activeView === "jersey" ? isJerseyTop : isShorts;
      }
    });
  }, [scene, activeView]);

  // ── Per-zone material refs ────────────────────────────────────────────────
  const matByZone = useRef<Partial<Record<keyof ZoneColors, THREE.MeshStandardMaterial>>>({});

  // ── Clone materials + expose jersey_top mesh ──────────────────────────────
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

  // ── Surface-click (manual "Move" repositioning) ───────────────────────────
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
