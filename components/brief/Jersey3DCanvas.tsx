"use client";

import { Suspense, useMemo, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { PresentationControls } from "@react-three/drei";
import * as THREE from "three";

// ── SVG viewBox 0 0 200 264 → Three.js meters ─────────────────────────────────
const SX = (x: number) => (x - 100) / 200;
const SY = (y: number) => -(y - 132) / 200;

function buildJerseyShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(SX(46),  SY(6));
  s.quadraticCurveTo(SX(24),  SY(36),  SX(12),  SY(66));
  s.lineTo(SX(10),  SY(84));
  s.quadraticCurveTo(SX(14),  SY(94),  SX(22),  SY(96));
  s.lineTo(SX(24),  SY(244));
  s.quadraticCurveTo(SX(100), SY(260), SX(176), SY(244));
  s.lineTo(SX(178), SY(96));
  s.quadraticCurveTo(SX(186), SY(94), SX(190), SY(84));
  s.lineTo(SX(188), SY(66));
  s.quadraticCurveTo(SX(176), SY(36), SX(154), SY(6));
  s.quadraticCurveTo(SX(130), SY(44), SX(100), SY(64));
  s.quadraticCurveTo(SX(70),  SY(44), SX(46),  SY(6));
  return s;
}

// ── Geometry: cosine cylindrical bow + deeper extrusion ───────────────────────
const DEPTH = 0.11;

function applyBodyForm(geo: THREE.BufferGeometry) {
  const pos  = geo.attributes.position as THREE.BufferAttribute;
  const R    = 0.18;   // bow radius — how far chest protrudes toward viewer
  const maxX = 0.46;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const angle  = Math.min(1, Math.abs(x) / maxX) * (Math.PI / 2);
    const bow    = R * Math.cos(angle);
    // Chest peaks at y≈0.10, tapers at shoulders and hem
    const vFac   = 0.55 + 0.45 * Math.exp(-((y - 0.10) ** 2) / 0.12);

    if (z > 0.002) {
      pos.setZ(i, z + bow * vFac);
    } else if (z < -0.005) {
      pos.setZ(i, z - bow * 0.20 * vFac);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// ── Vertex shader ──────────────────────────────────────────────────────────────
const VERT = /* glsl */`
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos    = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ── Fragment shader ────────────────────────────────────────────────────────────
//
//  Key technique: blend geometry normals with a synthetic "sphere" normal
//  derived purely from object-space position. Even with low-poly tessellation
//  the lighting will read as a smooth cylindrical torso form.
//
function buildFrag(sysInt: number): string {
  const regions: Record<number, string> = {
    0: `bool isSide = abs(vPos.x) > 0.113;
        color = isSide ? uSecondary : uPrimary;`,
    1: `float t = clamp((vPos.y + 0.56) / 1.19, 0.0, 1.0);
        if (t < 0.45) color = mix(uAccent,   uPrimary,   t / 0.45);
        else          color = mix(uPrimary,   uSecondary, (t-0.45)/0.55);`,
    2: `bool isSide = abs(vPos.x) > 0.113;
        color = isSide ? uSecondary : uPrimary;`,
    3: `bool lb = vPos.x < -0.035 && vPos.y > -0.04;
        bool br = vPos.x >  0.09  && vPos.y < -0.10;
        color = (lb || br) ? uSecondary : uPrimary;`,
  };

  return /* glsl */`
    precision highp float;
    uniform vec3 uPrimary;
    uniform vec3 uSecondary;
    uniform vec3 uAccent;
    varying vec3 vPos;
    varying vec3 vNormal;

    // ── Knit fabric noise ──────────────────────────────────────────────────────
    float hash(vec2 p) {
      p = fract(p * vec2(127.1,311.7));
      p += dot(p, p+45.32);
      return fract(p.x*p.y);
    }
    float noise2(vec2 p) {
      vec2 i=floor(p); vec2 f=fract(p);
      float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
      vec2 u=f*f*(3.0-2.0*f);
      return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
    }
    float knitTex(vec2 pos) {
      float sc = 200.0;
      float row = abs(fract(pos.y*sc) - 0.5)*2.0;
      float rib = smoothstep(0.52,0.70,row)*0.045;
      float fn  = (noise2(pos*sc*0.45)-0.5)*0.025;
      return rib+fn;
    }

    void main() {
      bool isFront = vPos.z > 0.0;

      // ── Design color ─────────────────────────────────────────────────────────
      vec3 color = uPrimary;
      ${regions[sysInt] ?? regions[0]}

      // Knit texture on front face only
      if (isFront) color += vec3(knitTex(vPos.xy));

      // Seam line at panel boundary
      float seamX = abs(abs(vPos.x) - 0.113);
      color *= 1.0 - smoothstep(0.008,0.0,seamX)*0.25*float(isFront);

      // ── Normal augmentation ───────────────────────────────────────────────────
      //
      //  Synthetic "sphere" normal: points toward camera at center chest,
      //  tilts sideways at edges — guarantees cylindrical shading regardless
      //  of polygon density.  Mix 40% synthetic, 60% geometry.
      //
      vec3 geoNorm = normalize(vNormal);
      vec3 synNorm = normalize(vec3(
        vPos.x * 2.2,
        (vPos.y - 0.08) * 0.55,
        1.0
      ));
      vec3 n = normalize(mix(geoNorm, synNorm, isFront ? 0.42 : 0.20));

      vec3 viewD = vec3(0.0, 0.0, 1.0);

      // ── Lights ───────────────────────────────────────────────────────────────
      // Key: upper-left soft box  (main studio source)
      vec3  kDir  = normalize(vec3(-1.7, 2.8, 2.5));
      float kDiff = max(dot(n, kDir), 0.0);

      // Fill: right reflector
      vec3  fDir  = normalize(vec3(1.8, 0.4, 1.6));
      float fDiff = max(dot(n, fDir), 0.0);

      // Overhead: top pass — shoulder/collar highlight
      vec3  oDir  = normalize(vec3(0.0, 3.5, 1.0));
      float oDiff = max(dot(n, oDir), 0.0);

      // Low ambient to keep the gradient strong
      float ambient = 0.26;
      float diffuse = ambient + kDiff*0.72 + fDiff*0.14 + oDiff*0.09;

      // ── Specular — anisotropic polyester sheen ────────────────────────────────
      vec3  hVec   = normalize(kDir + viewD);
      float sDot   = max(dot(n, hVec), 0.0);
      float specSoft = pow(sDot, 12.0) * 0.055;   // broad fabric sheen
      float specHot  = pow(sDot, 100.0)* 0.28;    // tight hot-spot upper chest

      // Hot-spot only on front face near chest centre
      float chestMask = exp(-length(vec2(vPos.x*1.8, vPos.y-0.12))*4.0);
      specHot *= chestMask * float(isFront);

      // ── Rim light — creates silhouette depth (cool fill from behind) ──────────
      //  Catches the curved side edges and lifts the jersey off the background
      vec3  rDir   = normalize(vec3(0.0, 0.3, -1.1));
      float rimDot = max(dot(-n, rDir), 0.0);
      float rim    = pow(rimDot, 1.6) * 0.55;

      // ── Ambient occlusion simulation ─────────────────────────────────────────
      // Hem crease: subtle shadow at very bottom
      float hemAO    = smoothstep(-0.60, -0.44, vPos.y) * 0.14;
      // Collar/neckline inner shadow
      float collarAO = smoothstep(0.50, 0.64, vPos.y) * 0.16;
      // Armhole inner edge (~y=0.18–0.50, x=±0.35–0.46)
      float armX     = smoothstep(0.30, 0.44, abs(vPos.x));
      float armY     = 1.0 - abs(vPos.y - 0.30) / 0.25;
      float armAO    = clamp(armX * armY, 0.0, 1.0) * 0.12;
      float ao       = 1.0 - hemAO - collarAO - armAO;

      // ── Compose ───────────────────────────────────────────────────────────────
      vec3 lit = color * diffuse + vec3(specSoft + specHot);
      lit += vec3(0.65, 0.78, 1.00) * rim * 0.28;  // cool rim tint
      lit *= ao;

      // Shoulder brightening: top-lit area slightly warms up
      float shoulder = smoothstep(0.38, 0.60, vPos.y) * 0.06;
      lit += vec3(1.0,0.97,0.92) * shoulder;

      gl_FragColor = vec4(lit, 1.0);
    }
  `;
}

// ── Jersey mesh ───────────────────────────────────────────────────────────────
function JerseyMesh({
  system, primaryColor, secondaryColor, accentColor,
}: {
  system: string; primaryColor: string; secondaryColor: string; accentColor: string;
}) {
  const sysInt = ({ bold: 0, gradient: 1, program: 2, culture: 3 } as Record<string, number>)[system] ?? 0;

  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildJerseyShape(), {
      steps: 3,
      depth: DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.010,
      bevelSize:      0.007,
      bevelSegments:  8,
    });
    g.translate(0, 0, -DEPTH / 2);
    applyBodyForm(g);
    return g;
  }, []);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uPrimary:   { value: new THREE.Color(primaryColor)   },
      uSecondary: { value: new THREE.Color(secondaryColor) },
      uAccent:    { value: new THREE.Color(accentColor)    },
    },
    vertexShader:   VERT,
    fragmentShader: buildFrag(sysInt),
    side: THREE.DoubleSide,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sysInt]);

  useEffect(() => {
    mat.uniforms.uPrimary.value.set(primaryColor);
    mat.uniforms.uSecondary.value.set(secondaryColor);
    mat.uniforms.uAccent.value.set(accentColor);
    mat.uniformsNeedUpdate = true;
  }, [primaryColor, secondaryColor, accentColor, mat]);

  // Collar band
  const collarGeo = useMemo(() => {
    const curve = new THREE.EllipseCurve(
      SX(100), SY(35),
      SX(145) - SX(100),
      SY(10)  - SY(35),
      0, Math.PI * 2, false, 0,
    );
    return new THREE.ExtrudeGeometry(new THREE.Shape(curve.getPoints(60)), {
      depth: 0.016,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.004,
      bevelSegments: 5,
    });
  }, []);

  const collarMat = useMemo(() => new THREE.MeshStandardMaterial({
    roughness: 0.65, metalness: 0.04,
    color: new THREE.Color(accentColor),
  }), [accentColor]);

  useEffect(() => { collarMat.color.set(accentColor); }, [accentColor, collarMat]);

  return (
    <group>
      <mesh geometry={geo}       material={mat}       castShadow receiveShadow />
      <mesh geometry={collarGeo} material={collarMat} position={[0, 0, DEPTH / 2 + 0.004]} />
    </group>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({
  system, primaryColor, secondaryColor, accentColor, view,
}: {
  system: string; primaryColor: string; secondaryColor: string; accentColor: string;
  view: "front" | "back";
}) {
  const { scene } = useThree();

  useEffect(() => {
    // Neutral dark studio backdrop — matches reference images
    scene.background = new THREE.Color("#2a2a2a");
    scene.fog = new THREE.FogExp2("#2a2a2a", 1.8);
  }, [scene]);

  const rotY = view === "back" ? Math.PI : 0;

  return (
    <>
      <ambientLight intensity={0.45} color="#d8e8ff" />
      <directionalLight position={[-2.0, 3.2, 2.8]} intensity={2.4} color="#fff5ea" castShadow />
      <directionalLight position={[ 1.8, 0.4, 1.8]} intensity={0.60} color="#b0c8ff" />
      <directionalLight position={[ 0.0,-1.0,-2.0]} intensity={0.45} color="#ffffff"  />
      <directionalLight position={[ 0.0, 4.0, 0.5]} intensity={0.50} color="#edf2ff"  />

      <PresentationControls
        global snap
        rotation={[0.04, rotY, 0]}
        polar={[-0.20, 0.20]}
        azimuth={[-0.45, 0.45]}
      >
        <group scale={0.80}>
          <JerseyMesh
            system={system}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            accentColor={accentColor}
          />
        </group>
      </PresentationControls>
    </>
  );
}

// ── Public API ────────────────────────────────────────────────────────────────
export interface Jersey3DCanvasProps {
  system: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  view: "front" | "back";
  width?: number;
  height?: number;
}

export default function Jersey3DCanvas({
  system, primaryColor, secondaryColor, accentColor,
  view, width = 218, height = 288,
}: Jersey3DCanvasProps) {
  return (
    <Canvas
      style={{ width, height, display: "block" }}
      camera={{ position: [0, 0.02, 1.75], fov: 40, near: 0.01, far: 20 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.18,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      shadows
    >
      <Suspense fallback={null}>
        <Scene
          system={system}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          accentColor={accentColor}
          view={view}
        />
      </Suspense>
    </Canvas>
  );
}
