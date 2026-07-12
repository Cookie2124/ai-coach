/** Nutritional values per unit (g, ml, or serving item) */
export type FoodEntry = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  unit: string;
  aliases?: string[];
};

export const FOOD_DATABASE: Record<string, FoodEntry> = {
  // Cereals & breakfast
  'weet-bix': { calories: 33, protein: 1.2, carbs: 6.5, fat: 0.3, fibre: 1.5, unit: 'biscuit', aliases: ['weetbix', 'weet bix'] },
  'oats': { calories: 3.89, protein: 0.17, carbs: 0.66, fat: 0.07, fibre: 0.1, unit: 'g', aliases: ['oatmeal', 'porridge'] },
  'cornflakes': { calories: 3.57, protein: 0.07, carbs: 0.84, fat: 0.01, fibre: 0.03, unit: 'g' },
  'granola': { calories: 4.71, protein: 0.10, carbs: 0.64, fat: 0.20, fibre: 0.08, unit: 'g' },
  'toast': { calories: 75, protein: 2.5, carbs: 14, fat: 1, fibre: 1.2, unit: 'slice', aliases: ['bread slice'] },
  'bread': { calories: 2.65, protein: 0.09, carbs: 0.49, fat: 0.033, fibre: 0.025, unit: 'g' },
  'bagel': { calories: 280, protein: 11, carbs: 55, fat: 1.5, fibre: 2, unit: 'bagel' },
  'pancake': { calories: 86, protein: 2.5, carbs: 14, fat: 2.5, fibre: 0.5, unit: 'pancake' },

  // Dairy
  'milk': { calories: 0.64, protein: 0.034, carbs: 0.048, fat: 0.036, fibre: 0, unit: 'ml', aliases: ['full cream milk', 'skim milk'] },
  'greek yogurt': { calories: 0.97, protein: 0.09, carbs: 0.036, fat: 0.05, fibre: 0, unit: 'g', aliases: ['yogurt', 'yoghurt'] },
  'cheese': { calories: 4.02, protein: 0.25, carbs: 0.013, fat: 0.33, fibre: 0, unit: 'g', aliases: ['cheddar'] },
  'cottage cheese': { calories: 0.98, protein: 0.11, carbs: 0.034, fat: 0.043, fibre: 0, unit: 'g' },
  'butter': { calories: 7.17, protein: 0.009, carbs: 0.001, fat: 0.81, fibre: 0, unit: 'g' },

  // Proteins
  'chicken breast': { calories: 1.65, protein: 0.31, carbs: 0, fat: 0.036, fibre: 0, unit: 'g', aliases: ['chicken'] },
  'chicken thigh': { calories: 2.09, protein: 0.26, carbs: 0, fat: 0.11, fibre: 0, unit: 'g' },
  'beef mince': { calories: 2.50, protein: 0.26, carbs: 0, fat: 0.15, fibre: 0, unit: 'g', aliases: ['mince', 'beef', 'ground beef'] },
  'steak': { calories: 2.71, protein: 0.26, carbs: 0, fat: 0.18, fibre: 0, unit: 'g' },
  'salmon': { calories: 2.08, protein: 0.20, carbs: 0, fat: 0.13, fibre: 0, unit: 'g' },
  'tuna': { calories: 1.32, protein: 0.29, carbs: 0, fat: 0.01, fibre: 0, unit: 'g', aliases: ['tinned tuna'] },
  'egg': { calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3, fibre: 0, unit: 'egg', aliases: ['eggs'] },
  'bacon': { calories: 5.41, protein: 0.37, carbs: 0.014, fat: 0.42, fibre: 0, unit: 'g' },
  'sausage': { calories: 3.01, protein: 0.12, carbs: 0.02, fat: 0.27, fibre: 0, unit: 'g' },
  'ham': { calories: 1.45, protein: 0.21, carbs: 0.015, fat: 0.06, fibre: 0, unit: 'g' },
  'turkey': { calories: 1.35, protein: 0.30, carbs: 0, fat: 0.01, fibre: 0, unit: 'g' },
  'prawns': { calories: 0.99, protein: 0.24, carbs: 0.002, fat: 0.003, fibre: 0, unit: 'g', aliases: ['shrimp'] },
  'tofu': { calories: 0.76, protein: 0.08, carbs: 0.019, fat: 0.048, fibre: 0.003, unit: 'g' },

  // Carbs & sides
  'rice': { calories: 1.30, protein: 0.027, carbs: 0.28, fat: 0.003, fibre: 0.004, unit: 'g', aliases: ['white rice', 'brown rice', 'jasmine rice'] },
  'pasta': { calories: 1.31, protein: 0.05, carbs: 0.25, fat: 0.01, fibre: 0.018, unit: 'g', aliases: ['spaghetti', 'penne'] },
  'potato': { calories: 0.77, protein: 0.02, carbs: 0.17, fat: 0.001, fibre: 0.022, unit: 'g', aliases: ['potatoes', 'sweet potato'] },
  'quinoa': { calories: 1.20, protein: 0.044, carbs: 0.21, fat: 0.019, fibre: 0.028, unit: 'g' },
  'couscous': { calories: 1.12, protein: 0.037, carbs: 0.23, fat: 0.002, fibre: 0.014, unit: 'g' },
  'noodles': { calories: 1.38, protein: 0.047, carbs: 0.25, fat: 0.02, fibre: 0.01, unit: 'g' },
  'wrap': { calories: 180, protein: 5, carbs: 30, fat: 4, fibre: 2, unit: 'wrap', aliases: ['tortilla'] },

  // Fruits
  'banana': { calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fibre: 3.1, unit: 'banana', aliases: ['bananas'] },
  'apple': { calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fibre: 4.4, unit: 'apple' },
  'orange': { calories: 62, protein: 1.2, carbs: 15, fat: 0.2, fibre: 3.1, unit: 'orange' },
  'berries': { calories: 0.57, protein: 0.007, carbs: 0.14, fat: 0.003, fibre: 0.02, unit: 'g', aliases: ['blueberries', 'strawberries'] },
  'avocado': { calories: 1.6, protein: 0.02, carbs: 0.085, fat: 0.15, fibre: 0.067, unit: 'g' },
  'grapes': { calories: 0.69, protein: 0.007, carbs: 0.18, fat: 0.002, fibre: 0.009, unit: 'g' },
  'mango': { calories: 0.60, protein: 0.008, carbs: 0.15, fat: 0.004, fibre: 0.016, unit: 'g' },

  // Vegetables
  'broccoli': { calories: 0.34, protein: 0.028, carbs: 0.07, fat: 0.004, fibre: 0.026, unit: 'g' },
  'spinach': { calories: 0.23, protein: 0.029, carbs: 0.036, fat: 0.004, fibre: 0.022, unit: 'g' },
  'salad': { calories: 0.20, protein: 0.015, carbs: 0.04, fat: 0.003, fibre: 0.015, unit: 'g', aliases: ['lettuce', 'mixed greens'] },
  'carrot': { calories: 0.41, protein: 0.009, carbs: 0.096, fat: 0.002, fibre: 0.028, unit: 'g' },
  'tomato': { calories: 0.18, protein: 0.009, carbs: 0.039, fat: 0.002, fibre: 0.012, unit: 'g' },

  // Snacks & extras
  'peanut butter': { calories: 5.88, protein: 0.25, carbs: 0.20, fat: 0.50, fibre: 0.08, unit: 'g', aliases: ['pb'] },
  'almonds': { calories: 5.79, protein: 0.21, carbs: 0.22, fat: 0.50, fibre: 0.12, unit: 'g', aliases: ['nuts'] },
  // Whey ~80% protein by weight; per gram values
  'whey protein': {
    calories: 4,
    protein: 0.8,
    carbs: 0.05,
    fat: 0.03,
    fibre: 0,
    unit: 'g',
    aliases: ['whey', 'whey protein powder', 'whey isolate', 'protein powder', 'protein scoop'],
  },
  'protein shake': { calories: 120, protein: 25, carbs: 3, fat: 1.5, fibre: 0, unit: 'serving', aliases: ['shake'] },
  'protein bar': { calories: 200, protein: 20, carbs: 22, fat: 7, fibre: 3, unit: 'bar' },
  'chocolate': { calories: 5.46, protein: 0.078, carbs: 0.61, fat: 0.31, fibre: 0.07, unit: 'g' },
  'honey': { calories: 3.04, protein: 0.003, carbs: 0.82, fat: 0, fibre: 0.002, unit: 'g' },
  'olive oil': { calories: 8.84, protein: 0, carbs: 0, fat: 1, fibre: 0, unit: 'g', aliases: ['oil'] },

  // Fast food / common meals
  'burrito': { calories: 450, protein: 20, carbs: 55, fat: 15, fibre: 6, unit: 'burrito' },
  'burger': { calories: 540, protein: 25, carbs: 40, fat: 28, fibre: 2, unit: 'burger' },
  'pizza': { calories: 285, protein: 12, carbs: 36, fat: 10, fibre: 2, unit: 'slice' },
  'fish and chips': { calories: 850, protein: 30, carbs: 80, fat: 45, fibre: 4, unit: 'serving' },
  'sushi roll': { calories: 200, protein: 8, carbs: 28, fat: 5, fibre: 1, unit: 'roll', aliases: ['sushi'] },
  'smoothie': { calories: 250, protein: 10, carbs: 45, fat: 4, fibre: 3, unit: 'serving' },

  // Drinks
  'coffee': { calories: 2, protein: 0.3, carbs: 0, fat: 0, fibre: 0, unit: 'cup', aliases: ['espresso', 'latte', 'flat white'] },
  'orange juice': { calories: 0.45, protein: 0.007, carbs: 0.10, fat: 0.002, fibre: 0.002, unit: 'ml', aliases: ['juice'] },
  'soft drink': { calories: 0.42, protein: 0, carbs: 0.106, fat: 0, fibre: 0, unit: 'ml', aliases: ['coke', 'soda'] },
  'beer': { calories: 43, protein: 0.5, carbs: 3.6, fat: 0, fibre: 0, unit: '100ml' },
};

/** Build lookup including aliases */
function foodLookup(): { key: string; entry: FoodEntry }[] {
  const items: { key: string; entry: FoodEntry }[] = [];
  for (const [key, entry] of Object.entries(FOOD_DATABASE)) {
    items.push({ key, entry });
    for (const alias of entry.aliases ?? []) {
      items.push({ key: alias, entry });
    }
  }
  return items.sort((a, b) => b.key.length - a.key.length);
}

const LOOKUP = foodLookup();
const WHEY_ENTRY = FOOD_DATABASE['whey protein'];

function textIncludesFood(text: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (key.length <= 5) {
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  }
  return text.includes(key);
}

/** e.g. "30g protein", "30g of whey protein", "30g whey protein" */
function parseStatedProteinGrams(lower: string): number | null {
  const match = lower.match(
    /(\d+(?:\.\d+)?)\s*g(?:rams?)?(?:\s*(?:of\s+))?(?:\s*(?:whey|pea|plant|casein|isolate)\s+)?protein\b/,
  );
  return match ? parseFloat(match[1]) : null;
}

/** e.g. "30g whey" when not already parsed as protein grams */
function parseWheyPowderGrams(lower: string): number | null {
  if (parseStatedProteinGrams(lower) != null) return null;
  const match = lower.match(
    /(\d+(?:\.\d+)?)\s*g(?:rams?)?(?:\s*(?:of\s+))?whey(?:\s+protein)?(?:\s+powder)?\b/,
  );
  return match ? parseFloat(match[1]) : null;
}

function addFoodMacros(
  entry: FoodEntry,
  qty: number,
  totals: { calories: number; protein: number; carbs: number; fat: number; fibre: number },
  skipProtein = false,
) {
  totals.calories += entry.calories * qty;
  if (!skipProtein) totals.protein += entry.protein * qty;
  totals.carbs += entry.carbs * qty;
  totals.fat += entry.fat * qty;
  totals.fibre += entry.fibre * qty;
}

export function estimateMealNutrition(description: string) {
  const lower = description.toLowerCase();
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
  const matched: string[] = [];
  const matchedEntries = new Set<FoodEntry>();

  const statedProtein = parseStatedProteinGrams(lower);
  const wheyPowderG = parseWheyPowderGrams(lower);

  for (const { key, entry } of LOOKUP) {
    if (!textIncludesFood(lower, key) || matchedEntries.has(entry)) continue;

    if (statedProtein != null && entry === WHEY_ENTRY) continue;
    if (statedProtein != null && (key === 'protein shake')) continue;

    let qty = 1;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const foodPattern = new RegExp(
      `(\\d+(?:\\.\\d+)?)\\s*(g|kg|ml|l|oz|serving|scoop|scoups|egg|eggs|banana|bananas|biscuit|slice|slices|cup|cups|bowl|bowls|bar|roll|wrap|burger|pancake|bagel)?\\s*${escaped}|${escaped}\\s*(?:\\(|\\s)*(\\d+(?:\\.\\d+)?)?\\s*(g|kg|ml|l|scoop|scoups)?`,
      'i',
    );
    const match = lower.match(foodPattern);

    if (match) {
      const num = parseFloat(match[1] || match[3] || '1');
      const unit = (match[2] || match[4] || entry.unit).toLowerCase();
      if (unit === 'kg') qty = num * 1000;
      else if (unit === 'l') qty = num * 1000;
      else if (unit === 'ml' || unit === 'g') qty = num;
      else if (unit === 'scoop' || unit === 'scoups') qty = num;
      else qty = num;
    } else {
      const countMatch = lower.match(new RegExp(`(\\d+)\\s*${escaped}`, 'i'));
      if (countMatch) qty = parseInt(countMatch[1], 10);
      else if (entry === WHEY_ENTRY && /\bscoop/.test(lower)) qty = 30;
    }

    // Smoothie/shake base only — protein comes from stated whey amount
    const skipProtein = statedProtein != null && (key === 'smoothie' || key === 'protein shake');

    addFoodMacros(entry, qty, totals, skipProtein);
    matched.push(key);
    matchedEntries.add(entry);
  }

  if (statedProtein != null) {
    totals.protein += statedProtein;
    matched.push(`${statedProtein}g protein`);
  } else if (wheyPowderG != null) {
    addFoodMacros(
      FOOD_DATABASE['whey protein'],
      wheyPowderG,
      totals,
    );
    matched.push(`${wheyPowderG}g whey`);
  }

  if (totals.calories === 0 && statedProtein == null && wheyPowderG == null) {
    totals.calories = 400;
    totals.protein = 25;
    totals.carbs = 40;
    totals.fat = 15;
    totals.fibre = 3;
  } else if (totals.calories === 0 && (statedProtein != null || wheyPowderG != null)) {
    totals.calories = Math.round(totals.protein * 4 + totals.carbs * 4 + totals.fat * 9) || 200;
  }

  return {
    calories: Math.round(totals.calories),
    protein_g: Math.round(totals.protein * 10) / 10,
    carbs_g: Math.round(totals.carbs * 10) / 10,
    fat_g: Math.round(totals.fat * 10) / 10,
    fibre_g: Math.round(totals.fibre * 10) / 10,
    matchedFoods: matched,
    estimated: matched.length > 0,
  };
}

export function parseMealDate(message: string): string {
  const lower = message.toLowerCase();
  const d = new Date();

  if (lower.includes('yesterday')) {
    d.setDate(d.getDate() - 1);
  } else if (lower.includes('day before yesterday') || lower.includes('2 days ago')) {
    d.setDate(d.getDate() - 2);
  } else if (lower.match(/\b(\d+)\s*days?\s*ago\b/)) {
    const m = lower.match(/\b(\d+)\s*days?\s*ago\b/);
    if (m) d.setDate(d.getDate() - parseInt(m[1]));
  } else if (lower.includes('last night')) {
    d.setDate(d.getDate() - (d.getHours() < 12 ? 1 : 0));
    d.setHours(20, 0, 0, 0);
  }

  const isoMatch = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const parsed = new Date(isoMatch[1] + 'T12:00:00');
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const auDate = message.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (auDate) {
    const day = parseInt(auDate[1]);
    const month = parseInt(auDate[2]) - 1;
    const year = auDate[3] ? parseInt(auDate[3].length === 2 ? '20' + auDate[3] : auDate[3]) : d.getFullYear();
    const parsed = new Date(year, month, day, 12, 0, 0);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  if (lower.includes('this morning') || lower.includes('for breakfast')) d.setHours(8, 0, 0, 0);
  else if (lower.includes('for lunch')) d.setHours(12, 30, 0, 0);
  else if (lower.includes('for dinner') || lower.includes('tonight')) d.setHours(19, 0, 0, 0);

  return d.toISOString();
}

export function detectMealType(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('breakfast')) return 'breakfast';
  if (lower.includes('lunch')) return 'lunch';
  if (lower.includes('dinner') || lower.includes('tea')) return 'dinner';
  if (lower.includes('snack')) return 'snack';
  if (lower.includes('pre-workout') || lower.includes('pre workout')) return 'pre-workout';
  if (lower.includes('post-workout') || lower.includes('post workout')) return 'post-workout';
  return 'other';
}

export function isMealLogIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (lower.startsWith('log:') || lower.startsWith('log ')) return true;
  const logWords = /\b(log|logged|ate|had|drank|eaten|eating|breakfast|lunch|dinner|snack)\b/;
  const foodWords = /\b(weet|bix|chicken|rice|egg|milk|protein|shake|banana|bread|pasta|beef|salmon|oats|yogurt|burger|pizza|smoothie|\d+\s*(g|ml|kg|cup|bowl|biscuit|slice|scoop))\b/;
  return logWords.test(lower) && foodWords.test(lower);
}

export function extractMealDescription(message: string): string {
  return message
    .replace(/^log:\s*/i, '')
    .replace(/^log\s+/i, '')
    .replace(/^i\s+(ate|had|drank|eaten)\s+/i, '')
    .trim() || message;
}
