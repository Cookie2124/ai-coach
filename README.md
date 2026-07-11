# AiCoach

AI-powered personal operating system for student athletes. Runs entirely locally on your computer or home server — no cloud dependency required.

## Features

- **Interconnected Intelligence** — Every metric influences every recommendation. Recovery affects training, exams affect load, nutrition affects recovery predictions.
- **Local-First** — All data stored in SQLite on your machine. Works offline.
- **AI Coach** — Conversational assistant with full access to all your data (powered by Ollama locally).
- **WHOOP Integration** — Import recovery, sleep, strain, and workout data.
- **Nutrition Tracking** — Natural language meal logging with AI macro estimation.
- **Training Analytics** — Acute/chronic load, ACWR, overtraining detection.
- **Recovery Analytics** — Trends, readiness scores, burnout risk, sleep debt.
- **Academic Tracking** — Assignments, exams, study sessions with workload scoring.
- **Correlation Engine** — Automatically discovers relationships across all data.
- **Composite Scores** — Athletic Readiness, Student Athlete Score, Performance Potential.
- **Reports** — Daily, weekly, monthly interconnected summaries.
- **Responsive UI** — Works on desktop, tablet, and mobile with dark/light mode.

## Quick Start

### Prerequisites

- Node.js 18+
- (Optional) [Ollama](https://ollama.ai) for full AI capabilities

### Install & Run

```bash
# Install all dependencies
npm run install:all

# Start development (server + client)
npm run dev
```

Open http://localhost:5173 in your browser. The API runs on http://localhost:3001.

### Production

```bash
npm run build
npm start
```

Serves the built frontend from the API server at http://localhost:3001.

## AI Setup (Optional)

Install Ollama and pull a model:

```bash
ollama pull llama3.2
```

AiCoach connects to Ollama at `localhost:11434` by default. Without Ollama, the app still works with a rule-based fallback that uses all interconnected data.

Environment variables:
- `OLLAMA_URL` — Ollama API URL (default: http://localhost:11434)
- `OLLAMA_MODEL` — Model name (default: llama3.2)
- `AICOACH_DATA_DIR` — Data directory (default: ./data)
- `JWT_SECRET` — Auth secret (change in production)
- `PORT` — Server port (default: 3001)

## Architecture

```
AiCoach/
├── server/          # Express + SQLite backend
│   └── src/
│       ├── db/          # Database schema & initialization
│       ├── routes/      # API endpoints
│       └── services/
│           ├── analytics/     # Unified analytics engine
│           ├── correlation/   # Pattern discovery
│           ├── predictions/   # Forecasts & recommendations
│           ├── ai/            # Local AI assistant
│           ├── integrations/  # WHOOP, calendar connectors
│           └── reports/       # Report generation
├── client/          # React + Vite + Tailwind frontend
│   └── src/
│       ├── pages/       # Dashboard, Chat, Nutrition, etc.
│       ├── components/  # UI components
│       └── services/    # API client
└── data/            # Local SQLite database (created on first run)
```

## Data Storage

All data is stored permanently in `./data/aicoach.db`. This includes:
- Recovery, sleep, HRV, strain history
- Nutrition and meal logs
- Training and strength records
- Weight history
- Academic items and study sessions
- Calendar events
- AI conversations and memories
- Discovered correlations and insights
- Generated reports and predictions

## Integrations

| Service | Status | Data Imported |
|---------|--------|---------------|
| WHOOP | Supported | Recovery, HRV, sleep, strain, workouts |
| Google Calendar | Configurable | Events |
| Outlook Calendar | Configurable | Events |
| Apple Health | Optional | Health metrics |
| Garmin | Optional | Activity data |
| Strava | Optional | Activity data |

The app functions fully without any integrations — connectors enhance data when available.

## License

Private — local use only.
