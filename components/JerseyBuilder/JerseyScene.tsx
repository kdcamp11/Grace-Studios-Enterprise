"use client";

/**
 * JerseyScene — React Three Fiber scene that:
 *  1. Loads /public/Jersey.glb via useGLTF
 *  2. Computes the model's bounding box on load and centres it at the origin
 *     so the camera always frames the full jersey regardless of how the GLB
 *     was exported.
 *  3. Applies per-zone colours by material name (MAT_TO_ZONE dict).
 *  4. Renders logos, team names, numbers, and custom text as THREE.js
 *     Decal geometry projected onto the jersey surface.
 *  5. Emits onClick hits so the page can trigger "click to place" flow.
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

export interface ArtworkItem {
  id: string;
  texture: THREE.Texture | null;
  position: [number, number, number];
  rotation: [number, number, number];
  size: number;
  mesh: THREE.Mesh | null;
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function JerseyScene({
  colors,
  artworks,
  onSurfaceClick,
  isPlacing = false,
}: Props) {
  const { scene } = useGLTF("/Jersey.glb");

  // ── Centre the model at origin ────────────────────────────────────────────
  // The GLB nodes are spread across world space (jersey top y≈14, shorts y≈3.5,
  // jersey top x≈-7.8 vs shorts x≈0).  Compute the actual bounding box of the
  // whole scene and apply an offset so the centroid sits at [0,0,0].
  const centerOffset = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    return [-center.x, -center.y, -center.z] as [number, number, number];
  }, [scene]);

  // Per-zone material refs (cloned instances we own)
  const matByZone    = useRef<Partial<Record<keyof ZoneColors, THREE.MeshStandardMaterial>>>({});
  const meshRefByMat = useRef<Record<string, React.MutableRefObject<THREE.Mesh>>>({});

  // ── Clone materials once on load ──────────────────────────────────────────
  useEffect(() => {
    const newMats: typeof matByZone.current = {};
    const newMeshRefs: typeof meshRefByMat.current = {};

    scene.traverse((child) => {
      const node = child as THREE.Mesh;
      if (!node.isMesh) return;

      const rawMats = Array.isArray(node.material) ? node.material : [node.material];

      const cloned = rawMats.map((m) => {
        const mat = (m as THREE.MeshStandardMaterial).clone();
        const zoneKey = MAT_TO_ZONE[mat.name];
        if (zoneKey) {
          newMats[zoneKey] = mat;
          newMeshRefs[mat.name] = { current: node } as React.MutableRefObject<THREE.Mesh>;
        }
        return mat;
      });

      node.material = Array.isArray(node.material) ? cloned : cloned[0];
    });

    matByZone.current    = newMats;
    meshRefByMat.current = newMeshRefs;
  }, [scene]);

  // ── Apply zone colours ────────────────────────────────────────────────────
  useEffect(() => {
    (Object.entries(colors) as [keyof ZoneColors, string][]).forEach(([zone, hex]) => {
      const mat = matByZone.current[zone];
      if (!mat) return;
      mat.color.set(hex);
      mat.needsUpdate = true;
    });
  }, [colors]);

  // ── Surface-click for artwork placement ──────────────────────────────────
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isPlacing || !onSurfaceClick) return;
    e.stopPropagation();

    const mesh   = e.object as THREE.Mesh;
    const point  = e.point.clone();
    const normal = e.face?.normal.clone() ?? new THREE.Vector3(0, 0, 1);
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
      {/* The offset centres the whole model at the world origin */}
      <primitive
        object={scene}
        position={centerOffset}
        onClick={handleClick}
        onPointerOver={isPlacing ? () => { document.body.style.cursor = "crosshair"; } : undefined}
        onPointerOut={isPlacing  ? () => { document.body.style.cursor = "auto"; }      : undefined}
      />

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
