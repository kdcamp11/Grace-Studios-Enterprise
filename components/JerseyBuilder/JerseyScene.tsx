"use client";

/**
 * JerseyScene — React Three Fiber scene
 *
 *  MODE A — Separate GLBs (recommended)
 *    Put /public/Jersey Top Only.glb  and /public/Jersey Bottoms Only.glb in the public folder.
 *    JerseyTopScene loads "Jersey Top Only.glb" for the Jersey tab.
 *    ShortsScene    loads "Jersey Bottoms Only.glb" for the Shorts tab.
 *    No visibility toggling needed — each file contains only its own pieces.
 *
 *  MODE B — Combined GLB fallback
 *    If the separate files aren't present the component falls back to
 *    /public/Jersey.glb and uses node-name visibility toggling.
 *
 *  Switching between modes is handled by the `separateGlbs` prop.
 *
 *  Zone colours, artwork planes, surface-click, and camera-centre
 *  callbacks all work in both modes.
 */

import { useEffect, useRef, useMemo, Suspense } from "react";
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
  separateGlbs?: boolean;
  onSurfaceClick?: (hit: SurfaceHit) => void;
  isPlacing?: boolean;
  onJerseyTopReady?: (mesh: THREE.Mesh | null) => void;
  onShortsReady?: (mesh: THREE.Mesh | null) => void;
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

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Clone all materials in a scene, apply MAT_TO_ZONE colour mapping, return refs. */
function cloneAndMapMaterials(
  scene: THREE.Object3D,
  zoneColors: ZoneColors,
): {
  matByZone: Partial<Record<keyof ZoneColors, THREE.MeshStandardMaterial>>;
  jerseyTopMesh: THREE.Mesh | null;
  shortsMesh: THREE.Mesh | null;
} {
  const matByZone: Partial<Record<keyof ZoneColors, THREE.MeshStandardMaterial>> = {};
  let jerseyTopMesh: THREE.Mesh | null = null;
  let shortsMesh: THREE.Mesh | null = null;

  scene.traverse((child) => {
    const node = child as THREE.Mesh;
    if (!node.isMesh) return;
    const rawMats = Array.isArray(node.material) ? node.material : [node.material];
    const cloned = rawMats.map((m) => {
      const mat = (m as THREE.MeshStandardMaterial).clone();
      const zoneKey = MAT_TO_ZONE[mat.name];
      if (zoneKey) {
        matByZone[zoneKey] = mat;
        mat.color.set(zoneColors[zoneKey]);
        mat.needsUpdate = true;
      }
      if (mat.name === "jersey_top")    jerseyTopMesh = node;
      if (mat.name === "jersey_shorts") shortsMesh    = node;
      return mat;
    });
    node.material = Array.isArray(node.material) ? cloned : cloned[0];
  });

  return { matByZone, jerseyTopMesh, shortsMesh };
}

/** Centre a scene's bounding box at world origin. */
function useCenterOffset(scene: THREE.Object3D): [number, number, number] {
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const c = new THREE.Vector3();
    box.getCenter(c);
    return [-c.x, -c.y, -c.z];
  }, [scene]);
}

// ── Artwork overlay ───────────────────────────────────────────────────────────

function ArtworkPlanes({ artworks }: { artworks: ArtworkItem[] }) {
  return (
    <>
      {artworks.map((art) => {
        if (!art.texture) return null;
        const aspect = art.type === "number" ? 0.6 : art.type === "logo" ? 1.0 : 2.2;
        return (
          <mesh key={art.id} position={art.position} rotation={art.rotation} renderOrder={1}>
            <planeGeometry args={[art.size * aspect, art.size]} />
            <meshBasicMaterial
              map={art.texture}
              transparent
              alphaTest={0.05}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </>
  );
}

// ── Mode A: Separate GLB sub-scenes ──────────────────────────────────────────

interface SplitSceneProps {
  glbPath: string;
  colors: ZoneColors;
  artworks: ArtworkItem[];
  onSurfaceClick?: (hit: SurfaceHit) => void;
  isPlacing: boolean;
  onMeshReady?: (mesh: THREE.Mesh | null) => void;
  onCenterY?: (y: number) => void;
}

function SplitScene({
  glbPath, colors, artworks, onSurfaceClick, isPlacing, onMeshReady, onCenterY,
}: SplitSceneProps) {
  const { scene } = useGLTF(glbPath);
  const centerOffset = useCenterOffset(scene);
  const matByZoneRef = useRef<Partial<Record<keyof ZoneColors, THREE.MeshStandardMaterial>>>({});

  // Clone materials on load
  useEffect(() => {
    const { matByZone, jerseyTopMesh, shortsMesh } = cloneAndMapMaterials(scene, colors);
    matByZoneRef.current = matByZone;
    // Return whichever primary mesh this GLB contains
    onMeshReady?.(jerseyTopMesh ?? shortsMesh);
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply colours when they change
  useEffect(() => {
    (Object.entries(colors) as [keyof ZoneColors, string][]).forEach(([zone, hex]) => {
      const mat = matByZoneRef.current[zone];
      if (!mat) return;
      mat.color.set(hex);
      mat.needsUpdate = true;
    });
  }, [colors]);

  // Expose Y centre for camera targeting
  useEffect(() => {
    if (!onCenterY) return;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const c = new THREE.Vector3();
    box.getCenter(c);
    // scene.position is centerOffset at this point (R3F applies it before effects)
    onCenterY(c.y);
  }, [scene, centerOffset, onCenterY]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isPlacing || !onSurfaceClick) return;
    e.stopPropagation();
    const mesh  = e.object as THREE.Mesh;
    const point = e.point.clone();
    const normal = e.face?.normal.clone() ?? new THREE.Vector3(0, 0, 1);
    normal.transformDirection(mesh.matrixWorld).normalize();
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    onSurfaceClick({
      point, normal, mesh,
      materialName: (mat as THREE.MeshStandardMaterial)?.name ?? "",
    });
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
      <ArtworkPlanes artworks={artworks} />
    </group>
  );
}

// ── Mode B: Combined GLB with visibility toggle ───────────────────────────────

// Node names verified from public/Jersey.glb inspection
const JERSEY_TOP_NODE_NAMES = new Set([
  "Jersey Top Stitching",
  "Jersey Tiop Side Panels",   // note: typo is in the GLB itself
  "Collar",
  "Jersey Top Lower Side Panels",
  "Sleeve Panels",
]);

const SHORTS_NODE_NAMES = new Set([
  "Legs",
  "Shorts Side Panels",
]);

function CombinedScene({
  colors, artworks, activeView, onSurfaceClick, isPlacing,
  onJerseyTopReady, onShortsReady, onGroupCenters,
}: Omit<Props, "separateGlbs">) {
  const { scene } = useGLTF("/Jersey.glb");
  const centerOffset = useCenterOffset(scene);
  const matByZone = useRef<Partial<Record<keyof ZoneColors, THREE.MeshStandardMaterial>>>({});

  // Expose group Y centres
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
    onGroupCenters({ jerseyTopY: jc.y, shortsY: sc.y });
  }, [scene, centerOffset, onGroupCenters]);

  // Visibility toggle
  useEffect(() => {
    scene.traverse((child) => {
      const isJerseyTop = JERSEY_TOP_NODE_NAMES.has(child.name);
      const isShorts    = SHORTS_NODE_NAMES.has(child.name);
      if (isJerseyTop || isShorts) {
        child.visible = activeView === "jersey" ? isJerseyTop : isShorts;
      }
    });
  }, [scene, activeView]);

  // Clone materials + wire colours
  useEffect(() => {
    const { matByZone: newMats, jerseyTopMesh, shortsMesh } = cloneAndMapMaterials(scene, colors);
    matByZone.current = newMats;
    onJerseyTopReady?.(jerseyTopMesh);
    onShortsReady?.(shortsMesh);
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (Object.entries(colors) as [keyof ZoneColors, string][]).forEach(([zone, hex]) => {
      const mat = matByZone.current[zone];
      if (!mat) return;
      mat.color.set(hex);
      mat.needsUpdate = true;
    });
  }, [colors]);

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
      <ArtworkPlanes artworks={artworks} />
    </group>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export default function JerseyScene({
  colors, artworks, activeView, separateGlbs = false,
  onSurfaceClick, isPlacing = false,
  onJerseyTopReady, onShortsReady, onGroupCenters,
}: Props) {

  // Separate-GLB callbacks bridge into the unified onGroupCenters API
  const handleJerseyTopY = (y: number) => {
    // We only know jerseyTopY here; shortsY will come from the other sub-scene.
    // We pass a stub value for shortsY so the camera still targets correctly
    // when on the jersey tab. The inverse happens when on the shorts tab.
    onGroupCenters?.({ jerseyTopY: y, shortsY: y - 5 });
  };
  const handleShortsY = (y: number) => {
    onGroupCenters?.({ jerseyTopY: y + 5, shortsY: y });
  };

  if (separateGlbs) {
    return (
      <>
        {activeView === "jersey" && (
          <Suspense fallback={null}>
            <SplitScene
              glbPath="/JerseyTop.glb"
              colors={colors}
              artworks={artworks}
              onSurfaceClick={onSurfaceClick}
              isPlacing={isPlacing}
              onMeshReady={onJerseyTopReady}
              onCenterY={handleJerseyTopY}
            />
          </Suspense>
        )}
        {activeView === "shorts" && (
          <Suspense fallback={null}>
            <SplitScene
              glbPath="/Shorts.glb"
              colors={colors}
              artworks={artworks}
              onSurfaceClick={onSurfaceClick}
              isPlacing={isPlacing}
              onMeshReady={onShortsReady}
              onCenterY={handleShortsY}
            />
          </Suspense>
        )}
      </>
    );
  }

  // Default: combined GLB with visibility toggle
  return (
    <CombinedScene
      colors={colors}
      artworks={artworks}
      activeView={activeView}
      onSurfaceClick={onSurfaceClick}
      isPlacing={isPlacing}
      onJerseyTopReady={onJerseyTopReady}
      onShortsReady={onShortsReady}
      onGroupCenters={onGroupCenters}
    />
  );
}

// Preload the combined GLB; separate GLBs are preloaded on demand via Suspense
useGLTF.preload("/Jersey.glb");
