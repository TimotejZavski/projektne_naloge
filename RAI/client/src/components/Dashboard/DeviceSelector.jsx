/**
 * DeviceSelector — izbira naprave iz seznama uporabnikovih naprav (SCRUM-41).
 *
 * Ob mount-u poklice GET /api/devices in prikaze dropdown.
 * Ko uporabnik izbere napravo, klice onChange(deviceId, device).
 *
 * Stanja:
 *   - loading: spinner v dropdown-u
 *   - error:   opozorilo + retry
 *   - empty:   "Ni naprav" z navodili
 *   - data:    dropdown s seznamom
 */

import { useEffect, useState } from "react";
import { listDevices } from "../../api/devices";
import { useAuth } from "../../context/AuthContext";

export default function DeviceSelector({ selectedDeviceId, onChange }) {
  const { status: authStatus } = useAuth();
  const [devices, setDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDevices = async () => {
    if (authStatus !== "authed") return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await listDevices({ limit: 200 });
      const list = (data && data.devices) || [];
      setDevices(list);
      if (!selectedDeviceId && list.length > 0 && onChange) {
        onChange(list[0].deviceId, list[0]);
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, [authStatus]); // eslint-disable-line

  const handleChange = (e) => {
    const id = e.target.value;
    const device = devices.find((d) => d.deviceId === id) || null;
    if (onChange) onChange(id, device);
  };

  if (authStatus !== "authed") {
    return (
      <div className="selector-card">
        <span className="status-label">Naprava</span>
        <p className="hint">Za izbiro naprave se prijavi.</p>
      </div>
    );
  }

  return (
    <div className="selector-card">
      <label className="selector-label">
        <span className="status-label">Naprava</span>
        <select
          className="selector-dropdown"
          value={selectedDeviceId || ""}
          onChange={handleChange}
          disabled={isLoading || devices.length === 0}
        >
          {isLoading && <option value="">Nalagam naprave…</option>}
          {!isLoading && devices.length === 0 && !error && (
            <option value="">Ni naprav</option>
          )}
          {!isLoading &&
            devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.name || d.deviceId} ({d.platform || "?"})
              </option>
            ))}
        </select>
      </label>

      {error && !isLoading && (
        <p className="error-banner">
          Naprav ni bilo mogoče naložiti.{" "}
          <button type="button" className="ghost-button" onClick={fetchDevices}>
            Poskusi znova
          </button>
        </p>
      )}

      {!isLoading && !error && devices.length === 0 && (
        <p className="hint">
          Ni najdenih naprav. Registriraj napravo prek{" "}
          <code>POST /api/devices</code>.
        </p>
      )}
    </div>
  );
}
