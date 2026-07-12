import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login, register, user } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-gradient-to-br from-brand-500/10 via-transparent to-indigo-500/10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-500 mb-4">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">AiCoach</h1>
          <p className="text-gray-500 mt-2">Your local AI-powered athlete operating system</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <h2 className="text-xl font-semibold">{isRegister ? 'Create Account' : 'Welcome Back'}</h2>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{error}</div>
          )}

          {isRegister && (
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Loading...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-gray-500">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button type="button" onClick={() => setIsRegister(!isRegister)} className="text-brand-500 hover:underline font-medium">
              {isRegister ? 'Sign In' : 'Register'}
            </button>
          </p>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          All data stored locally on your machine. No cloud required.
        </p>
      </div>
    </div>
  );
}
