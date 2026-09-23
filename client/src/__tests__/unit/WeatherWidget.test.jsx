import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import API from '../../services/api';
import WeatherWidget from '../../components/WeatherWidget';
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));

const weather = { main: { temp: 28, temp_min: 25, temp_max: 30, humidity: 70, feels_like: 29 },
  weather: [{ description: 'cielo despejado', main: 'Clear' }], sys: { sunrise: 0, sunset: 100 }, name: 'Ciudad' };

describe('WeatherWidget through authenticated server proxy', () => {
  beforeEach(() => vi.clearAllMocks());
  it('shows loading while the server responds', () => {
    API.get.mockImplementation(() => new Promise(() => {}));
    render(<WeatherWidget location="Ciudad" configured />);
    expect(screen.getByText(/cargando clima/i)).toBeInTheDocument();
  });
  it('uses the server without sending an API key or location', async () => {
    API.get.mockResolvedValue({ data: weather });
    render(<WeatherWidget location="Ciudad" configured />);
    await waitFor(() => expect(API.get).toHaveBeenCalledWith('/proxy/weather'));
    await waitFor(() => expect(screen.getByText(/cielo despejado/i)).toBeInTheDocument());
  });
  it('stays hidden when no key is configured', () => {
    const { container } = render(<WeatherWidget location="Ciudad" configured={false} />);
    expect(container.firstChild).toBeNull();
    expect(API.get).not.toHaveBeenCalled();
  });
  it('hides the widget on a server error', async () => {
    API.get.mockRejectedValue(new Error('Unavailable'));
    const { container } = render(<WeatherWidget location="Ciudad" configured />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
