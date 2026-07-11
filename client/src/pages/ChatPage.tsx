import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { api } from '../services/api';

interface Message {
  role: string;
  content: string;
}

const quickActions = [
  'How is my recovery today?',
  'Log: I ate 8 Weet-Bix with 500ml milk',
  'What should I eat before my match?',
  'Generate my daily report',
  'Am I overtraining?',
  'Log my weight as 82.5kg',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const result = await api.ai.chat(text, conversationId);
      setConversationId(result.conversationId);
      setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${(err as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const formatContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return <p key={i} className="mb-1" dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-brand-500" /> AI Coach
        </h1>
        <p className="text-gray-500 text-sm">Interconnected intelligence across all your data</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot className="w-12 h-12 text-brand-500 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">Your Personal AI Coach</h3>
            <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
              I have access to all your recovery, nutrition, training, academic, and lifestyle data. Ask me anything or log data naturally.
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
              msg.role === 'user'
                ? 'bg-brand-500 text-white'
                : 'card'
            }`}>
              <div className="text-sm">{formatContent(msg.content)}</div>
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
          placeholder="Ask anything or log data naturally..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} className="btn-primary px-4">
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
