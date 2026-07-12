import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Sparkles, AlertCircle, CheckCircle2, Plus, MessageSquare, Trash2, Utensils } from 'lucide-react';
import { api } from '../services/api';

interface Message {
  role: string;
  content: string;
  source?: string;
  error?: string;
  mealLogged?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  last_message?: string;
}

const quickActions = [
  'How is my recovery today?',
  'Log: I ate 8 Weet-Bix with 500ml milk',
  'Yesterday for lunch I had 250g chicken and rice',
  'What should I eat before my match?',
  'Log my weight as 82.5kg',
  'Remove my last meal',
];

const STORAGE_KEY = 'aicoach_conversation_id';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [showHistory, setShowHistory] = useState(true);
  const [aiStatus, setAiStatus] = useState<{ configured: boolean; model: string; source: string; hint?: string } | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [connectionTest, setConnectionTest] = useState<{ ok: boolean; model?: string; error?: string; latencyMs?: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(() => {
    api.ai.getConversations().then(list => setConversations(list as Conversation[])).catch(console.error);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const msgs = await api.ai.getMessages(id) as { role: string; content: string; metadata?: string }[];
    setMessages(msgs.map(m => ({
      role: m.role,
      content: m.content,
      mealLogged: m.metadata ? !!(JSON.parse(m.metadata) as { mealLogged?: unknown }).mealLogged : false,
    })));
    setConversationId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  useEffect(() => {
    api.aiConfig.get().then(setAiStatus).catch(() => setAiStatus({ configured: false, model: 'unknown', source: 'none' }));
    loadConversations();
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (savedId) loadConversation(savedId).catch(() => localStorage.removeItem(STORAGE_KEY));
  }, [loadConversations, loadConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startNewChat = () => {
    setConversationId(undefined);
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    await api.ai.deleteConversation(id);
    if (conversationId === id) startNewChat();
    loadConversations();
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const result = await api.ai.chat(text, conversationId);
      setConversationId(result.conversationId);
      localStorage.setItem(STORAGE_KEY, result.conversationId);
      if (result.model) setLastModel(result.model);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.response,
        source: result.source,
        error: result.error,
        mealLogged: !!result.mealLogged,
      }]);
      loadConversations();
      if (result.source === 'fallback' && result.error) {
        setConnectionTest({ ok: false, error: result.error });
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${(err as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setConnectionTest({ ok: false, error: 'Testing...' });
    try {
      const result = await api.ai.test();
      setConnectionTest(result);
    } catch (err) {
      setConnectionTest({ ok: false, error: (err as Error).message });
    }
  };

  const formatContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/✅/g, '✅');
      return <p key={i} className="mb-1" dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)]">
      {/* Conversation history sidebar */}
      {showHistory && (
        <aside className="hidden md:flex flex-col w-64 shrink-0 card overflow-hidden">
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <span className="font-semibold text-sm">Conversations</span>
            <button onClick={startNewChat} className="p-1.5 rounded-lg hover:bg-brand-500/10 text-brand-500" title="New chat">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 && (
              <p className="text-xs text-gray-500 p-2">No saved chats yet</p>
            )}
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full text-left p-2 rounded-lg text-sm group flex items-start gap-2 ${
                  conversationId === conv.id ? 'bg-brand-500/10 text-brand-600' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 opacity-50" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{conv.title || 'Chat'}</p>
                  <p className="text-xs text-gray-500 truncate">{conv.last_message?.slice(0, 40)}</p>
                </div>
                <button onClick={e => deleteChat(conv.id, e)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))}
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-brand-500" /> AI Coach
              </h1>
              <p className="text-gray-500 text-sm">Say "Log: I ate..." to save meals with date &amp; time</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={startNewChat} className="md:hidden btn-secondary text-xs px-2 py-1 flex items-center gap-1">
                <Plus className="w-3 h-3" /> New
              </button>
              {aiStatus && (
                <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${
                  aiStatus.configured ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                }`}>
                  {aiStatus.configured ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {aiStatus.configured ? `OpenRouter · ${lastModel ?? aiStatus.model}` : 'API key not configured'}
                </span>
              )}
              <button onClick={testConnection} className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-brand-500/10">
                Test connection
              </button>
            </div>
          </div>
          {connectionTest && (
            <p className={`text-xs mt-2 ${connectionTest.ok ? 'text-green-600' : 'text-amber-600'}`}>
              {connectionTest.ok
                ? `Connected (${connectionTest.model}, ${connectionTest.latencyMs}ms)`
                : `Connection issue: ${connectionTest.error}`}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="w-12 h-12 text-brand-500 mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Your Personal AI Coach</h3>
              <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
                Conversations are saved automatically. Log meals naturally — e.g. "Log: I ate 8 Weet-Bix with milk" or "Yesterday I had chicken and rice for dinner".
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                {quickActions.map(action => (
                  <button key={action} onClick={() => sendMessage(action)}
                    className="text-sm px-3 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-brand-500/10 hover:text-brand-500 transition-colors">
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-brand-500" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user' ? 'bg-brand-500 text-white' : 'card'
              }`}>
                <div className="text-sm">{formatContent(msg.content)}</div>
                {msg.mealLogged && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    <Utensils className="w-3 h-3" /> Saved to nutrition log
                  </p>
                )}
                {msg.role === 'assistant' && msg.source === 'fallback' && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Using offline mode
                  </p>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-brand-500 animate-pulse" />
              </div>
              <div className="card px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
          <input
            className="input flex-1"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder='Log: "I ate 250g chicken and rice" or ask anything...'
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()} className="btn-primary px-4">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
