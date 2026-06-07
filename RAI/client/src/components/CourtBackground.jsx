/**
 * CourtBackground — fiksen 3D background z modelom igrišča (court.glb).
 *
 * Renderira black & white scene (vsi materiali zamenjani z mat belim, ozadje
 * belo) za nevtralen, tipografski videz. Vsi parametri so kontrolirani prek
 * React props, da jih lahko AuthPage (in kasneje dashboard) izpostavlja prek
 * UI tuner-ja.
 */

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";

// Subtilna oscilacija okoli Y -> "diha" levo/desno; tiha, dolga perioda.
const SWAY_AMPLITUDE = 0.08;   // rad (~4.5 stopinj)
const SWAY_PERIOD_SEC = 18;    // ena polna oscilacija

export default function CourtBackground({
  rotationY = 0,
  rotationX = 0,
  scale = 1,
  posX = 0,
  posY = 0,
  posZ = 0,
  cameraZ = 6,
}) {
  return (
    <div className="court-bg">
      <Canvas
        camera={{ position: [0, 0, cameraZ], fov: 35 }}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#ffffff"]} />
        {/* Nevtralna fill svetloba + topel rumen rim za subtilen sunset feel. */}
        <ambientLight intensity={0.75} color="#fff8e6" />
        <directionalLight position={[5, 8, 5]} intensity={0.55} color="#ffffff" />
        <directionalLight position={[-6, 3, -4]} intensity={0.85} color="#ffcc55" />
        <directionalLight position={[-4, -2, -5]} intensity={0.2} color="#ffe9a8" />
        <Suspense fallback={null}>
          <CourtModel
            rotationX={rotationX}
            rotationY={rotationY}
            scale={scale}
            position={[posX, posY, posZ]}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

function CourtModel({ rotationX, rotationY, scale, position }) {
  const ref = useRef(null);
  // Pustimo originalne materiale + teksture; B/W naredimo z CSS filter
  // grayscale(1) na canvasu (glej .court-bg).
  const { scene } = useGLTF("/assets/3d/court.glb");

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const sway = Math.sin((t / SWAY_PERIOD_SEC) * Math.PI * 2) * SWAY_AMPLITUDE;
    ref.current.rotation.y = rotationY + sway;
  });

  return (
    <group ref={ref} position={position} scale={scale} rotation={[rotationX, rotationY, 0]}>
      <primitive object={scene} />
    </group>
  );
}

// Drei preloads model -> hitrejsi prvi paint.
useGLTF.preload("/assets/3d/court.glb");
