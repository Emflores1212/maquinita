export type ApiEnvelope<T> = {
  ok: boolean
  message?: string | null
  data: T
}

function extractError(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    return payload
  }
  if (payload && typeof payload === 'object') {
    const candidate = payload as { detail?: unknown; message?: unknown }
    if (typeof candidate.detail === 'string') {
      return candidate.detail
    }
    if (typeof candidate.message === 'string') {
      return candidate.message
    }
  }
  return fallback
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init.body instanceof FormData ? init.headers : {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : undefined

  if (!response.ok) {
    throw new Error(extractError(payload, `HTTP ${response.status}`))
  }

  return (payload as ApiEnvelope<T>).data
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path)
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: formData,
  })
}
