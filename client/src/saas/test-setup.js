import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unexpected I/O is a test failure, including legacy API imports.
globalThis.fetch = vi.fn(() => { throw new Error('Unexpected network access'); });
afterEach(() => cleanup());
