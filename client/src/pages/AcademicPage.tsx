import { useEffect, useState } from 'react';
import { Plus, CheckCircle2, Circle } from 'lucide-react';
import { api } from '../services/api';
import { StatCard, ProgressBar, LoadingSpinner } from '../components/ui';

export default function AcademicPage() {
  const [data, setData] = useState<{ items: Record<string, unknown>[]; sessions: Record<string, unknown>[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'assignment', subject: '', due_date: '', estimated_hours: 2, stress_level: 5 });

  const load = () => {
    api.data.getAcademic().then(d => setData({ items: d.items as Record<string, unknown>[], sessions: d.sessions as Record<string, unknown>[] })).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.data.addAcademic(form);
    setShowForm(false);
    setForm({ title: '', type: 'assignment', subject: '', due_date: '', estimated_hours: 2, stress_level: 5 });
    load();
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    await fetch(`/api/data/academic/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('aicoach_token')}` },
      body: JSON.stringify({ completed: !completed }),
    });
    load();
  };

  if (loading) return <LoadingSpinner />;

  const items = data?.items ?? [];
  const sessions = data?.sessions ?? [];
  const pending = items.filter(i => !i.completed);
  const completed = items.filter(i => i.completed);
  const totalHours = pending.reduce((s, i) => s + (i.estimated_hours as number || 2), 0);
  const studyHours = sessions.reduce((s, sess) => s + (sess.duration_minutes as number || 0), 0) / 60;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Academic</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {showForm && (
        <form onSubmit={addItem} className="card p-4 grid sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
          <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="assignment">Assignment</option>
            <option value="exam">Exam</option>
            <option value="project">Project</option>
          </select>
          <input className="input" placeholder="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          <input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          <input className="input" type="number" placeholder="Est. hours" value={form.estimated_hours} onChange={e => setForm({ ...form, estimated_hours: +e.target.value })} />
          <input className="input" type="range" min={1} max={10} value={form.stress_level} onChange={e => setForm({ ...form, stress_level: +e.target.value })} />
          <button type="submit" className="btn-primary sm:col-span-2">Add</button>
        </form>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Pending Items" value={pending.length} />
        <StatCard title="Est. Workload" value={`${totalHours}h`} />
        <StatCard title="Study Hours" value={`${Math.round(studyHours)}h`} subtitle="recent sessions" />
        <StatCard title="Completion Rate" value={items.length ? `${Math.round(completed.length / items.length * 100)}%` : '--'} />
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Pending</h3>
        {pending.length === 0 ? (
          <p className="text-gray-500 text-sm">No pending items. You're caught up!</p>
        ) : (
          <div className="space-y-2">
            {pending.map(item => (
              <div key={item.id as string} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <button onClick={() => toggleComplete(item.id as string, false)}>
                  <Circle className="w-5 h-5 text-gray-400 hover:text-brand-500" />
                </button>
                <div className="flex-1">
                  <p className="font-medium text-sm">{item.title as string}</p>
                  <p className="text-xs text-gray-500">
                    {item.type as string} | {item.subject as string} | Due: {item.due_date as string}
                    {item.type === 'exam' && ' | ⚠ Exam'}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800">
                  Stress: {item.stress_level as number}/10
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
