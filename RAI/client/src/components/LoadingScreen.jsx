/**
 * LoadingScreen — uvodni splash za neprijavljene (in ob inicializaciji seje).
 *
 * Predvaja public/assets/loading.mp4, pod njim "štafeta" (lowercase, Helvetica,
 * tesno pod videom, centrirano). Ko se video konca (ali po fallback timeout-u),
 * poklice onDone().
 */

import { useEffect, useRef, useState } from "react";

// Mora se ujemati s CSS-jem -> izhod = vhod, samo obraten.
const FADE_MS = 700;
// Po preteku tega cas pokazi splash tudi ce video se nima frame-a
// (npr. browser blokira autoplay) -> nikoli ne ostanemo na "praznem" zaslonu.
const READY_FALLBACK_MS = 1200;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

export default function LoadingScreen({ onDone }) {
  const videoRef = useRef(null);
  const startedFadeRef = useRef(false);
  const [ready, setReady] = useState(false); // imamo prvi frame
  const [fadingOut, setFadingOut] = useState(false);

  const startFade = () => {
    if (startedFadeRef.current) return;
    startedFadeRef.current = true;
    setFadingOut(true);
    window.setTimeout(() => {
      if (typeof onDone === "function") onDone();
    }, FADE_MS);
  };

  useEffect(() => {
    // Fallback: ce onEnded ne sprozi, nadaljuj po 8s.
    const tDone = setTimeout(startFade, 8000);
    // Fallback: ce video event-i ne pridejo, vseeno odkrij splash.
    const tReady = setTimeout(() => setReady(true), READY_FALLBACK_MS);
    return () => {
      clearTimeout(tDone);
      clearTimeout(tReady);
    };
  }, []); // eslint-disable-line

  return (
    <div
      className={`splash ${ready ? "splash--ready" : ""} ${fadingOut ? "splash--fading" : ""}`}
      style={{ transition: `opacity ${FADE_MS}ms ${EASE}` }}
    >
      <video
        ref={videoRef}
        className="splash__video"
        src="/assets/loading.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setReady(true)}
        onCanPlay={() => setReady(true)}
        onEnded={startFade}
      />
      <div className="splash__title">štafeta</div>
    </div>
  );
}
