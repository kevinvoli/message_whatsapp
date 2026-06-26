export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json() as { message?: string };
      message = body.message ?? message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}
