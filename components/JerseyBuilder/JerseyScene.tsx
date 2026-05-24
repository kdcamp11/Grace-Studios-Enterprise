"use client";

import { useEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

interface Props {
  jerseyColor: string;
  highlightColor: string;
}

export default function JerseyScene({ jerseyColor, highlightColor }: Props) {
  const { scene } = useGLTF("/Jersey.glb");
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // Clone materials once on load so we own them
  useEffect(() => {
    const mats: THREE.MeshStandardMaterial[] = [];
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;

      const rawMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = rawMats.map((m) => {
        const c = (m as THREE.MeshStandardMaterial).clone();
        mats.push(c);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
    });
    materialsRef.current = mats;
  }, [scene]);

  // Apply jersey body color
  useEffect(() => {
    if (!materialsRef.current.length) return;
    const color = new THREE.Color(jerseyColor);
    // Apply to all materials — user can see the whole jersey change
    materialsRef.current.forEach((mat, i) => {
      // First half of materials = body; second half = accents (rough split)
      const isAccent = i >= Math.ceil(materialsRef.current.length / 2);
      mat.color.copy(isAccent ? new THREE.Color(highlightColor) : color);
      mat.needsUpdate = true;
    });
  }, [jerseyColor, highlightColor]);

  return <primitive object={scene} scale={1.2} position={[0, -1.2, 0]} />;
}

useGLTF.preload("/Jersey.glb");
