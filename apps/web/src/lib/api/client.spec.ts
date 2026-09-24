import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, errorMessageKey } from './api-error';
import { apiRequest } from './client';

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn<typeof fetch>(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('calls /api prefixed URL and returns JSON', async () => {
    const fetchMock = mockFetch(async () => Response.json({ status: 'ok' }));
    await expect(apiRequest('/health', { baseUrl: 'https://api.example.com' })).resolves.toEqual({
      status: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/health',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
    );
  });

  it('serializes JSON body', async () => {
    const fetchMock = mockFetch(async () => Response.json({ ok: true }));
    await apiRequest('sales', { method: 'POST', body: { a: 1 }, baseUrl: 'http://x' });
    const init = fetchMock.mock.calls[0]?.[1] ?? {};
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('maps backend error body to ApiError with code', async () => {
    mockFetch(async () =>
      Response.json(
        {
          error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock', details: { left: 1 } },
          statusCode: 409,
          path: '/api/sales',
          timestamp: new Date().toISOString(),
          requestId: 'req-1',
        },
        { status: 409 },
      ),
    );
    const error = await apiRequest('/sales', { baseUrl: 'http://x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      status: 409,
      details: { left: 1 },
      requestId: 'req-1',
    });
    expect(errorMessageKey(error)).toBe('errors.INSUFFICIENT_STOCK');
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(apiRequest('/health', { baseUrl: 'http://x' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('maps unexpected error payloads to UNKNOWN', async () => {
    mockFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(apiRequest('/health', { baseUrl: 'http://x' })).rejects.toMatchObject({
      code: 'UNKNOWN',
      status: 502,
    });
  });

  it('errorMessageKey falls back to UNKNOWN for non-API errors', () => {
    expect(errorMessageKey(new Error('boom'))).toBe('errors.UNKNOWN');
  });
});

const authResponse = (access: string, refresh: string) => ({
  accessToken: access,
  refreshToken: refresh,
  expiresIn: 900,
  me: {},
});
const unauthorized = () =>
  Response.json(
    {
      error: { code: 'UNAUTHORIZED', message: 'expired' },
      statusCode: 401,
      path: '',
      timestamp: '',
    },
    { status: 401 },
  );

describe('apiRequest with authentication', () => {
  afterEach(async () => {
    const { tokenStore } = await import('../auth/token-store');
    tokenStore.clear();
  });

  it('attaches the bearer token', async () => {
    const { tokenStore } = await import('../auth/token-store');
    tokenStore.set({ accessToken: 'A1', refreshToken: 'R1' });
    const fetchMock = mockFetch(async () => Response.json({ ok: true }));
    await apiRequest('/auth/me', { baseUrl: 'http://x' });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer A1' });
  });

  it('refreshes an expired access token once and retries the request', async () => {
    const { tokenStore } = await import('../auth/token-store');
    tokenStore.set({ accessToken: 'OLD', refreshToken: 'R1' });
    const fetchMock = mockFetch(async () => Response.json({}));
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(Response.json(authResponse('NEW', 'R2')))
      .mockResolvedValueOnce(Response.json({ role: 'OWNER' }));

    await expect(apiRequest('/auth/me', { baseUrl: 'http://x' })).resolves.toEqual({
      role: 'OWNER',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://x/api/auth/refresh');
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer NEW' });
    expect(tokenStore.getRefreshToken()).toBe('R2');
  });

  it('clears the session when refresh fails', async () => {
    const { tokenStore } = await import('../auth/token-store');
    tokenStore.set({ accessToken: 'OLD', refreshToken: 'R1' });
    const fetchMock = mockFetch(async () => unauthorized());
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(
      Response.json(
        {
          error: { code: 'INVALID_REFRESH_TOKEN', message: 'x' },
          statusCode: 401,
          path: '',
          timestamp: '',
        },
        { status: 401 },
      ),
    );

    await expect(apiRequest('/auth/me', { baseUrl: 'http://x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(tokenStore.getRefreshToken()).toBeNull();
    expect(tokenStore.getAccessToken()).toBeNull();
  });

  it('does not refresh for business errors', async () => {
    const { tokenStore } = await import('../auth/token-store');
    tokenStore.set({ accessToken: 'A', refreshToken: 'R' });
    const fetchMock = mockFetch(async () =>
      Response.json(
        { error: { code: 'FORBIDDEN', message: 'x' }, statusCode: 403, path: '', timestamp: '' },
        { status: 403 },
      ),
    );
    await expect(apiRequest('/users', { baseUrl: 'http://x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
