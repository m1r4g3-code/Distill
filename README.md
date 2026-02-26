# Distill: WebExtract Engine

A high-performance, production-ready web extraction API designed for LLMs and AI Agents. Distill converts messy web pages into clean, structured Markdown and JSON data.

## 🚀 Features

- **Scrape**: Synchronous extraction of clean Markdown, metadata, and link maps.
- **Map**: Asynchronous site discovery to crawl and find all internal URLs.
- **Search**: Integrated web search (via Serper) with optional top-N scraping.
- **Agent Extract**: AI-powered structured data extraction using **Gemini 1.5 Flash**.
- **Reliability**: Built-in SSRF protection, robots.txt compliance, and rate limiting.
- **Intelligent Fetching**: Automatic fallback from HTTPX to Playwright for JS-heavy pages.

## 🛠 Tech Stack

- **Framework**: FastAPI (Python)
- **Database**: PostgreSQL (SQLAlchemy + AsyncPG)
- **AI**: Google Gemini API
- **Scraping**: HTTPX, Playwright, Trafilatura, Readability
- **Validation**: Pydantic

## 📋 Prerequisites

- Python 3.10+
- PostgreSQL
- Gemini API Key (from AI Studio)
- Serper API Key (optional, for search)

## ⚙️ Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/m1r4g3-code/Distill.git
   cd Distill
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment**:
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/webextract
   GEMINI_API_KEY=your_gemini_key
   SERPER_API_KEY=your_serper_key
   SECRET_KEY=your_secret_key
   ```

4. **Initialize Database**:
   ```bash
   python seed_api_key.py
   ```

## 🖥 Usage

Start the development server:
```bash
uvicorn app.main:app --reload
```

### API Endpoints

- `POST /api/v1/scrape`: Scrape a single URL.
- `POST /api/v1/map`: Start a site mapping job.
- `POST /api/v1/search`: Search and optionally scrape results.
- `POST /api/v1/agent/extract`: Extract structured JSON via Gemini.
- `GET /api/v1/jobs/{id}`: Check job status.
- `GET /api/v1/jobs/{id}/results`: Get job results.

## 🛡 Security & Compliance

- **SSRF Protection**: Blocks internal IP ranges and private networks.
- **Robots.txt**: Optional compliance toggle for all requests.
- **Rate Limiting**: Sliding window rate limiting per API key.

## 🤝 Contributors

- **m1r4g3-code**
- **Hephzibah** (Collaborator)

---
Built with ❤️ for the AI Developer community.
