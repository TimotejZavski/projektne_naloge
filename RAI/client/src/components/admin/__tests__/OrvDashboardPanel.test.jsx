import { render, screen } from '@testing-library/react';

import OrvDashboardPanel from '../OrvDashboardPanel';
import {
  getOrvCourtLiveState,
  getOrvHealth,
  listOrvStreams,
} from '../../../api/orv';

jest.mock('../../../api/orv', () => ({
  buildOrvCourtLiveFeedUrl: jest.fn(() => 'http://orv.test/orv/courts/test-court-1/live/feed'),
  buildOrvCourtLiveHeatmapUrl: jest.fn(
    (courtId, team) => `http://orv.test/orv/courts/${courtId}/live/heatmap?team=${team}`
  ),
  getOrvCourtLiveState: jest.fn(),
  getOrvHealth: jest.fn(),
  listOrvStreams: jest.fn(),
}));

beforeEach(() => {
  getOrvHealth.mockReset();
  listOrvStreams.mockReset();
  getOrvCourtLiveState.mockReset();
});

it('prikaze ORV live metrike in zankan stream', async () => {
  getOrvHealth.mockResolvedValue({ status: 'ok' });
  listOrvStreams.mockResolvedValue({
    streams: [{ id: 'demo', url: 'http://orv.test/streams/demo' }],
  });
  getOrvCourtLiveState.mockResolvedValue({
    status: 'ZASEDENO',
    players: 6,
    frame: 120,
  });

  render(<OrvDashboardPanel />);

  expect(await screen.findByText('ZASEDENO')).toBeInTheDocument();
  expect(screen.getByText('6')).toBeInTheDocument();
  expect(screen.getByText('120')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /odpri zankan video/i })).toHaveAttribute(
    'href',
    'http://orv.test/streams/demo'
  );
});

it('ostane uporaben, ko ORV ni dosegljiv', async () => {
  getOrvHealth.mockRejectedValue(new Error('offline'));
  listOrvStreams.mockResolvedValue({ streams: [] });
  getOrvCourtLiveState.mockResolvedValue(null);

  render(<OrvDashboardPanel />);

  expect(await screen.findByText('OFFLINE')).toBeInTheDocument();
  expect(screen.getByText(/ORV video se prikaze/i)).toBeInTheDocument();
});
