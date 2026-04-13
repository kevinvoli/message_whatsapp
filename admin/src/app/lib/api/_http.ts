// admin/src/app/lib/api/_http.ts
// Utilitaire HTTP interne — ne pas importer directement depuis les pages

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        if (response.status === 401 && typeof window !== 'undefined') {
            window.location.replace('/login');
        }
        let errorMessage: string;
        try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json') && response.status !== 204) {
                const errorData = await response.json();
                errorMessage = errorData.message || JSON.stringify(errorData);
            } else {
                errorMessage = response.statusText || `An unknown error occurred (Status: ${response.status})`;
            }
        } catch {
            errorMessage = response.statusText || `An unknown error occurred (Status: ${response.status})`;
        }
        throw new Error(errorMessage);
    }
    return response.json() as Promise<T>;
}
