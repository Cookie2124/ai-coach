import Database, { type Database as DatabaseInstance } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.AICOACH_DATA_DIR || path.join(__dirname, '../../../data');
const DB_PATH = path.join(DATA_DIR, 'aicoach.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db: DatabaseInstance = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    -- User & Auth
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      date_of_birth TEXT,
      height_cm REAL,
      sport TEXT DEFAULT 'rugby',
      position TEXT,
      team TEXT,
      goal_type TEXT DEFAULT 'maintenance',
      target_weight_kg REAL,
      target_calories INTEGER,
      target_protein_g REAL,
      target_carbs_g REAL,
      target_fat_g REAL,
      target_water_ml INTEGER DEFAULT 3000,
      dietary_restrictions TEXT DEFAULT '[]',
      favorite_foods TEXT DEFAULT '[]',
      preferences TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Goals
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      target_value REAL,
      current_value REAL DEFAULT 0,
      unit TEXT,
      deadline TEXT,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Weight History
    CREATE TABLE IF NOT EXISTS weight_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weight_kg REAL NOT NULL,
      body_fat_pct REAL,
      notes TEXT,
      recorded_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Recovery & WHOOP Data
    CREATE TABLE IF NOT EXISTS recovery_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      recovery_score REAL,
      hrv_ms REAL,
      resting_hr INTEGER,
      respiratory_rate REAL,
      strain REAL,
      calories_burned INTEGER,
      source TEXT DEFAULT 'manual',
      raw_data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, date, source)
    );

    -- Sleep Data
    CREATE TABLE IF NOT EXISTS sleep_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      duration_hours REAL,
      performance_pct REAL,
      consistency_pct REAL,
      efficiency_pct REAL,
      deep_sleep_hours REAL,
      rem_sleep_hours REAL,
      light_sleep_hours REAL,
      awake_hours REAL,
      sleep_debt_hours REAL DEFAULT 0,
      source TEXT DEFAULT 'manual',
      raw_data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, date, source)
    );

    -- Training / Workouts
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      duration_minutes INTEGER,
      strain REAL,
      calories INTEGER,
      distance_km REAL,
      avg_hr INTEGER,
      max_hr INTEGER,
      notes TEXT,
      source TEXT DEFAULT 'manual',
      raw_data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Strength Tracking
    CREATE TABLE IF NOT EXISTS strength_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exercise TEXT NOT NULL,
      weight_kg REAL,
      reps INTEGER,
      sets INTEGER DEFAULT 1,
      estimated_1rm REAL,
      notes TEXT,
      recorded_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Nutrition / Meals
    CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      calories REAL DEFAULT 0,
      protein_g REAL DEFAULT 0,
      carbs_g REAL DEFAULT 0,
      fat_g REAL DEFAULT 0,
      fibre_g REAL DEFAULT 0,
      meal_type TEXT DEFAULT 'other',
      logged_at TEXT NOT NULL,
      ai_estimated INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Academic
    CREATE TABLE IF NOT EXISTS academic_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      subject TEXT,
      due_date TEXT,
      completed INTEGER DEFAULT 0,
      estimated_hours REAL,
      actual_hours REAL DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      stress_level INTEGER DEFAULT 5,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT,
      duration_minutes INTEGER NOT NULL,
      notes TEXT,
      recorded_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Lifestyle
    CREATE TABLE IF NOT EXISTS lifestyle_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      water_ml INTEGER DEFAULT 0,
      mood INTEGER,
      energy_level INTEGER,
      caffeine_mg INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );

    -- Calendar Events
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      event_type TEXT DEFAULT 'general',
      source TEXT DEFAULT 'manual',
      external_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Habits
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT,
      frequency TEXT DEFAULT 'daily',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed INTEGER DEFAULT 1,
      logged_at TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- AI Insights & Correlations
    CREATE TABLE IF NOT EXISTS ai_insights (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      related_metrics TEXT DEFAULT '[]',
      dismissed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS correlations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      metric_a TEXT NOT NULL,
      metric_b TEXT NOT NULL,
      correlation REAL NOT NULL,
      sample_size INTEGER,
      significance TEXT,
      description TEXT,
      discovered_at TEXT DEFAULT (datetime('now'))
    );

    -- Composite Scores (cached daily)
    CREATE TABLE IF NOT EXISTS daily_scores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      athletic_readiness REAL,
      growth_score REAL,
      bulk_quality REAL,
      student_athlete_score REAL,
      performance_potential REAL,
      fatigue_score REAL,
      academic_stress REAL,
      school_life_balance REAL,
      hydration_score REAL,
      readiness_forecast REAL,
      computed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );

    -- Predictions
    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prediction_type TEXT NOT NULL,
      target_date TEXT NOT NULL,
      predicted_value REAL,
      confidence REAL,
      factors TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Reports
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_type TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      content TEXT NOT NULL,
      generated_at TEXT DEFAULT (datetime('now'))
    );

    -- AI Conversations
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Memories (user-editable AI memory)
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Integration Config
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      enabled INTEGER DEFAULT 0,
      credentials TEXT DEFAULT '{}',
      last_sync TEXT,
      sync_status TEXT DEFAULT 'idle',
      config TEXT DEFAULT '{}',
      UNIQUE(user_id, provider)
    );

    -- Dashboard Layout
    CREATE TABLE IF NOT EXISTS dashboard_layout (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      widgets TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_pending_states (
      state TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      client_url TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_recovery_user_date ON recovery_entries(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_sleep_user_date ON sleep_entries(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, logged_at);
    CREATE INDEX IF NOT EXISTS idx_weight_user_date ON weight_entries(user_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_strength_user_date ON strength_entries(user_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_academic_user ON academic_items(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_lifestyle_user_date ON lifestyle_entries(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_scores_user_date ON daily_scores(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_calendar_user ON calendar_events(user_id, start_time);
  `);
}

export { DATA_DIR, DB_PATH };
