import { env } from '../../config/env.js';
import { getCredentials } from '../integrations/base.js';
import { estimateMealNutrition, detectMealType } from './food-db.js';
import { logMeal } from './meals.js';
import { formatNowContext, mealTimeForType, todayInTz } from '../../utils/timezone.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const PARSE_MODELS = [
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.2-3b-instruct:free',
];

interface ParsedMeal {
  description: string;
  meal_type: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  time_hint?: string;
}

function getApiKey(userId: string): string | undefined {
  const dbConfig = getCredentials(userId, 'openrouter');
  return (dbConfig.api_key as string) || env.OPENROUTER_API_KEY || undefined;
}

function parseJsonFromContent(content: string): ParsedMeal | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    if (!raw.description || typeof raw.description !== 'string') return null;
    return {
      description: String(raw.description).trim(),
      meal_type: String(raw.meal_type ?? 'other'),
      calories: Math.round(Number(raw.calories) || 0),
      protein_g: Math.round((Number(raw.protein_g) || 0) * 10) / 10,
      carbs_g: Math.round((Number(raw.carbs_g) || 0) * 10) / 10,
      fat_g: Math.round((Number(raw.fat_g) || 0) * 10) / 10,
      fibre_g: Math.round((Number(raw.fibre_g) || 0) * 10) / 10,
      time_hint: raw.time_hint ? String(raw.time_hint) : undefined,
    };
  } catch {
    return null;
  }
}

async function callMealParserAI(userId: string, userText: string, localDate: string, timeZone: string): Promise<ParsedMeal | null> {
  const apiKey = getApiKey(userId);
  if (!apiKey) return null;

  const now = formatNowContext(timeZone);
  const system = `You estimate nutrition for an athlete's meal log. Reply with ONLY valid JSON, no markdown.
{
  "description": "clean short meal name",
  "meal_type": "breakfast|lunch|dinner|snack|pre-workout|post-workout|other",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fibre_g": number,
  "time_hint": "HH:MM optional 24h local time"
}
Use realistic estimates for Australian/common foods. User local date: ${localDate}. Today is ${now.weekday} ${now.localDate}.`;

  for (const model of PARSE_MODELS) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': env.CLIENT_URL || env.APP_URL,
          'X-Title': 'AiCoach',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userText },
          ],
          temperature: 0.2,
          max_tokens: 400,
        }),
      });
      if (!response.ok) continue;
      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) continue;
      const parsed = parseJsonFromContent(content);
      if (parsed && parsed.calories > 0) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function loggedAtFromHint(localDate: string, mealType: string, timeHint: string | undefined, timeZone: string): string {
  if (timeHint && /^\d{1,2}:\d{2}$/.test(timeHint)) {
    const [h, m] = timeHint.split(':').map(Number);
    return `${localDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }
  return mealTimeForType(mealType, localDate, timeZone);
}

export async function parseAndLogMealWithAI(
  userId: string,
  rawText: string,
  options: { localDate?: string; timeZone: string },
) {
  const text = rawText.trim();
  if (!text) throw new Error('Describe what you ate');

  const timeZone = options.timeZone;
  const localDate = options.localDate ?? todayInTz(timeZone);

  let parsed = await callMealParserAI(userId, text, localDate, timeZone);
  let source: 'ai' | 'database' = 'ai';

  if (!parsed) {
    const estimated = estimateMealNutrition(text);
    parsed = {
      description: text,
      meal_type: detectMealType(text),
      calories: estimated.calories,
      protein_g: estimated.protein_g,
      carbs_g: estimated.carbs_g,
      fat_g: estimated.fat_g,
      fibre_g: estimated.fibre_g,
    };
    source = 'database';
  }

  const logged_at = loggedAtFromHint(localDate, parsed.meal_type, parsed.time_hint, timeZone);

  const result = logMeal(userId, parsed.description, {
    logged_at,
    meal_type: parsed.meal_type,
    calories: parsed.calories,
    protein_g: parsed.protein_g,
    carbs_g: parsed.carbs_g,
    fat_g: parsed.fat_g,
    fibre_g: parsed.fibre_g,
  });

  return { ...result, source, localDate };
}
