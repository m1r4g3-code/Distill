/* API utility types */

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiRequestConfig {
    method: HttpMethod;
    endpoint: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    per_page: number;
}
