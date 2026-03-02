/* ===================================================================
   API Client — Real backend at NEXT_PUBLIC_API_URL
   =================================================================== */

import type {
    ScrapeRequest,
    ScrapeResponse,
    MapRequest,
    MapResponse,
    SearchRequest,
    SearchResponse,
    AgentExtractRequest,
    AgentExtractResponse,
    JobStatusResponse,
    MapResultsResponse,
    ExtractionResultsResponse,
    ApiKeyCreate,
    ApiKeyResponse,
    ApiKeyCreateResponse,
    ApiKeyUpdate,
} from "@/types";

import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── API Error ──
export class ApiClientError extends Error {
    code: string;
    requestId: string;
    status: number;
    details: Record<string, unknown>;

    constructor(opts: {
        code: string;
        message: string;
        request_id?: string;
        status: number;
        details?: Record<string, unknown>;
    }) {
        super(opts.message);
        this.code = opts.code;
        this.requestId = opts.request_id || "unknown";
        this.status = opts.status;
        this.details = opts.details || {};
    }
}

// ── Internal fetch helper ──
async function apiFetch<T>(
    endpoint: string,
    options: RequestInit = {},
    auth?: { apiKey?: string; adminKey?: string }
): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
    };

    if (auth?.apiKey) {
        headers["X-API-Key"] = auth.apiKey;
    }
    if (auth?.adminKey) {
        headers["X-Admin-Key"] = auth.adminKey;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    // DELETE 204 has no body
    if (res.status === 204) {
        return undefined as T;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const errObj = data.error || data.detail?.error || data;
        const err = new ApiClientError({
            code: errObj.code || "UNKNOWN_ERROR",
            message: errObj.message || errObj.detail || res.statusText,
            request_id: errObj.request_id,
            status: res.status,
            details: errObj.details,
        });

        // Global error toasts
        if (res.status === 401) {
            toast.error("Authentication failed. Check your API key.");
        } else if (res.status === 429) {
            toast.error("Rate limit exceeded. Try again in a moment.");
        } else if (res.status === 422) {
            toast.error(err.message || "Validation error");
        } else if (res.status >= 500) {
            toast.error("Something went wrong. Please try again.");
        }

        throw err;
    }

    return data as T;
}

// ── Scrape (synchronous) ──
export async function scrapeUrl(
    params: ScrapeRequest,
    apiKey: string
): Promise<ScrapeResponse> {
    return apiFetch<ScrapeResponse>("/api/v1/scrape", {
        method: "POST",
        body: JSON.stringify(params),
    }, { apiKey });
}

// ── Map (async — returns job_id) ──
export async function mapWebsite(
    params: MapRequest,
    apiKey: string
): Promise<MapResponse> {
    return apiFetch<MapResponse>("/api/v1/map", {
        method: "POST",
        body: JSON.stringify(params),
    }, { apiKey });
}

// ── Search (synchronous) ──
export async function searchWeb(
    params: SearchRequest,
    apiKey: string
): Promise<SearchResponse> {
    return apiFetch<SearchResponse>("/api/v1/search", {
        method: "POST",
        body: JSON.stringify(params),
    }, { apiKey });
}

// ── Agent Extract (async — returns job_id) ──
export async function agentExtract(
    params: AgentExtractRequest,
    apiKey: string
): Promise<AgentExtractResponse> {
    return apiFetch<AgentExtractResponse>("/api/v1/agent/extract", {
        method: "POST",
        body: JSON.stringify(params),
    }, { apiKey });
}

// ── Jobs ──
export async function getJobStatus(
    jobId: string,
    apiKey: string
): Promise<JobStatusResponse> {
    return apiFetch<JobStatusResponse>(`/api/v1/jobs/${jobId}`, {
        method: "GET",
    }, { apiKey });
}

export async function getJobResults(
    jobId: string,
    apiKey: string
): Promise<MapResultsResponse | ExtractionResultsResponse> {
    return apiFetch<MapResultsResponse | ExtractionResultsResponse>(
        `/api/v1/jobs/${jobId}/results`,
        { method: "GET" },
        { apiKey }
    );
}

// ── API Keys (admin) ──
export async function listApiKeys(
    adminKey: string
): Promise<ApiKeyResponse[]> {
    return apiFetch<ApiKeyResponse[]>("/api/v1/admin/keys", {
        method: "GET",
    }, { adminKey });
}

export async function createApiKey(
    params: ApiKeyCreate,
    adminKey: string
): Promise<ApiKeyCreateResponse> {
    return apiFetch<ApiKeyCreateResponse>("/api/v1/admin/keys", {
        method: "POST",
        body: JSON.stringify(params),
    }, { adminKey });
}

export async function updateApiKey(
    keyId: string,
    params: ApiKeyUpdate,
    adminKey: string
): Promise<ApiKeyResponse> {
    return apiFetch<ApiKeyResponse>(`/api/v1/admin/keys/${keyId}`, {
        method: "PATCH",
        body: JSON.stringify(params),
    }, { adminKey });
}

export async function revokeApiKey(
    keyId: string,
    adminKey: string
): Promise<void> {
    return apiFetch<void>(`/api/v1/admin/keys/${keyId}`, {
        method: "DELETE",
    }, { adminKey });
}

// ── Auth Sync & User API Keys ──
export async function syncAuth(token: string): Promise<{ key: ApiKeyCreateResponse | null; existing: boolean }> {
    return apiFetch<{ key: ApiKeyCreateResponse | null; existing: boolean }>("/api/v1/auth/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
    });
}

export async function listUserApiKeys(token: string): Promise<ApiKeyResponse[]> {
    return apiFetch<ApiKeyResponse[]>("/api/v1/auth/keys", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    });
}

export async function createUserApiKey(params: ApiKeyCreate, token: string): Promise<ApiKeyCreateResponse> {
    return apiFetch<ApiKeyCreateResponse>("/api/v1/auth/keys", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
    });
}

export async function revokeUserApiKey(keyId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/auth/keys/${keyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
    });
}

// ── Health ──
export async function checkHealth(): Promise<{
    status: string;
    version: string;
    dependencies: Record<string, string>;
}> {
    return apiFetch("/health", { method: "GET" });
}
