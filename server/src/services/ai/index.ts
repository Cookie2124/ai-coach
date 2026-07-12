import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';
import { buildUnifiedContext } from '../analytics/index.js';
import { getEffectiveTargets } from '../analytics/profile.js';
import { generateRecommendations } from '../predictions/index.js';
import { env } from '../../config/env.js';
import { fmtSleepHours, round } from '../../utils/format.js';
import { getCredentials, saveIntegration } from '../integrations/base.js';
import { learnFromChatMessage, runLearningCycle } from '../learning/index.js';
import {
  estimateMealNutrition,
  logMeal,
  isMealLogIntent,
  logWeightFromChat,
  isWeightLogIntent,
  deleteMealsFromChat,
  isMealDeleteIntent,
} from '../nutrition/meals.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_FALLBACKS = [
  'openai/gpt-5.6-luna',
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'openrouter/free',
];

function parseOpenRouterError(status: number, bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: string } };
    const msg = parsed.error?.message ?? bodyText.slice(0, 200);
    if (status === 402) return `Insufficient OpenRouter credits — add credits at openrouter.ai/settings/credits, or the app will try free models. (${msg})`;
    if (status === 404) return `Model not available: ${msg}`;
    if (status === 429) return `Rate limited — retry shortly. (${msg})`;
    return `HTTP ${status}: ${msg}`;
  } catch {
    return `HTTP ${status}: ${bodyText.slice(0, 200)}`;
  }
}

export type AIResult = {
  content: string;
  source: 'openrouter' | 'fallback';
  model?: string;
  error?: string;
};

function getAIConfig(userId?: string) {
  const dbConfig = userId ? getCredentials(userId, 'openrouter') : {};
  return {
    apiKey: (dbConfig.api_key as string) || env.OPENROUTER_API_KEY,
    model: (dbConfig.model as string) || env.OPENROUTER_MODEL,
  };
}

export function configureOpenRouter(userId: string, apiKey?: string, model?: string) {
  const existing = getCredentials(userId, 'openrouter');
  saveIntegration(userId, 'openrouter', {
    ...existing,
    ...(apiKey && { api_key: apiKey }),
    model: model ?? existing.model ?? env.OPENROUTER_MODEL,
  }, {}, true);
}

export function getOpenRouterStatus(userId: string) {
  const config = getAIConfig(userId);
  return {
    configured: !!config.apiKey,
    model: config.model,
    source: getCredentials(userId, 'openrouter').api_key ? 'user' : 'env',
    hint: 'Paid models require OpenRouter credits. Free fallbacks are tried automatically if credits are unavailable.',
  };
}

export { estimateMealNutrition } from '../nutrition/meals.js';

function buildSystemPrompt(userId: string): string {
  try {
    const context = buildUnifiedContext(userId);
    const targets = getEffectiveTargets(userId);
    const recs = generateRecommendations(userId);
    const memories = db.prepare(`SELECT category, key, value, source FROM memories WHERE user_id = ? ORDER BY source DESC, updated_at DESC`).all(userId) as { category: string; key: string; value: string; source: string }[];
    const userMemories = memories.filter(m => m.source === 'user');
    const autoMemories = memories.filter(m => m.source === 'auto');

    const upcomingEvents = (context.calendar.upcoming as { title: string; start_time: string; event_type?: string }[] ?? [])
      .slice(0, 8)
      .map(e => `- ${e.start_time?.split('T')[0]}: ${e.title} (${e.event_type ?? 'event'})`)
      .join('\n');

    const recentEmails = ((context.calendar as { recentEmails?: { title: string; start_time: string }[] }).recentEmails ?? [])
      .slice(0, 5)
      .map(e => `- ${e.start_time?.split('T')[0]}: ${e.title}`)
      .join('\n');

    const latestRecovery = context.recovery[0] as { recovery_score?: number; hrv_ms?: number; strain?: number } | undefined;
    const latestSleep = context.sleep[0] as { duration_hours?: number; performance_pct?: number } | undefined;
    const weight = round(context.latestWeight?.weight_kg as number, 1) ?? 'unknown';
    const sleepDisplay = latestSleep?.duration_hours != null ? fmtSleepHours(latestSleep.duration_hours) : 'N/A';

    return `You are AiCoach, an AI-powered personal operating system for a student athlete. You are their unified coach, nutritionist, recovery specialist, academic planner, and performance analyst.

CRITICAL: Every recommendation MUST consider ALL available data holistically. Never give advice based on a single metric alone.

## Current Athlete State
- Sport: ${context.profile?.sport ?? 'rugby'} | Goal: ${context.profile?.goal_type ?? 'maintenance'}
- Weight: ${weight}kg (trend: ${context.weightTrend.trend}, weekly: ${round(context.weightTrend.weeklyChange, 2)}kg)
- Recovery: ${latestRecovery?.recovery_score ?? 'N/A'}% | HRV: ${latestRecovery?.hrv_ms != null ? Math.round(latestRecovery.hrv_ms) : 'N/A'}ms | Strain: ${round(latestRecovery?.strain, 1) ?? 'N/A'}
- Sleep: ${sleepDisplay} | Quality: ${latestSleep?.performance_pct != null ? Math.round(latestSleep.performance_pct) : 'N/A'}%
- Today: ${Math.round(context.nutrition.today.calories)} cal, ${Math.round(context.nutrition.today.protein_g)}g protein
- Targets: ${targets.calories ?? 'unset'} cal, ${targets.protein ?? 'unset'}g protein
- Academic Workload: ${context.academic.workloadScore}/100 | Stress: ${context.academic.stressEstimate}/100
- Exam This Week: ${context.calendar.hasExamThisWeek ? 'YES' : 'No'} | Match Today: ${context.calendar.hasMatchToday ? 'YES' : 'No'}

## Composite Scores
${Object.keys(context.scores).length > 0 ? `- Athletic Readiness: ${context.scores.athletic_readiness ?? 'N/A'}/100
- Student Athlete: ${context.scores.student_athlete_score ?? 'N/A'}/100
- Fatigue: ${context.scores.fatigue_score ?? 'N/A'}/100
- Performance Potential: ${context.scores.performance_potential ?? 'N/A'}/100` : '- No scores computed yet — connect WHOOP or log data'}

## Recommendations
${recs.map(r => `- [${r.priority.toUpperCase()}] ${r.category}: ${r.message}`).join('\n')}

## Correlations
${context.correlations.map((c: { description: string }) => `- ${c.description}`).join('\n') || 'Gathering data...'}

## Recent Workouts
${context.workouts.slice(0, 5).map((w: { date: string; activity_type: string; duration_minutes?: number; strain?: number }) => `- ${w.date}: ${w.activity_type} (${w.duration_minutes ?? '?'}min, strain ${round(w.strain, 1) ?? '?'})`).join('\n') || 'None logged'}

## Upcoming Schedule (Calendar)
${upcomingEvents || 'No upcoming events — connect Google Calendar'}

## Recent Emails (Gmail)
${recentEmails || 'No recent emails synced — connect Google'}

## User Memories
${userMemories.map(m => `- [${m.category}] ${m.key}: ${m.value}`).join('\n') || 'None'}

## Auto-Learned (from your behavior & data)
${autoMemories.map(m => `- [${m.category}] ${m.key}: ${m.value}`).join('\n') || 'Still learning — keep using the app'}

You CAN: log meals (say "Log: I ate..." and it saves automatically with date), remove meals ("Remove my last meal", "Delete lunch today"), log weight, explain trends, predict outcomes, generate reports. Meals are saved with timestamps — users can say "yesterday I ate..." for past dates.`;
  } catch (err) {
    console.error('buildSystemPrompt error:', err);
    return `You are AiCoach, an AI coach for a student athlete. Some data failed to load — still give helpful advice based on the user's message.`;
  }
}

function getModelChain(userId: string): string[] {
  const { model } = getAIConfig(userId);
  const chain = [model, ...MODEL_FALLBACKS].filter(Boolean);
  return [...new Set(chain)];
}

async function callOpenRouter(userId: string, systemPrompt: string, messages: { role: string; content: string }[]): Promise<AIResult> {
  const { apiKey } = getAIConfig(userId);
  if (!apiKey) {
    return {
      content: generateFallbackResponse(systemPrompt, messages),
      source: 'fallback',
      error: 'OpenRouter API key not configured. Add OPENROUTER_API_KEY to .env or Settings.',
    };
  }

  const models = getModelChain(userId);
  let lastError = '';

  for (const model of models) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': env.CLIENT_URL || env.APP_URL,
          'X-Title': 'AiCoach',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });

      const bodyText = await response.text();
      if (!response.ok) {
        lastError = parseOpenRouterError(response.status, bodyText);
        console.warn('OpenRouter model failed:', model, lastError);
        continue;
      }

      const data = JSON.parse(bodyText) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        lastError = `Model ${model}: empty response`;
        continue;
      }

      return { content, source: 'openrouter', model };
    } catch (err) {
      lastError = `Model ${model}: ${(err as Error).message}`;
      console.warn('OpenRouter request error:', lastError);
    }
  }

  const fallback = generateFallbackResponse(systemPrompt, messages);
  return {
    content: `${fallback}\n\n---\n*AI unavailable: ${lastError || 'All models failed'}. Check Settings → OpenRouter.*`,
    source: 'fallback',
    error: lastError || 'All models failed',
  };
}

export async function testOpenRouter(userId: string): Promise<{ ok: boolean; model?: string; error?: string; latencyMs?: number }> {
  const start = Date.now();
  const result = await callOpenRouter(userId, 'You are a test assistant. Reply with exactly: OK', [{ role: 'user', content: 'ping' }]);
  return {
    ok: result.source === 'openrouter',
    model: result.model,
    error: result.error,
    latencyMs: Date.now() - start,
  };
}

function generateFallbackResponse(systemPrompt: string, messages: { role: string; content: string }[]): string {
  const lastMessage = messages[messages.length - 1]?.content.toLowerCase() ?? '';
  const recs = systemPrompt.match(/## Recommendations\n([\s\S]*?)\n##/)?.[1] ?? '';

  if (lastMessage.includes('log') && (lastMessage.includes('ate') || lastMessage.includes('had') || lastMessage.includes('drank'))) {
    const nutrition = estimateMealNutrition(messages[messages.length - 1].content);
    return `Logged meal estimate:\n- **Calories:** ${nutrition.calories}\n- **Protein:** ${nutrition.protein_g}g\n- **Carbs:** ${nutrition.carbs_g}g\n- **Fat:** ${nutrition.fat_g}g\n\n*(Saved to your nutrition log)*`;
  }

  return `I'm AiCoach with access to all your interconnected data.\n\n**Recommendations:**\n${recs.trim().split('\n').slice(0, 3).join('\n') || '- Start logging data for insights'}\n\n*Configure OpenRouter API key in Settings for full AI.*`;
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

  learnFromChatMessage(userId, userMessage);

  // Auto-save meals and weight from chat
  let mealLogged: ReturnType<typeof logMeal> | null = null;
  let weightLogged: { logged: boolean; weight_kg?: number } | null = null;

  if (isMealLogIntent(userMessage)) {
    mealLogged = logMeal(userId, userMessage);
  }
  if (isWeightLogIntent(userMessage)) {
    weightLogged = logWeightFromChat(userId, userMessage);
  }

  let mealsDeleted: { id: string; description: string; logged_at: string }[] = [];
  if (isMealDeleteIntent(userMessage)) {
    mealsDeleted = deleteMealsFromChat(userId, userMessage).deleted;
  }

  const history = db.prepare(`
    SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 20
  `).all(convId) as { role: string; content: string }[];

  const systemPrompt = buildSystemPrompt(userId);
  const aiResult = await callOpenRouter(userId, systemPrompt, history);

  const metadata: Record<string, unknown> = {
    source: aiResult.source,
    model: aiResult.model,
    error: aiResult.error,
  };

  if (mealLogged) {
    metadata.mealLogged = mealLogged;
  }
  if (weightLogged?.logged) {
    metadata.weightLogged = weightLogged;
  }
  if (mealsDeleted.length > 0) {
    metadata.mealsDeleted = mealsDeleted;
  }

  let responseText = aiResult.content;
  if (mealLogged && !responseText.toLowerCase().includes('logged') && !responseText.toLowerCase().includes('saved')) {
    const dateStr = new Date(mealLogged.logged_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    responseText += `\n\n✅ **Meal saved** (${dateStr})\n- ${mealLogged.calories} cal · ${mealLogged.protein_g}g protein · ${mealLogged.carbs_g}g carbs · ${mealLogged.fat_g}g fat`;
    if (mealLogged.matchedFoods?.length) {
      responseText += `\n- Detected: ${mealLogged.matchedFoods.join(', ')}`;
    }
  }
  if (weightLogged?.logged) {
    responseText += `\n\n✅ **Weight saved:** ${weightLogged.weight_kg} kg`;
  }
  if (mealsDeleted.length > 0) {
    responseText += `\n\n🗑️ **Removed ${mealsDeleted.length} meal(s):** ${mealsDeleted.map(m => m.description).join('; ')}`;
  }

  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, metadata) VALUES (?, ?, 'assistant', ?, ?)`)
    .run(generateId(), convId, responseText, JSON.stringify(metadata));

  db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(convId);

  runLearningCycle(userId);

  const status = getOpenRouterStatus(userId);
  return {
    conversationId: convId,
    response: responseText,
    metadata,
    mealLogged,
    weightLogged,
    mealsDeleted: mealsDeleted.length > 0 ? mealsDeleted : undefined,
    source: aiResult.source,
    model: aiResult.model,
    error: aiResult.error,
    aiConfigured: status.configured,
  };
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
