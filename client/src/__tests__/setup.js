import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import * as api from '../services/api';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock HTMLCanvasElement for AnimatedBackground
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
}));

// Mock localStorage with actual storage
class LocalStorageMock {
  constructor() {
    this.store = {};
  }

  clear() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] || null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }

  get length() {
    return Object.keys(this.store).length;
  }

  key(index) {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }
}

global.localStorage = new LocalStorageMock();

// Allow running tests against a real backend by setting VITEST_REAL_API=true
const useRealApi = process.env.VITEST_REAL_API === 'true' || process.env.REAL_API === 'true';

if (!useRealApi) {
  // Mock fetch to avoid accidental network calls in default test runs
  global.fetch = vi.fn();

  // Mock ResizeObserver for libraries like recharts (JSDOM doesn't implement it)
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;

  // --- Mock API calls to avoid network requests and 401 noise in tests ---
  // NOTE: these provide minimal, stable shapes used by components under test.

  // Provide simple resolved values for settings and dashboard endpoints
  vi.spyOn(api, 'getSettings').mockResolvedValue({ data: { companyName: 'AutoParts', widgets: { clock: true, weather: true }, toastPosition: 'top-right' } });
  vi.spyOn(api, 'getNotificationPreferences').mockResolvedValue({ data: { data: {} } });
  vi.spyOn(api, 'getAllDashboardData').mockResolvedValue({ data: { stats: {}, salesByDay: [], topProducts: [], salesByPayment: [] } });
  vi.spyOn(api, 'getDashboardStats').mockResolvedValue({ data: { today: { total: 0, transactions: 0 }, inventory: { totalProducts: 10, lowStockProducts: 1 }, customers: 0 } });
  vi.spyOn(api, 'getSalesByDay').mockResolvedValue({ data: [] });
  vi.spyOn(api, 'getTopProducts').mockResolvedValue({ data: [] });
  vi.spyOn(api, 'getSalesByPayment').mockResolvedValue({ data: [] });
  vi.spyOn(api.default, 'get').mockImplementation((url) => {
    if (url === '/version') return Promise.resolve({ data: { version: '2.0.1' } });
    throw new Error(`Unexpected API request in frontend tests: ${url}`);
  });
} else {
  // When running against a real API, perform a login using seeded credentials and store token
  // Do not mock fetch here so real network calls succeed.
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;

  // Try to login to backend (assumes backend is running on localhost:5000 and seed was executed)
  (async () => {
    try {
      const loginEmail = process.env.VITEST_TEST_EMAIL;
      const loginPassword = process.env.VITEST_TEST_PASSWORD;
      if (!loginEmail || !loginPassword) {
        console.warn('Test setup: configure VITEST_TEST_EMAIL and VITEST_TEST_PASSWORD for real API login');
        return;
      }
      // Use node-fetch or axios via import; use globalThis.fetch if available in environment
      const loginUrl = 'http://localhost:5000/api/auth/login';
      let token = null;

      // prefer fetch if available (jsdom may polyfill), otherwise attempt axios
      if (typeof fetch === 'function') {
        const res = await fetch(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        });
        const json = await res.json();
        token = json.token || json.accessToken || json.data?.token || json.data?.accessToken;
      } else {
        // dynamic import axios
        const axios = await import('axios');
        const res = await axios.post('http://localhost:5000/api/auth/login', { email: loginEmail, password: loginPassword });
        token = res.data.token || res.data.accessToken;
      }

      if (token) {
        try {
          global.localStorage.setItem('token', token);
          console.log('Test setup: logged into real API and stored token in localStorage');
        } catch (e) {
          // ignore
        }
      } else {
        console.warn('Test setup: could not obtain token from real API login response');
      }
    } catch (e) {
      // If login fails, warn but continue — tests may still mock or handle 401s.
      // eslint-disable-next-line no-console
      console.warn('Test setup: real API login failed:', e?.message || e);
    }
  })();
}
