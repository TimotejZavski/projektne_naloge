/**
 * Integracijski testi za DeviceLookup (SCRUM-29).
 *
 * Mockamo API plast in AuthContext, da preverimo:
 *   - vnos deviceId in klic API-ja
 *   - prikaz device karte + measurements tabele
 *   - obnasanje pri 404 / 401 / 400 / omrezna napaka
 *   - disable-anje gumba ko ni prijave
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DeviceLookup from '../DeviceLookup';
import { ApiError } from '../../api/client';
import { fetchDeviceByDeviceId } from '../../api/devices';
import { listMeasurementsForDevice } from '../../api/measurements';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../api/devices');
jest.mock('../../api/measurements');
jest.mock('../../context/AuthContext');

beforeEach(() => {
  fetchDeviceByDeviceId.mockReset();
  listMeasurementsForDevice.mockReset();
  useAuth.mockReturnValue({ status: 'authed', user: { email: 'a@b.c' } });
});

function makeDevice(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    deviceId: 'pixel-8-azur',
    name: 'Pixel 8',
    platform: 'android',
    appVersion: '1.0.0',
    isActive: true,
    lastSeenAtUtc: '2026-05-19T08:30:00.000Z',
    createdAtUtc: '2026-05-10T08:00:00.000Z',
    ...overrides,
  };
}

describe('DeviceLookup — happy path', () => {
  it('po klicu prikaze metapodatke naprave in zgodovino meritev', async () => {
    fetchDeviceByDeviceId.mockResolvedValue({ device: makeDevice() });
    listMeasurementsForDevice.mockResolvedValue({
      measurements: [
        {
          _id: 'm1',
          deviceId: 'pixel-8-azur',
          sensorType: 'gps',
          source: 'mqtt',
          timestampUtc: '2026-05-19T08:29:00.000Z',
          data: { latitude: 46.05690, longitude: 14.50580, accuracyMeters: 5 },
        },
        {
          _id: 'm2',
          deviceId: 'pixel-8-azur',
          sensorType: 'accelerometer',
          source: 'http',
          timestampUtc: '2026-05-19T08:28:00.000Z',
          data: { x: 0.1, y: -0.2, z: 9.81, unit: 'm/s2' },
        },
      ],
    });

    const user = userEvent.setup();
    render(<DeviceLookup />);

    await user.type(screen.getByPlaceholderText(/pixel-8-azur/i), 'pixel-8-azur');
    await user.click(screen.getByRole('button', { name: /poisci/i }));

    expect(await screen.findByRole('heading', { level: 3, name: /Pixel 8/i })).toBeInTheDocument();
    expect(screen.getByText('android')).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
    expect(screen.getByText('aktivna')).toBeInTheDocument();

    // Tabela meritev
    expect(screen.getByText(/2 zapisov/i)).toBeInTheDocument();
    expect(screen.getByText(/46\.0569, 14\.5058/)).toBeInTheDocument();
    expect(screen.getByText(/x=0\.1 y=-0\.2 z=9\.81 m\/s2/)).toBeInTheDocument();

    expect(fetchDeviceByDeviceId).toHaveBeenCalledWith('pixel-8-azur', expect.any(Object));
    expect(listMeasurementsForDevice).toHaveBeenCalledWith(
      'pixel-8-azur',
      { limit: 20 },
      expect.any(Object)
    );
  });

  it('trim-a presledke pred klicem', async () => {
    fetchDeviceByDeviceId.mockResolvedValue({ device: makeDevice() });
    listMeasurementsForDevice.mockResolvedValue({ measurements: [] });

    const user = userEvent.setup();
    render(<DeviceLookup />);

    await user.type(screen.getByPlaceholderText(/pixel-8-azur/i), '  pixel-8-azur  ');
    await user.click(screen.getByRole('button', { name: /poisci/i }));

    expect(fetchDeviceByDeviceId).toHaveBeenCalledWith('pixel-8-azur', expect.any(Object));
  });
});

describe('DeviceLookup — napake', () => {
  it('404 -> sporocilo o neobstojeci napravi', async () => {
    fetchDeviceByDeviceId.mockRejectedValue(
      new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Naprava ne obstaja.' })
    );
    listMeasurementsForDevice.mockResolvedValue({ measurements: [] });

    const user = userEvent.setup();
    render(<DeviceLookup />);
    await user.type(screen.getByPlaceholderText(/pixel-8-azur/i), 'nope');
    await user.click(screen.getByRole('button', { name: /poisci/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /naprava ne obstaja/i
    );
  });

  it('401 -> sporocilo o poteceni seji', async () => {
    fetchDeviceByDeviceId.mockRejectedValue(
      new ApiError({ status: 401, code: 'TOKEN_EXPIRED' })
    );
    listMeasurementsForDevice.mockResolvedValue({ measurements: [] });

    const user = userEvent.setup();
    render(<DeviceLookup />);
    await user.type(screen.getByPlaceholderText(/pixel-8-azur/i), 'foo');
    await user.click(screen.getByRole('button', { name: /poisci/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/seja je potekla/i);
  });

  it('400 -> prikaze backend sporocilo', async () => {
    fetchDeviceByDeviceId.mockRejectedValue(
      new ApiError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'deviceId mora biti 3-64 znakov',
      })
    );
    listMeasurementsForDevice.mockResolvedValue({ measurements: [] });

    const user = userEvent.setup();
    render(<DeviceLookup />);
    await user.type(screen.getByPlaceholderText(/pixel-8-azur/i), 'ab');
    await user.click(screen.getByRole('button', { name: /poisci/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/3-64 znakov/i);
  });

  it('omrezna napaka -> "Omrezna napaka..."', async () => {
    fetchDeviceByDeviceId.mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR' })
    );
    listMeasurementsForDevice.mockResolvedValue({ measurements: [] });

    const user = userEvent.setup();
    render(<DeviceLookup />);
    await user.type(screen.getByPlaceholderText(/pixel-8-azur/i), 'x');
    await user.click(screen.getByRole('button', { name: /poisci/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/omrezna napaka/i);
  });
});

describe('DeviceLookup — auth gating', () => {
  it('gumb je disabled, ko ni prijavljen', () => {
    useAuth.mockReturnValue({ status: 'anon', user: null });
    render(<DeviceLookup />);
    const button = screen.getByRole('button', { name: /poisci/i });
    expect(button).toBeDisabled();
  });

  it('gumb je disabled, dokler je input prazen', () => {
    render(<DeviceLookup />);
    expect(screen.getByRole('button', { name: /poisci/i })).toBeDisabled();
  });
});
