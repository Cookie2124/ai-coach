import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/database.js';
import { generateId } from '../types/index.js';
import { signToken, authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { getEffectiveTargets, parseProfileRow } from '../services/analytics/profile.js';

const router = Router();

router.post('/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, and name required' });

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = generateId();
  const hash = bcrypt.hashSync(password, 12);
  db.prepare(`INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)`).run(id, email, hash, name);
  db.prepare(`INSERT INTO user_profile (user_id) VALUES (?)`).run(id);
  db.prepare(`INSERT INTO dashboard_layout (user_id) VALUES (?)`).run(id);

  const token = signToken(id);
  res.json({ token, user: { id, email, name } });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare(`SELECT id, email, name, password_hash FROM users WHERE email = ?`).get(email) as { id: string; email: string; name: string; password_hash: string } | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: signToken(user.id), user: { id: user.id, email: user.email, name: user.name } });
});

router.get('/me', authMiddleware, (req: AuthRequest, res) => {
  const user = db.prepare(`SELECT id, email, name FROM users WHERE id = ?`).get(req.userId!);
  const profileRow = db.prepare(`SELECT * FROM user_profile WHERE user_id = ?`).get(req.userId!) as Record<string, unknown> | undefined;
  const profile = parseProfileRow(profileRow);
  const targets = getEffectiveTargets(req.userId!);
  res.json({ user, profile: profile ? { ...profile, targets } : { targets } });
});

router.put('/profile', authMiddleware, (req: AuthRequest, res) => {
  const { sport, goal_type, target_weight_kg, target_calories, target_protein_g, target_carbs_g, target_fat_g, height_cm, position, team, dietary_restrictions, favorite_foods, preferences } = req.body;
  db.prepare(`
    UPDATE user_profile SET sport=COALESCE(?,sport), goal_type=COALESCE(?,goal_type),
      target_weight_kg=COALESCE(?,target_weight_kg), target_calories=COALESCE(?,target_calories),
      target_protein_g=COALESCE(?,target_protein_g), target_carbs_g=COALESCE(?,target_carbs_g),
      target_fat_g=COALESCE(?,target_fat_g), height_cm=COALESCE(?,height_cm),
      position=COALESCE(?,position), team=COALESCE(?,team),
      dietary_restrictions=COALESCE(?,dietary_restrictions), favorite_foods=COALESCE(?,favorite_foods),
      preferences=COALESCE(?,preferences), updated_at=datetime('now')
    WHERE user_id=?
  `).run(sport, goal_type, target_weight_kg, target_calories, target_protein_g, target_carbs_g, target_fat_g,
    height_cm, position, team,
    dietary_restrictions ? JSON.stringify(dietary_restrictions) : null,
    favorite_foods ? JSON.stringify(favorite_foods) : null,
    preferences ? JSON.stringify(preferences) : null,
    req.userId);
  res.json({ success: true });
});

export default router;
