/**
 * TimeSeriesChart — Chart.js grafikon časovne serije (SCRUM-41).
 *
 * Prejme `measurements` in `sensorType`, renderira ustrezen grafikon:
 *   - accelerometer: 3 linije (x, y, z)
 *   - gps:           1 linija (accuracyMeters)
 *
 * Uporablja `chartHelpers` za options in dataset-e.
 * Ovije ga `ChartPanel` za loading/error/empty stanja.
 */

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';

import {
  buildAccelerometerOptions,
  buildAccelerometerDatasets,
  buildGpsAccuracyOptions,
  buildGpsAccuracyDataset,
} from '../../services/chartHelpers';
import ChartPanel from './ChartPanel';

export default function TimeSeriesChart({ measurements, sensorType, isLoading, error, onRetry }) {
  const isEmpty = useMemo(() => !measurements || measurements.length === 0, [measurements]);

  const { options, data } = useMemo(() => {
    if (isEmpty) return { options: null, data: null };

    if (sensorType === 'accelerometer') {
      return {
        options: buildAccelerometerOptions(),
        data: { datasets: buildAccelerometerDatasets(measurements) },
      };
    }

    // GPS
    return {
      options: buildGpsAccuracyOptions(),
      data: { datasets: buildGpsAccuracyDataset(measurements) },
    };
  }, [measurements, sensorType, isEmpty]);

  const title = sensorType === 'accelerometer' ? 'Pospeškometer (X, Y, Z)' : 'GPS točnost';

  const subtitle = !isEmpty
    ? `${measurements.length} meritev`
    : undefined;

  return (
    <ChartPanel
      title={title}
      subtitle={subtitle}
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage={`Ni ${sensorType === 'accelerometer' ? 'pospeškometer' : 'GPS'} meritev za izbrano obdobje.`}
      onRetry={onRetry}
    >
      {data && options && (
        <div className="chart-wrapper">
          <Line options={options} data={data} />
        </div>
      )}
    </ChartPanel>
  );
}
