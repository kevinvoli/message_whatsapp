import '@testing-library/jest-dom';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('react-leaflet', () => ({
  MapContainer: () => null,
  TileLayer: () => null,
  Marker: () => null,
  Popup: () => null,
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: false,
    disconnect: vi.fn(),
    id: 'mock-socket-id',
  })),
}));
