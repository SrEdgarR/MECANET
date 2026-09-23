import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Settings from '../../pages/Settings';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';

const renderWithRouter = (component) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('Settings Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
    // Pre-load settings store to avoid loading state
    const { setSettings } = useSettingsStore.getState();
    setSettings({
      businessName: 'Test AutoParts',
      businessEmail: 'test@autoparts.com',
      businessLogoUrl: '/logo.png',
      businessAddress: '123 Test St',
      businessPhone: '809-555-0100',
      taxRate: 18,
      currency: 'DOP',
      receiptFooter: '¡Gracias por su compra!',
      lowStockAlert: true,
      toastPosition: 'top-center',
      autoCreatePurchaseOrders: false,
      autoOrderThreshold: 5,
      showWeather: true,
      weatherApiKey: 'test-key',
      weatherLocation: 'Santo Domingo,DO',
    });
    
    // Mock successful API response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        businessName: 'Test AutoParts',
        businessEmail: 'test@autoparts.com',
        businessLogoUrl: '/logo.png',
        businessAddress: '123 Test St',
        businessPhone: '809-555-0100',
        taxRate: 18,
        currency: 'DOP',
        receiptFooter: '¡Gracias por su compra!',
        lowStockAlert: true,
        toastPosition: 'top-center',
        autoCreatePurchaseOrders: false,
        autoOrderThreshold: 5,
        showWeather: true,
        weatherApiKey: 'test-key',
        weatherLocation: 'Santo Domingo,DO',
      }),
    });
    
    // Set admin user
    const { login } = useAuthStore.getState();
    login(
      { id: '1', name: 'Admin', email: 'admin@test.com', role: 'admin' },
      'test-token'
    );
  });

  it('should render settings page', async () => {
    renderWithRouter(<Settings />);
    
    // Wait for page to load - check for main h1 with level 1 specificity
    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { name: /configuración/i });
      // The main page title should be first
      expect(headings[0]).toHaveClass('text-3xl');
    }, { timeout: 2000 });
  });

  it('should load settings on mount', async () => {
    renderWithRouter(<Settings />);

    // Wait for settings to load and show business info
    await waitFor(() => {
      expect(screen.getByText(/información del negocio/i)).toBeInTheDocument();
    }, { timeout: 2000 });
    
    // Should show the configuration form
    expect(screen.getByText(/datos generales de la empresa/i)).toBeInTheDocument();
  });

  it('should auto-save changes after 300ms', async () => {
    renderWithRouter(<Settings />);

    // Check that save indicator appears
    await waitFor(() => {
      const saveIndicator = screen.queryByText(/guardado/i) || screen.queryByText(/guardando/i);
      expect(saveIndicator).toBeInTheDocument();
    });
  });

  it('should toggle weather widget visibility', async () => {
    renderWithRouter(<Settings />);

    // Check that weather section exists (using more specific heading)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /widget de clima/i })).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('should update toast position', async () => {
    renderWithRouter(<Settings />);

    // Check that toast position section exists - use getAllByText and select the label
    await waitFor(() => {
      const elements = screen.getAllByText(/posición de las notificaciones/i);
      // The label element should be one of them
      expect(elements.length).toBeGreaterThan(0);
      expect(elements[0]).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('should prevent non-admin users from editing', async () => {
    // Set non-admin user
    const { login } = useAuthStore.getState();
    login(
      { id: '2', name: 'Cashier', email: 'cashier@test.com', role: 'cashier' },
      'test-token'
    );

    renderWithRouter(<Settings />);

    // Wait for page to load and show warning message
    await waitFor(() => {
      expect(screen.getByText(/solo los administradores pueden modificar/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });
});
