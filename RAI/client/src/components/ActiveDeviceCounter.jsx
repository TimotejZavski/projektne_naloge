/**
 * ActiveDeviceCounter — SCRUM-47 komponenta za prikaz stevila aktivnih naprav.
 *
 * Polla `GET /api/devices/active/count` vsakih 10 sekund.
 * Prikazuje stevilo online naprav, ki so poslale heartbeat (MQTT status/online).
 *
 * Barva indikatorja:
 *   - zelena:  1+ aktivnih naprav
 *   - siva:    0 aktivnih naprav (ni povezav)
 *   - oranzna: napaka pri fetch-u
 */

import { useEffect, useState, useRef } from "react";
import { fetchActiveDeviceCount } from "../api/devices";

export default function ActiveDeviceCounter() {
  const [count, setCount] = useState(null);
  const [error, setError] = useState(false);
  const intervalRef = useRef(null);

  const fetchCount = async () => {
    try {
      const data = await fetchActiveDeviceCount();
      if (data && typeof data.activeDevices === "number") {
        setCount(data.activeDevices);
        setError(false);
      }
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchCount();
    intervalRef.current = setInterval(fetchCount, 10_000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const dotClass =
    error || count === null
      ? "signal-dot signal-dot--amber"
      : count > 0
        ? "signal-dot signal-dot--green"
        : "signal-dot";

  const label =
    error || count === null
      ? "Napaka pri preverjanju"
      : count === 0
        ? "Trenutno ni povezanih naprav"
        : count === 1
          ? "1 aktivna naprava"
          : `${count} aktivnih naprav`;

  return (
    <div className="signal-row">
      <span className={dotClass} />
      <div>
        <strong>Online naprave</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}
