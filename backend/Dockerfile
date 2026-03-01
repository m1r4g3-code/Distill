# Dockerfile for Distill v1.2.0 WebExtract Engine
FROM python:3.11-slim

# Prevent python from writing pyc files and buffering stdout
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=8000

# Set the working directory
WORKDIR /app

# Install system dependencies required by Playwright and psycopg2/PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy everything first so pip can find the app/ package
COPY . .

# Install python dependencies including playwright
RUN pip install --no-cache-dir pip setuptools wheel && \
    pip install --no-cache-dir ".[dev]" structlog PyMuPDF playwright-stealth

# Install Playwright browser and system dependencies
RUN playwright install chromium
RUN playwright install-deps chromium

# Run as non-root user for security
RUN useradd -m appuser && chown -R appuser /app /ms-playwright
USER appuser

# Expose the API port
EXPOSE 8000

# Start Uvicorn
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
