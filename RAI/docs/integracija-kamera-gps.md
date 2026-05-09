# Integracija kamera + GPS

SCRUM-19 pripravi skupni zapis za GPS meritve in zajeme kamere. Namen je, da
lahko backend kasneje sprejme sliko, jo poveze z lokacijo in jo prikaze na
zemljevidu ali uporabi v analitiki.

## Pravila

- GPS meritev uporablja `sensorType: "gps"` in hrani `latitude`, `longitude`
  ter opcijsko `accuracyMeters`.
- Kamera meritev uporablja `sensorType: "camera"`.
- Vsak kamera zapis mora imeti `captureId`, `mediaType` in objekt `gps`.
- GPS lokacija pri kamera zapisu je obvezna, ker brez nje posnetka ne moremo
  povezati z igraliscem ali mapo.

## Primer kamera zapisa

```json
{
  "schemaVersion": "1.0",
  "deviceId": "camera-node-01",
  "sensorType": "camera",
  "timestampUtc": "2026-05-09T10:00:00Z",
  "data": {
    "captureId": "capture-001",
    "mediaType": "image/jpeg",
    "imageUrl": "https://example.com/captures/capture-001.jpg",
    "gps": {
      "latitude": 46.0569,
      "longitude": 14.5058,
      "accuracyMeters": 5
    }
  }
}
```

## Backend model

`server/src/models/SensorMeasurement.js` uporablja kolekcijo
`sensor_measurements` in validira podatke glede na `sensorType`.

Pomembni indeksi:

- `deviceId + timestampUtc` za pregled meritev ene naprave skozi cas
- `sensorType + timestampUtc` za filtriranje GPS ali kamera podatkov
