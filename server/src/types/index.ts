import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
  return uuidv4();
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface UserProfile {
  user_id: string;
  date_of_birth?: string;
  height_cm?: number;
  sport: string;
  position?: string;
  team?: string;
  goal_type: 'bulking' | 'cutting' | 'maintenance' | 'performance';
  target_weight_kg?: number;
  target_calories?: number;
  target_protein_g?: number;
  target_carbs_g?: number;
  target_fat_g?: number;
  target_water_ml: number;
  dietary_restrictions: string[];
  favorite_foods: string[];
  preferences: Record<string, unknown>;
}

export interface RecoveryEntry {
  id: string;
  user_id: string;
  date: string;
  recovery_score?: number;
  hrv_ms?: number;
  resting_hr?: number;
  respiratory_rate?: number;
  strain?: number;
  calories_burned?: number;
  source: string;
}

export interface SleepEntry {
  id: string;
  user_id: string;
  date: string;
  duration_hours?: number;
  performance_pct?: number;
  consistency_pct?: number;
  efficiency_pct?: number;
  deep_sleep_hours?: number;
  rem_sleep_hours?: number;
  light_sleep_hours?: number;
  awake_hours?: number;
  sleep_debt_hours?: number;
  source: string;
}

export interface Workout {
  id: string;
  user_id: string;
  date: string;
  activity_type: string;
  duration_minutes?: number;
  strain?: number;
  calories?: number;
  distance_km?: number;
  avg_hr?: number;
  max_hr?: number;
  notes?: string;
  source: string;
}

export interface Meal {
  id: string;
  user_id: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  meal_type: string;
  logged_at: string;
}

export interface WeightEntry {
  id: string;
  user_id: string;
  weight_kg: number;
  body_fat_pct?: number;
  recorded_at: string;
}

export interface StrengthEntry {
  id: string;
  user_id: string;
  exercise: string;
  weight_kg?: number;
  reps?: number;
  sets: number;
  estimated_1rm?: number;
  recorded_at: string;
}

export interface AcademicItem {
  id: string;
  user_id: string;
  title: string;
  type: 'assignment' | 'exam' | 'project' | 'other';
  subject?: string;
  due_date?: string;
  completed: boolean;
  estimated_hours?: number;
  actual_hours: number;
  priority: string;
  stress_level: number;
}

export interface LifestyleEntry {
  id: string;
  user_id: string;
  date: string;
  water_ml: number;
  mood?: number;
  energy_level?: number;
  caffeine_mg: number;
}

export interface DailyScores {
  athletic_readiness?: number;
  growth_score?: number;
  bulk_quality?: number;
  student_athlete_score?: number;
  performance_potential?: number;
  fatigue_score?: number;
  academic_stress?: number;
  school_life_balance?: number;
  hydration_score?: number;
  readiness_forecast?: number;
}

export interface UnifiedContext {
  profile: UserProfile | null;
  latestWeight: WeightEntry | null;
  weightTrend: { weeklyChange: number; monthlyChange: number; trend: string };
  recovery: RecoveryEntry[];
  sleep: SleepEntry[];
  workouts: Workout[];
  nutrition: { today: MealTotals; week: MealTotals; month: MealTotals };
  strength: StrengthEntry[];
  academic: { items: AcademicItem[]; workloadScore: number; stressEstimate: number };
  lifestyle: LifestyleEntry[];
  calendar: { upcoming: unknown[]; hasMatchToday: boolean; hasExamThisWeek: boolean };
  scores: DailyScores;
  correlations: { metric_a: string; metric_b: string; correlation: number; description: string }[];
  insights: { title: string; content: string; severity: string }[];
  predictions: { type: string; value: number; confidence: number; date: string }[];
}

export interface MealTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  mealCount: number;
}

export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export const ACTIVITY_TYPES = [
  'running', 'rugby', 'gym', 'strength_trainer', 'weightlifting',
  'walking', 'cycling', 'swimming', 'other'
] as const;

export const EXERCISES = [
  'bench_press', 'squat', 'deadlift', 'pushups', 'pullups', 'other'
] as const;

export const INTEGRATION_PROVIDERS = [
  'whoop', 'google_calendar', 'outlook_calendar',
  'gmail', 'outlook_email', 'apple_health', 'garmin', 'strava'
] as const;
