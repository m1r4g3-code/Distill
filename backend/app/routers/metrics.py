import time
import asyncio
from collections import defaultdict
from fastapi import APIRouter, Response

router = APIRouter(tags=["metrics"])

# thread-safe module-level storage
metrics_lock = asyncio.Lock()

# Counters
counters = {
    "crawlclean_jobs_total": defaultdict(int),
    "crawlclean_fetch_total": defaultdict(int),
    "crawlclean_playwright_fallback_total": 0,
    "crawlclean_cache_hits_total": 0,
    "crawlclean_robots_blocked_total": 0,
    "crawlclean_ssrf_blocked_total": 0,
    "crawlclean_rate_limit_total": 0,
    "crawlclean_active_jobs": defaultdict(int),
}

# Rolling 5-minute durations
durations = []

def record_fetch_duration(duration_ms: int):
    now = time.time()
    durations.append((now, duration_ms))

async def prune_durations():
    now = time.time()
    cutoff = now - 300 # 5 minutes
    global durations
    async with metrics_lock:
        durations = [(t, d) for t, d in durations if t > cutoff]

def calculate_percentiles():
    if not durations:
        return {"p50": 0, "p95": 0, "p99": 0}
    sorted_d = sorted([d for _, d in durations])
    n = len(sorted_d)
    return {
        "p50": sorted_d[int(n * 0.5)],
        "p95": sorted_d[int(n * 0.95)],
        "p99": sorted_d[int(n * 0.99)],
    }

def format_labels(labels: dict) -> str:
    if not labels:
        return ""
    parts = [f'{k}="{v}"' for k, v in labels.items()]
    return "{" + ",".join(parts) + "}"

@router.get("/metrics", response_class=Response)
async def get_metrics():
    await prune_durations()
    lines = []
    
    async with metrics_lock:
        # Counters
        for k, v in counters["crawlclean_jobs_total"].items():
            job_type, status = k.split("::")
            lines.append(f'crawlclean_jobs_total{{type="{job_type}",status="{status}"}} {v}')
            
        for k, v in counters["crawlclean_fetch_total"].items():
            renderer, status_code = k.split("::")
            lines.append(f'crawlclean_fetch_total{{renderer="{renderer}",status_code="{status_code}"}} {v}')

        lines.append(f'crawlclean_playwright_fallback_total {counters["crawlclean_playwright_fallback_total"]}')
        lines.append(f'crawlclean_cache_hits_total {counters["crawlclean_cache_hits_total"]}')
        lines.append(f'crawlclean_robots_blocked_total {counters["crawlclean_robots_blocked_total"]}')
        lines.append(f'crawlclean_ssrf_blocked_total {counters["crawlclean_ssrf_blocked_total"]}')
        lines.append(f'crawlclean_rate_limit_total {counters["crawlclean_rate_limit_total"]}')
        
        pct = calculate_percentiles()
        lines.append(f'crawlclean_fetch_duration_ms_p50 {pct["p50"]}')
        lines.append(f'crawlclean_fetch_duration_ms_p95 {pct["p95"]}')
        lines.append(f'crawlclean_fetch_duration_ms_p99 {pct["p99"]}')
        
        for job_type, v in counters["crawlclean_active_jobs"].items():
            lines.append(f'crawlclean_active_jobs{{type="{job_type}"}} {v}')

    return Response(content="\n".join(lines) + "\n", media_type="text/plain")

async def increment_counter(metric_name: str, labels: dict = None, value: int = 1):
    async with metrics_lock:
        if labels:
            if metric_name == "crawlclean_jobs_total":
                key = f"{labels['type']}::{labels['status']}"
                counters[metric_name][key] += value
            elif metric_name == "crawlclean_fetch_total":
                key = f"{labels['renderer']}::{labels.get('status_code', 'error')}"
                counters[metric_name][key] += value
            elif metric_name == "crawlclean_active_jobs":
                key = labels["type"]
                counters[metric_name][key] += value
        else:
            counters[metric_name] += value
