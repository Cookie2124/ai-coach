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

## AI Setup (OpenRouter)

AiCoach uses [OpenRouter](https://openrouter.ai) for AI capabilities. Set your API key in `.env`:

```bash
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENROUTER_MODEL=openai/gpt-5.6-luna
```

You can also configure the API key and model in **Settings → AI** within the app.

The AI has full access to all your interconnected data: recovery, nutrition, training, academics, calendar, and discovered correlations.

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

Connect services through the **Integrations** page in the web app:

| Service | Connect Method | Data Imported |
|---------|---------------|---------------|
| WHOOP | OAuth or access token | Recovery, HRV, sleep, strain, all workouts |
| Google Calendar | OAuth or token | Events (matches, exams auto-detected) |
| Outlook Calendar | OAuth or token | Events |
| Gmail | OAuth or token | Recent emails for context |
| Outlook Email | OAuth or token | Recent emails for context |
| Strava | OAuth or token | Activities (running, cycling, etc.) |
| Garmin | OAuth or token | Activities |
| Apple Health | File import (XML/JSON) | Weight, sleep, heart rate, workouts |

**OAuth setup:** Add client credentials to `.env` for one-click connect. Without OAuth credentials, use manual token entry on each integration card.

OAuth callback URL: `http://localhost:3001/api/integrations/oauth/callback`

Environment variables — see `.env.example` for full list.

## License

Private — local use only.
