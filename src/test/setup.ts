import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

// Environment the app validates at import time. Tests never touch a real
// Supabase project, so these are structurally valid placeholders.
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key-000000000000000000');

// jsdom implements neither of these, and several hooks reach for them.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}
