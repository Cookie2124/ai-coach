import { Router } from 'express';
import { db } from '../db/database.js';
import { generateId, estimate1RM } from '../types/index.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { estimateMealNutrition, logMeal } from '../services/nutrition/meals.js';

const router = Router();
router.use(authMiddleware);

// Meals
router.get('/meals', (req: AuthRequest, res) => {
  const date = req.query.date as string;
  let query = `SELECT * FROM meals WHERE user_id = ?`;
  const params: unknown[] = [req.userId!];
  if (date) { query += ` AND date(logged_at) = ?`; params.push(date); }
  query += ` ORDER BY logged_at DESC LIMIT 100`;
  res.json(db.prepare(query).all(...params));
});

router.post('/meals', (req: AuthRequest, res) => {
  const { description, meal_type, logged_at, calories, protein_g, carbs_g, fat_g, fibre_g } = req.body;
  const result = logMeal(req.userId!, description, { meal_type, logged_at, calories, protein_g, carbs_g, fat_g, fibre_g });
  res.json(result);
});

router.delete('/meals/:id', (req: AuthRequest, res) => {
  const result = db.prepare(`DELETE FROM meals WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId!);
  if (result.changes === 0) return res.status(404).json({ error: 'Meal not found' });
  res.json({ success: true });
});

// Weight
router.post('/weight', (req: AuthRequest, res) => {
  const { weight_kg, body_fat_pct, notes, recorded_at } = req.body;
  const id = generateId();
  db.prepare(`INSERT INTO weight_entries (id, user_id, weight_kg, body_fat_pct, notes, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.userId!, weight_kg, body_fat_pct, notes, recorded_at ?? new Date().toISOString());
  res.json({ id, weight_kg });
});

router.delete('/weight/:id', (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM weight_entries WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId!);
  res.json({ success: true });
});

// Workouts
router.get('/workouts', (req: AuthRequest, res) => {
  res.json(db.prepare(`SELECT * FROM workouts WHERE user_id = ? ORDER BY date DESC LIMIT 100`).all(req.userId!));
});

router.post('/workouts', (req: AuthRequest, res) => {
  const { date, activity_type, duration_minutes, strain, calories, distance_km, notes } = req.body;
  const id = generateId();
  db.prepare(`
    INSERT INTO workouts (id, user_id, date, activity_type, duration_minutes, strain, calories, distance_km, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.userId!, date ?? new Date().toISOString().split('T')[0], activity_type, duration_minutes, strain, calories, distance_km, notes);
  res.json({ id });
});

router.delete('/workouts/:id', (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM workouts WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId!);
  res.json({ success: true });
});

// Strength
router.get('/strength', (req: AuthRequest, res) => {
  res.json(db.prepare(`SELECT * FROM strength_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 100`).all(req.userId!));
});

router.post('/strength', (req: AuthRequest, res) => {
  const { exercise, weight_kg, reps, sets, notes, recorded_at } = req.body;
  const e1rm = weight_kg && reps ? estimate1RM(weight_kg, reps) : null;
  const id = generateId();
  db.prepare(`
    INSERT INTO strength_entries (id, user_id, exercise, weight_kg, reps, sets, estimated_1rm, notes, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.userId!, exercise, weight_kg, reps, sets ?? 1, e1rm, notes, recorded_at ?? new Date().toISOString());
  res.json({ id, estimated_1rm: e1rm });
});

// Recovery
router.get('/recovery', (req: AuthRequest, res) => {
  res.json(db.prepare(`SELECT * FROM recovery_entries WHERE user_id = ? ORDER BY date DESC LIMIT 60`).all(req.userId!));
});

router.post('/recovery', (req: AuthRequest, res) => {
  const { date, recovery_score, hrv_ms, resting_hr, strain } = req.body;
  const id = generateId();
  db.prepare(`
    INSERT INTO recovery_entries (id, user_id, date, recovery_score, hrv_ms, resting_hr, strain, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')
    ON CONFLICT(user_id, date, source) DO UPDATE SET recovery_score=excluded.recovery_score, hrv_ms=excluded.hrv_ms, resting_hr=excluded.resting_hr, strain=excluded.strain
  `).run(id, req.userId!, date ?? new Date().toISOString().split('T')[0], recovery_score, hrv_ms, resting_hr, strain);
  res.json({ id });
});

// Sleep
router.get('/sleep', (req: AuthRequest, res) => {
  res.json(db.prepare(`SELECT * FROM sleep_entries WHERE user_id = ? ORDER BY date DESC LIMIT 60`).all(req.userId!));
});

router.post('/sleep', (req: AuthRequest, res) => {
  const { date, duration_hours, performance_pct, efficiency_pct } = req.body;
  const id = generateId();
  db.prepare(`
    INSERT INTO sleep_entries (id, user_id, date, duration_hours, performance_pct, efficiency_pct, source)
    VALUES (?, ?, ?, ?, ?, ?, 'manual')
    ON CONFLICT(user_id, date, source) DO UPDATE SET duration_hours=excluded.duration_hours, performance_pct=excluded.performance_pct
  `).run(id, req.userId!, date ?? new Date().toISOString().split('T')[0], duration_hours, performance_pct, efficiency_pct);
  res.json({ id });
});

// Lifestyle
router.get('/lifestyle', (req: AuthRequest, res) => {
  res.json(db.prepare(`SELECT * FROM lifestyle_entries WHERE user_id = ? ORDER BY date DESC LIMIT 30`).all(req.userId!));
});

router.post('/lifestyle', (req: AuthRequest, res) => {
  const { date, water_ml, mood, energy_level, caffeine_mg, notes } = req.body;
  const id = generateId();
  db.prepare(`
    INSERT INTO lifestyle_entries (id, user_id, date, water_ml, mood, energy_level, caffeine_mg, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET water_ml=excluded.water_ml, mood=excluded.mood, energy_level=excluded.energy_level, caffeine_mg=excluded.caffeine_mg, notes=excluded.notes
  `).run(id, req.userId!, date ?? new Date().toISOString().split('T')[0], water_ml ?? 0, mood, energy_level, caffeine_mg ?? 0, notes);
  res.json({ id });
});

// Academic
router.get('/academic', (req: AuthRequest, res) => {
  const items = db.prepare(`SELECT * FROM academic_items WHERE user_id = ? ORDER BY due_date ASC`).all(req.userId!);
  const sessions = db.prepare(`SELECT * FROM study_sessions WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 30`).all(req.userId!);
  res.json({ items, sessions });
});

router.post('/academic', (req: AuthRequest, res) => {
  const { title, type, subject, due_date, estimated_hours, priority, stress_level } = req.body;
  const id = generateId();
  db.prepare(`
    INSERT INTO academic_items (id, user_id, title, type, subject, due_date, estimated_hours, priority, stress_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.userId!, title, type, subject, due_date, estimated_hours, priority ?? 'medium', stress_level ?? 5);
  res.json({ id });
});

router.patch('/academic/:id', (req: AuthRequest, res) => {
  const { completed, actual_hours } = req.body;
  db.prepare(`UPDATE academic_items SET completed = COALESCE(?, completed), actual_hours = COALESCE(?, actual_hours), updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(completed !== undefined ? (completed ? 1 : 0) : null, actual_hours, req.params.id, req.userId!);
  res.json({ success: true });
});

router.post('/study', (req: AuthRequest, res) => {
  const { subject, duration_minutes, notes, recorded_at } = req.body;
  const id = generateId();
  db.prepare(`INSERT INTO study_sessions (id, user_id, subject, duration_minutes, notes, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.userId!, subject, duration_minutes, notes, recorded_at ?? new Date().toISOString());
  res.json({ id });
});

// Goals
router.get('/goals', (req: AuthRequest, res) => {
  res.json(db.prepare(`SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC`).all(req.userId!));
});

router.post('/goals', (req: AuthRequest, res) => {
  const { title, category, target_value, unit, deadline, notes } = req.body;
  const id = generateId();
  db.prepare(`INSERT INTO goals (id, user_id, title, category, target_value, unit, deadline, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.userId!, title, category, target_value, unit, deadline, notes);
  res.json({ id });
});

router.delete('/goals/:id', (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM goals WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId!);
  res.json({ success: true });
});

// Calendar
router.get('/calendar', (req: AuthRequest, res) => {
  res.json(db.prepare(`SELECT * FROM calendar_events WHERE user_id = ? ORDER BY start_time ASC LIMIT 50`).all(req.userId!));
});

router.post('/calendar', (req: AuthRequest, res) => {
  const { title, description, start_time, end_time, event_type } = req.body;
  const id = generateId();
  db.prepare(`INSERT INTO calendar_events (id, user_id, title, description, start_time, end_time, event_type) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.userId!, title, description, start_time, end_time, event_type ?? 'general');
  res.json({ id });
});

export default router;
