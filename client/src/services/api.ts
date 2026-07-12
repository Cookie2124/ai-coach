const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('aicoach_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('aicoach_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  auth: {
    register: (data: { email: string; password: string; name: string }) =>
      request<{ token: string; user: { id: string; email: string; name: string } }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: { id: string; email: string; name: string } }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<{ user: { id: string; email: string; name: string }; profile: Record<string, unknown> }>('/auth/me'),
    updateProfile: (data: Record<string, unknown>) =>
      request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  },
  dashboard: () => request<Record<string, unknown>>('/analytics/dashboard'),
  nutrition: () => request<Record<string, unknown>>('/analytics/nutrition'),
  recovery: () => request<Record<string, unknown>>('/analytics/recovery'),
  training: (days?: number) => request<Record<string, unknown>>(`/analytics/training${days ? `?days=${days}` : ''}`),
  strength: () => request<Record<string, unknown>>('/analytics/strength'),
  weight: () => request<{ trend: Record<string, unknown>; history: unknown[] }>('/analytics/weight'),
  correlations: () => request<unknown[]>('/analytics/correlations'),
  insights: () => request<unknown[]>('/analytics/insights'),

  data: {
    getMeals: (date?: string) => request<unknown[]>(`/data/meals${date ? `?date=${date}` : ''}`),
    logMeal: (data: { description: string; meal_type?: string; logged_at?: string }) =>
      request('/data/meals', { method: 'POST', body: JSON.stringify(data) }),
    deleteMeal: (id: string) => request<{ success: boolean }>(`/data/meals/${id}`, { method: 'DELETE' }),
    logWeight: (data: { weight_kg: number; notes?: string }) =>
      request('/data/weight', { method: 'POST', body: JSON.stringify(data) }),
    getWorkouts: () => request<unknown[]>('/data/workouts'),
    logWorkout: (data: Record<string, unknown>) =>
      request('/data/workouts', { method: 'POST', body: JSON.stringify(data) }),
    logStrength: (data: Record<string, unknown>) =>
      request('/data/strength', { method: 'POST', body: JSON.stringify(data) }),
    getStrength: () => request<unknown[]>('/data/strength'),
    logRecovery: (data: Record<string, unknown>) =>
      request('/data/recovery', { method: 'POST', body: JSON.stringify(data) }),
    logSleep: (data: Record<string, unknown>) =>
      request('/data/sleep', { method: 'POST', body: JSON.stringify(data) }),
    logLifestyle: (data: Record<string, unknown>) =>
      request('/data/lifestyle', { method: 'POST', body: JSON.stringify(data) }),
    getAcademic: () => request<{ items: unknown[]; sessions: unknown[] }>('/data/academic'),
    addAcademic: (data: Record<string, unknown>) =>
      request('/data/academic', { method: 'POST', body: JSON.stringify(data) }),
    logStudy: (data: Record<string, unknown>) =>
      request('/data/study', { method: 'POST', body: JSON.stringify(data) }),
    getGoals: () => request<unknown[]>('/data/goals'),
    addGoal: (data: Record<string, unknown>) =>
      request('/data/goals', { method: 'POST', body: JSON.stringify(data) }),
    getCalendar: () => request<unknown[]>('/data/calendar'),
    addCalendar: (data: Record<string, unknown>) =>
      request('/data/calendar', { method: 'POST', body: JSON.stringify(data) }),
  },

  ai: {
    chat: (message: string, conversationId?: string) =>
      request<{ conversationId: string; response: string; metadata: Record<string, unknown>; source?: string; model?: string; error?: string; aiConfigured?: boolean; mealLogged?: Record<string, unknown>; weightLogged?: Record<string, unknown> }>('/ai/chat', {
        method: 'POST', body: JSON.stringify({ message, conversationId }),
      }),
    test: () => request<{ ok: boolean; model?: string; error?: string; latencyMs?: number }>('/ai/test', { method: 'POST' }),
    deleteConversation: (id: string) => request(`/ai/conversations/${id}`, { method: 'DELETE' }),
    getConversations: () => request<unknown[]>('/ai/conversations'),
    getMessages: (id: string) => request<unknown[]>(`/ai/conversations/${id}/messages`),
    generateReport: (type: string) => request<Record<string, unknown>>(`/ai/reports/${type}`, { method: 'POST' }),
    getReports: () => request<unknown[]>('/ai/reports'),
    getMemories: () => request<unknown[]>('/ai/memories'),
    addMemory: (data: { category: string; key: string; value: string }) =>
      request('/ai/memories', { method: 'POST', body: JSON.stringify(data) }),
    deleteMemory: (id: string) => request(`/ai/memories/${id}`, { method: 'DELETE' }),
  },

  learning: {
    status: () => request<{ autoMemories: unknown[]; learningInsights: unknown[]; totalAutoMemories: number }>('/learning/status'),
    run: () => request<{ autoMemories: number; newInsights: number; lastRun: string }>('/learning/run', { method: 'POST' }),
  },

  integrations: {
    list: () => request<unknown[]>('/integrations'),
    getProviders: (clientUrl?: string) => {
      const qs = clientUrl ? `?client_url=${encodeURIComponent(clientUrl)}` : '';
      return request<{ providers: Record<string, unknown>; oauthAvailable: Record<string, boolean>; oauthCallbackUrl: string }>(`/integrations/providers${qs}`);
    },
    connect: (provider: string, clientUrl?: string) => {
      const qs = clientUrl ? `?client_url=${encodeURIComponent(clientUrl)}` : '';
      return request<{ url: string; redirectUri?: string }>(`/integrations/${provider}/connect${qs}`);
    },
    configure: (provider: string, data: Record<string, unknown>) =>
      request(`/integrations/${provider}/configure`, { method: 'POST', body: JSON.stringify(data) }),
    sync: (provider: string, options?: { fullHistory?: boolean; days?: number }) =>
      request<Record<string, unknown>>(`/integrations/${provider}/sync`, {
        method: 'POST',
        body: JSON.stringify(options ?? {}),
      }),
    whoopStatus: () => request<Record<string, unknown>>('/integrations/whoop/status'),
    syncAll: () => request<Record<string, unknown>>('/integrations/sync-all', { method: 'POST' }),
    disconnect: (provider: string) => request(`/integrations/${provider}`, { method: 'DELETE' }),
    importAppleHealth: (data: unknown) =>
      request<Record<string, number>>('/integrations/apple_health/import', { method: 'POST', body: JSON.stringify(data) }),
  },

  aiConfig: {
    get: () => request<{ configured: boolean; model: string; source: string; hint?: string }>('/ai/config'),
    update: (data: { apiKey?: string; model?: string }) =>
      request('/ai/config', { method: 'POST', body: JSON.stringify(data) }),
  },
};
