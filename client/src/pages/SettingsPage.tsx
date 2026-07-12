import { useEffect, useState } from 'react';
import { Plus, Trash2, Brain } from 'lucide-react';
import { api } from '../services/api';
import { LoadingSpinner } from '../components/ui';

const AI_MODELS = [
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-luna-pro',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-chat',
];

export default function SettingsPage() {
  const [profile, setProfile] = useState<Record<string, unknown>>({});
  const [memories, setMemories] = useState<Record<string, unknown>[]>([]);
  const [aiConfig, setAiConfig] = useState<{ configured: boolean; model: string; source: string } | null>(null);
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState('openai/gpt-5.6-luna');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [newMemory, setNewMemory] = useState({ category: 'general', key: '', value: '' });

  useEffect(() => {
    Promise.all([api.auth.me(), api.ai.getMemories(), api.aiConfig.get()])
      .then(([{ profile: p }, m, ai]) => {
        setProfile(p || {});
        setMemories(m as Record<string, unknown>[]);
        setAiConfig(ai);
        setAiModel(ai.model);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async () => {
    await api.auth.updateProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addMemory = async () => {
    if (!newMemory.key || !newMemory.value) return;
    await api.ai.addMemory(newMemory);
    setNewMemory({ category: 'general', key: '', value: '' });
    const m = await api.ai.getMemories();
    setMemories(m as Record<string, unknown>[]);
  };

  const saveAIConfig = async () => {
    const result = await api.aiConfig.update({
      ...(aiKey && { apiKey: aiKey }),
      model: aiModel,
    });
    setAiConfig(result as typeof aiConfig);
    setAiKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const deleteMemory = async (id: string) => {
    await api.ai.deleteMemory(id);
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="card p-4 md:p-6 space-y-4">
        <h2 className="font-semibold text-lg">Profile</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Sport</label>
            <input className="input mt-1" value={(profile.sport as string) || ''} onChange={e => setProfile({ ...profile, sport: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium">Goal Type</label>
            <select className="input mt-1" value={(profile.goal_type as string) || 'maintenance'} onChange={e => setProfile({ ...profile, goal_type: e.target.value })}>
              <option value="bulking">Bulking</option>
              <option value="cutting">Cutting</option>
              <option value="maintenance">Maintenance</option>
              <option value="performance">Performance</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Target Weight (kg)</label>
            <input className="input mt-1" type="number" value={(profile.target_weight_kg as number) || ''} onChange={e => setProfile({ ...profile, target_weight_kg: +e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium">Height (cm)</label>
            <input className="input mt-1" type="number" value={(profile.height_cm as number) || ''} onChange={e => setProfile({ ...profile, height_cm: +e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium">Target Calories</label>
            <input className="input mt-1" type="number" value={(profile.target_calories as number) || ''} onChange={e => setProfile({ ...profile, target_calories: +e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium">Target Protein (g)</label>
            <input className="input mt-1" type="number" value={(profile.target_protein_g as number) || ''} onChange={e => setProfile({ ...profile, target_protein_g: +e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium">Target Carbs (g)</label>
            <input className="input mt-1" type="number" value={(profile.target_carbs_g as number) || ''} onChange={e => setProfile({ ...profile, target_carbs_g: +e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium">Target Fat (g)</label>
            <input className="input mt-1" type="number" value={(profile.target_fat_g as number) || ''} onChange={e => setProfile({ ...profile, target_fat_g: +e.target.value })} />
          </div>
        </div>
        <button onClick={saveProfile} className="btn-primary">{saved ? 'Saved!' : 'Save Profile'}</button>
      </div>

      <div className="card p-4 md:p-6 space-y-4">
        <h2 className="font-semibold text-lg flex items-center gap-2"><Brain className="w-5 h-5 text-brand-500" /> AI (OpenRouter)</h2>
        <p className="text-sm text-gray-500">
          Powered by OpenRouter. {aiConfig?.configured
            ? `Configured via ${aiConfig.source === 'env' ? '.env file' : 'your settings'}. Preferred model: ${aiConfig.model}`
            : 'Add your API key below or set OPENROUTER_API_KEY in .env'}
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Paid models (e.g. gpt-5.6-luna) require OpenRouter credits. If credits are unavailable, free models are tried automatically.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">API Key (optional override)</label>
            <input className="input mt-1" type="password" placeholder="sk-or-v1-..." value={aiKey} onChange={e => setAiKey(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Model</label>
            <select className="input mt-1" value={aiModel} onChange={e => setAiModel(e.target.value)}>
              {AI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <button onClick={saveAIConfig} className="btn-primary">{saved ? 'Saved!' : 'Save AI Settings'}</button>
      </div>

      <div className="card p-4 md:p-6 space-y-4">
        <h2 className="font-semibold text-lg">AI Memories</h2>
        <p className="text-sm text-gray-500">Facts the AI uses for personalized recommendations. Auto-learned memories are discovered from your chat, schedule, and behavior — you can override them by adding your own.</p>

        <div className="flex gap-2 flex-wrap">
          <input className="input flex-1 min-w-[120px]" placeholder="Category" value={newMemory.category} onChange={e => setNewMemory({ ...newMemory, category: e.target.value })} />
          <input className="input flex-1 min-w-[120px]" placeholder="Key" value={newMemory.key} onChange={e => setNewMemory({ ...newMemory, key: e.target.value })} />
          <input className="input flex-1 min-w-[120px]" placeholder="Value" value={newMemory.value} onChange={e => setNewMemory({ ...newMemory, value: e.target.value })} />
          <button onClick={addMemory} className="btn-primary flex items-center gap-1"><Plus className="w-4 h-4" /> Add</button>
        </div>

        {memories.length === 0 ? (
          <p className="text-sm text-gray-500">No memories stored yet.</p>
        ) : (
          <div className="space-y-2">
            {memories.map(m => (
              <div key={m.id as string} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-brand-500 font-medium">{m.category as string}</span>
                    {(m.source as string) === 'auto' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">Auto-learned</span>
                    )}
                  </div>
                  <p className="text-sm font-medium">{m.key as string}: {m.value as string}</p>
                </div>
                <button onClick={() => deleteMemory(m.id as string)} className="text-red-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4 text-sm text-gray-500">
        <p><strong>Local-first:</strong> All data is stored in SQLite on your machine at <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">./data/aicoach.db</code></p>
        <p className="mt-2"><strong>AI:</strong> Uses OpenRouter for cloud AI with full access to all your interconnected data. API key stored locally in .env or settings.</p>
      </div>
    </div>
  );
}
