import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';
import { buildUnifiedContext } from '../analytics/index.js';
import { generateRecommendations } from '../predictions/index.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

const FOOD_DB: Record<string, { calories: number; protein: number; carbs: number; fat: number; fibre: number; unit: string }> = {
  'weet-bix': { calories: 33, protein: 1.2, carbs: 6.5, fat: 0.3, fibre: 1.5, unit: 'biscuit' },
  'weetbix': { calories: 33, protein: 1.2, carbs: 6.5, fat: 0.3, fibre: 1.5, unit: 'biscuit' },
  'milk': { calories: 0.64, protein: 0.034, carbs: 0.048, fat: 0.036, fibre: 0, unit: 'ml' },
  'chicken': { calories: 1.65, protein: 0.31, carbs: 0, fat: 0.036, fibre: 0, unit: 'g' },
  'rice': { calories: 1.3, protein: 0.027, carbs: 0.28, fat: 0.003, fibre: 0.004, unit: 'g' },
  'protein shake': { calories: 120, protein: 25, carbs: 3, fat: 1.5, fibre: 0, unit: 'serving' },
  'protein powder': { calories: 120, protein: 25, carbs: 3, fat: 1.5, fibre: 0, unit: 'scoop' },
  'egg': { calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3, fibre: 0, unit: 'egg' },
  'oats': { calories: 3.89, protein: 0.17, carbs: 0.66, fat: 0.07, fibre: 0.1, unit: 'g' },
  'banana': { calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fibre: 3.1, unit: 'banana' },
  'bread': { calories: 2.65, protein: 0.09, carbs: 0.49, fat: 0.033, fibre: 0.025, unit: 'g' },
  'beef': { calories: 2.5, protein: 0.26, carbs: 0, fat: 0.15, fibre: 0, unit: 'g' },
  'salmon': { calories: 2.08, protein: 0.20, carbs: 0, fat: 0.13, fibre: 0, unit: 'g' },
  'pasta': { calories: 1.31, protein: 0.05, carbs: 0.25, fat: 0.01, fibre: 0.018, unit: 'g' },
  'potato': { calories: 0.77, protein: 0.02, carbs: 0.17, fat: 0.001, fibre: 0.022, unit: 'g' },
  'yogurt': { calories: 0.59, protein: 0.034, carbs: 0.036, fat: 0.034, fibre: 0, unit: 'g' },
  'peanut butter': { calories: 5.88, protein: 0.25, carbs: 0.20, fat: 0.50, fibre: 0.08, unit: 'g' },
  'avocado': { calories: 1.6, protein: 0.02, carbs: 0.085, fat: 0.15, fibre: 0.067, unit: 'g' },
  'broccoli': { calories: 0.34, protein: 0.028, carbs: 0.07, fat: 0.004, fibre: 0.026, unit: 'g' },
  'cheese': { calories: 4.02, protein: 0.25, carbs: 0.013, fat: 0.33, fibre: 0, unit: 'g' },
};

export function estimateMealNutrition(description: string) {
  const lower = description.toLowerCase();
  let calories = 0, protein = 0, carbs = 0, fat = 0, fibre = 0;

  const quantityMatch = lower.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l|oz|serving|scoop|egg|banana|biscuit|slice|cup|bowl)?/g);

  for (const [food, nutrition] of Object.entries(FOOD_DB)) {
    if (lower.includes(food)) {
      let qty = 1;
      const foodPattern = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(g|kg|ml|l|oz|serving|scoop|egg|banana|biscuit|slice|cup|bowl)?\\s*${food}|${food}\\s*(\\d+(?:\\.\\d+)?)?\\s*(g|kg|ml|l)?`, 'i');
      const match = lower.match(foodPattern);

      if (match) {
        const num = parseFloat(match[1] || match[3] || '1');
        const unit = match[2] || match[4] || nutrition.unit;
        if (unit === 'kg') qty = num * 1000;
        else if (unit === 'l') qty = num * 1000;
        else if (unit === 'ml' || unit === 'g') qty = num;
        else qty = num;
      } else {
        const countMatch = lower.match(new RegExp(`(\\d+)\\s*${food}`, 'i'));
        if (countMatch) qty = parseInt(countMatch[1]);
      }

      if (nutrition.unit === 'g' || nutrition.unit === 'ml') {
        calories += nutrition.calories * qty;
        protein += nutrition.protein * qty;
        carbs += nutrition.carbs * qty;
        fat += nutrition.fat * qty;
        fibre += nutrition.fibre * qty;
      } else {
        calories += nutrition.calories * qty;
        protein += nutrition.protein * qty;
        carbs += nutrition.carbs * qty;
        fat += nutrition.fat * qty;
        fibre += nutrition.fibre * qty;
      }
    }
  }

  if (calories === 0) {
    calories = 400; protein = 25; carbs = 40; fat = 15; fibre = 3;
  }

  return {
    calories: Math.round(calories),
    protein_g: Math.round(protein * 10) / 10,
    carbs_g: Math.round(carbs * 10) / 10,
    fat_g: Math.round(fat * 10) / 10,
    fibre_g: Math.round(fibre * 10) / 10,
  };
}

function buildSystemPrompt(userId: string): string {
  const context = buildUnifiedContext(userId);
  const recs = generateRecommendations(userId);
  const memories = db.prepare(`SELECT category, key, value FROM memories WHERE user_id = ?`).all(userId) as { category: string; key: string; value: string }[];

  const latestRecovery = context.recovery[0];
  const latestSleep = context.sleep[0];
  const weight = context.latestWeight?.weight_kg ?? 'unknown';

  return `You are AiCoach, an AI-powered personal operating system for a student athlete. You are their unified coach, nutritionist, recovery specialist, academic planner, and performance analyst.

CRITICAL: Every recommendation MUST consider ALL available data holistically. Never give advice based on a single metric alone.

## Current Athlete State
- Name/Sport: ${context.profile?.sport ?? 'rugby'} player, goal: ${context.profile?.goal_type ?? 'maintenance'}
- Weight: ${weight}kg (trend: ${context.weightTrend.trend}, weekly change: ${context.weightTrend.weeklyChange}kg)
- Recovery: ${latestRecovery?.recovery_score ?? 'N/A'}% | HRV: ${latestRecovery?.hrv_ms ?? 'N/A'}ms | Strain: ${latestRecovery?.strain ?? 'N/A'}
- Sleep: ${latestSleep?.duration_hours ?? 'N/A'}h | Performance: ${latestSleep?.performance_pct ?? 'N/A'}%
- Today's Nutrition: ${Math.round(context.nutrition.today.calories)} cal, ${Math.round(context.nutrition.today.protein_g)}g protein, ${Math.round(context.nutrition.today.carbs_g)}g carbs
- Targets: ${context.profile?.target_calories ?? 2500} cal, ${context.profile?.target_protein_g ?? 150}g protein
- Academic Workload Score: ${context.academic.workloadScore}/100 | Stress: ${context.academic.stressEstimate}/100
- Exam This Week: ${context.calendar.hasExamThisWeek ? 'YES' : 'No'} | Match Today: ${context.calendar.hasMatchToday ? 'YES' : 'No'}

## Composite Scores (Today)
- Athletic Readiness: ${context.scores.athletic_readiness}/100
- Student Athlete Score: ${context.scores.student_athlete_score}/100
- Fatigue: ${context.scores.fatigue_score}/100
- Performance Potential: ${context.scores.performance_potential}/100
- School-Life Balance: ${context.scores.school_life_balance}/100

## Active Recommendations
${recs.map(r => `- [${r.priority.toUpperCase()}] ${r.category}: ${r.message}`).join('\n')}

## Discovered Correlations
${context.correlations.map((c: { description: string }) => `- ${c.description}`).join('\n') || 'Still gathering data...'}

## Recent Workouts (last 7 days)
${context.workouts.slice(0, 5).map((w: { date: string; activity_type: string; duration_minutes?: number; strain?: number }) => `- ${w.date}: ${w.activity_type} (${w.duration_minutes ?? '?'}min, strain: ${w.strain ?? 'N/A'})`).join('\n') || 'No recent workouts'}

## Memories
${memories.map(m => `- [${m.category}] ${m.key}: ${m.value}`).join('\n') || 'No stored memories yet'}

## Capabilities
You CAN and SHOULD: log meals, log weight, log workouts, create schedules, update records, explain trends, predict outcomes, generate reports, and perform calculations. When the user asks you to log something, confirm what you'll log with estimated values.

Always interconnect your advice: if recovery is low AND there's an exam AND protein is low, address ALL factors together.`;
}

async function callOllama(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: false,
        options: { temperature: 0.7, num_predict: 2048 },
      }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json() as { message: { content: string } };
    return data.message.content;
  } catch {
    return generateFallbackResponse(systemPrompt, messages);
  }
}

function generateFallbackResponse(systemPrompt: string, messages: { role: string; content: string }[]): string {
  const lastMessage = messages[messages.length - 1]?.content.toLowerCase() ?? '';
  const recs = systemPrompt.match(/## Active Recommendations\n([\s\S]*?)\n##/)?.[1] ?? '';

  if (lastMessage.includes('log') && (lastMessage.includes('ate') || lastMessage.includes('had') || lastMessage.includes('drank'))) {
    const nutrition = estimateMealNutrition(messages[messages.length - 1].content);
    return `I've estimated your meal:\n- **Calories:** ${nutrition.calories}\n- **Protein:** ${nutrition.protein_g}g\n- **Carbs:** ${nutrition.carbs_g}g\n- **Fat:** ${nutrition.fat_g}g\n- **Fibre:** ${nutrition.fibre_g}g\n\nSay "confirm" to save this meal, or provide corrections.`;
  }

  if (lastMessage.includes('recovery') || lastMessage.includes('how am i')) {
    const recoveryMatch = systemPrompt.match(/Recovery: (\d+)%/);
    const readinessMatch = systemPrompt.match(/Athletic Readiness: (\d+)/);
    return `Based on your interconnected data:\n\n**Recovery:** ${recoveryMatch?.[1] ?? 'N/A'}%\n**Athletic Readiness:** ${readinessMatch?.[1] ?? 'N/A'}/100\n\n${recs.trim() || 'Keep tracking consistently for better insights.'}\n\n*Note: Connect Ollama (localhost:11434) for full AI capabilities.*`;
  }

  if (lastMessage.includes('report') || lastMessage.includes('summary')) {
    return `## Daily Summary\n\n${systemPrompt.split('## Composite Scores')[1]?.split('## Active Recommendations')[0] ?? 'Data loading...'}\n\n### Recommendations\n${recs.trim()}\n\n*Connect Ollama for detailed AI-generated reports.*`;
  }

  if (lastMessage.includes('weight')) {
    const weightMatch = systemPrompt.match(/Weight: ([\d.]+)kg/);
    const trendMatch = systemPrompt.match(/trend: (\w+)/);
    return `**Current Weight:** ${weightMatch?.[1] ?? 'Not logged'}kg (${trendMatch?.[1] ?? 'unknown'} trend)\n\nLog weight with: "Log my weight as 82.5kg"\n\nFor full AI analysis, ensure Ollama is running locally.`;
  }

  return `I'm AiCoach, your local student athlete OS. I have access to all your health, training, nutrition, academic, and recovery data.\n\n**Top Recommendations:**\n${recs.trim().split('\n').slice(0, 3).join('\n') || '- Start logging data for personalized insights'}\n\nAsk me about recovery, nutrition, training, academics, or say "log [meal/weight/workout]".\n\n*Running in offline mode — start Ollama for full AI.*`;
}

export async function chat(userId: string, conversationId: string | null, userMessage: string) {
  let convId = conversationId;
  if (!convId) {
    convId = generateId();
    db.prepare(`INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)`)
      .run(convId, userId, userMessage.slice(0, 50));
  }

  db.prepare(`INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)`)
    .run(generateId(), convId, userMessage);

  const history = db.prepare(`
    SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 20
  `).all(convId) as { role: string; content: string }[];

  const systemPrompt = buildSystemPrompt(userId);
  const response = await callOllama(systemPrompt, history);

  const metadata: Record<string, unknown> = {};
  const lower = userMessage.toLowerCase();
  if (lower.includes('log') && (lower.includes('ate') || lower.includes('had') || lower.includes('drank'))) {
    metadata.suggestedMeal = estimateMealNutrition(userMessage);
  }

  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, metadata) VALUES (?, ?, 'assistant', ?, ?)`)
    .run(generateId(), convId, response, JSON.stringify(metadata));

  db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(convId);

  return { conversationId: convId, response, metadata };
}

export function getConversations(userId: string) {
  return db.prepare(`
    SELECT c.id, c.title, c.created_at, c.updated_at,
           (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC LIMIT 50
  `).all(userId);
}

export function getMessages(conversationId: string) {
  return db.prepare(`SELECT id, role, content, metadata, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`).all(conversationId);
}

export function deleteConversation(conversationId: string) {
  db.prepare(`DELETE FROM messages WHERE conversation_id = ?`).run(conversationId);
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(conversationId);
}
