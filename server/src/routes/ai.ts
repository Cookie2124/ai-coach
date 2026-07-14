import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { chat, getConversations, getMessages, deleteConversation, configureOpenRouter, getOpenRouterStatus, testOpenRouter } from '../services/ai/index.js';
import { generateReport, getReports, getReport } from '../services/reports/index.js';
import { db } from '../db/database.js';
import { generateId } from '../types/index.js';

const router = Router();
router.use(authMiddleware);

router.get('/config', (req: AuthRequest, res) => {
  res.json(getOpenRouterStatus(req.userId!));
});

router.post('/config', (req: AuthRequest, res) => {
  const { apiKey, model } = req.body;
  configureOpenRouter(req.userId!, apiKey, model);
  res.json({ success: true, ...getOpenRouterStatus(req.userId!) });
});

router.post('/test', async (req: AuthRequest, res) => {
  try {
    const result = await testOpenRouter(req.userId!);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
});

router.post('/chat', async (req: AuthRequest, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const result = await chat(req.userId!, conversationId ?? null, message, req.timezone);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/conversations', (req: AuthRequest, res) => {
  res.json(getConversations(req.userId!));
});

router.get('/conversations/:id/messages', (req: AuthRequest, res) => {
  const conv = db.prepare(`SELECT id FROM conversations WHERE id = ? AND user_id = ?`).get(req.params.id, req.userId!) as { id: string } | undefined;
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  res.json(getMessages(String(req.params.id)));
});

router.delete('/conversations/:id', (req: AuthRequest, res) => {
  const conv = db.prepare(`SELECT id FROM conversations WHERE id = ? AND user_id = ?`).get(req.params.id, req.userId!) as { id: string } | undefined;
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  deleteConversation(String(req.params.id));
  res.json({ success: true });
});

router.post('/reports/:type', (req: AuthRequest, res) => {
  const type = req.params.type as 'daily' | 'weekly' | 'monthly';
  if (!['daily', 'weekly', 'monthly'].includes(type)) return res.status(400).json({ error: 'Invalid report type' });
  res.json(generateReport(req.userId!, type));
});

router.get('/reports', (req: AuthRequest, res) => {
  res.json(getReports(req.userId!));
});

router.get('/reports/:id', (req: AuthRequest, res) => {
  const report = getReport(String(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json(report);
});

// Memories
router.get('/memories', (req: AuthRequest, res) => {
  res.json(db.prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY updated_at DESC`).all(req.userId!));
});

router.post('/memories', (req: AuthRequest, res) => {
  const { category, key, value } = req.body;
  const id = generateId();
  db.prepare(`INSERT INTO memories (id, user_id, category, key, value) VALUES (?, ?, ?, ?, ?)`)
    .run(id, req.userId!, category, key, value);
  res.json({ id });
});

router.put('/memories/:id', (req: AuthRequest, res) => {
  const { value, category, key } = req.body;
  db.prepare(`UPDATE memories SET value = COALESCE(?, value), category = COALESCE(?, category), key = COALESCE(?, key), updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(value, category, key, req.params.id, req.userId!);
  res.json({ success: true });
});

router.delete('/memories/:id', (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM memories WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId!);
  res.json({ success: true });
});

// Dashboard layout
router.get('/dashboard-layout', (req: AuthRequest, res) => {
  const row = db.prepare(`SELECT widgets FROM dashboard_layout WHERE user_id = ?`).get(req.userId!) as { widgets: string } | undefined;
  res.json(JSON.parse(row?.widgets ?? '[]'));
});

router.put('/dashboard-layout', (req: AuthRequest, res) => {
  db.prepare(`UPDATE dashboard_layout SET widgets = ?, updated_at = datetime('now') WHERE user_id = ?`)
    .run(JSON.stringify(req.body.widgets), req.userId!);
  res.json({ success: true });
});

export default router;
