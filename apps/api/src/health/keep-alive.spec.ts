import { keepAliveTarget } from './keep-alive.service.js';

const base = {
  NODE_ENV: 'production' as const,
  KEEP_ALIVE_ENABLED: true,
  KEEP_ALIVE_URL: undefined,
  RENDER_EXTERNAL_URL: 'https://myshop-api.onrender.com',
};

describe('keepAliveTarget', () => {
  it('pings /api/health on the Render public URL in production', () => {
    expect(keepAliveTarget(base)).toBe('https://myshop-api.onrender.com/api/health');
  });

  it('prefers KEEP_ALIVE_URL and trims trailing slashes', () => {
    expect(keepAliveTarget({ ...base, KEEP_ALIVE_URL: 'https://api.myshop.uz/' })).toBe(
      'https://api.myshop.uz/api/health',
    );
  });

  it('is off outside production, when disabled or without a public URL', () => {
    expect(keepAliveTarget({ ...base, NODE_ENV: 'development' })).toBeNull();
    expect(keepAliveTarget({ ...base, KEEP_ALIVE_ENABLED: false })).toBeNull();
    expect(keepAliveTarget({ ...base, RENDER_EXTERNAL_URL: undefined })).toBeNull();
  });
});
