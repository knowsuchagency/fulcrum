import { createApp } from '../../app'

/**
 * Test client for making requests to the Hono app.
 */
export interface TestAppClient {
  /** The Hono app instance */
  app: ReturnType<typeof createApp>

  /** Make a GET request */
  get: (path: string, headers?: Record<string, string>) => Promise<Response>

  /** Make a POST request with JSON body */
  post: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>

  /** Make a PATCH request with JSON body */
  patch: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>

  /** Make a PUT request with JSON body */
  put: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>

  /** Make a DELETE request */
  delete: (path: string, headers?: Record<string, string>) => Promise<Response>

  /** Make a request with full control */
  request: (path: string, init?: RequestInit) => Promise<Response>
}

/**
 * Creates a test client for the Hono app.
 * Uses Hono's native request method for testing without a real server.
 */
export function createTestApp(): TestAppClient {
  const app = createApp()

  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    const url = `http://localhost${path}`
    return app.request(url, init)
  }

  return {
    app,
    request,

    get: (path: string, headers?: Record<string, string>) => {
      return request(path, {
        method: 'GET',
        headers,
      })
    },

    post: (path: string, body?: unknown, headers?: Record<string, string>) => {
      return request(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    },

    patch: (path: string, body?: unknown, headers?: Record<string, string>) => {
      return request(path, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    },

    put: (path: string, body?: unknown, headers?: Record<string, string>) => {
      return request(path, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    },

    delete: (path: string, headers?: Record<string, string>) => {
      return request(path, {
        method: 'DELETE',
        headers,
      })
    },
  }
}
