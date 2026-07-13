import { useEffect, useState } from 'react';
import { Plus, Circle, Clock, BookOpen, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { StatCard, ProgressBar, LoadingSpinner } from '../components/ui';

type StudyPlanItem = {
  id: string;
  title: string;
  type: string;
  subject: string;
  due_date: string;
  daysUntil: number;
  estimated_hours: number;
  recommendedHoursToday: number;
  recommendedHoursThisWeek: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  stress_level: number;
};

type StudyPlan = {
  plan: StudyPlanItem[];
  totalRecommendedToday: number;
  totalRecommendedWeek: number;
  studyHoursLoggedWeek: number;
  hoursGapWeek: number;
  nextExam?: StudyPlanItem;
  criticalCount: number;
};

const urgencyColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export default function AcademicPage() {
  const [data, setData] = useState<{ items: Record<string, unknown>[]; sessions: Record<string, unknown>[]; studyPlan?: StudyPlan } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showStudyLog, setShowStudyLog] = useState(false);
  const [studyForm, setStudyForm] = useState({ subject: '', duration_minutes: 60, notes: '' });
  const [form, setForm] = useState({ title: '', type: 'assignment', subject: '', due_date: '', estimated_hours: 2, stress_level: 5 });

  const load = () => {
    api.data.getAcademic().then(d => setData(d as typeof data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.data.addAcademic(form);
    setShowForm(false);
    setForm({ title: '', type: 'assignment', subject: '', due_date: '', estimated_hours: 2, stress_level: 5 });
    load();
  };

  const logStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.data.logStudy(studyForm);
    setShowStudyLog(false);
    setStudyForm({ subject: '', duration_minutes: 60, notes: '' });
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
  const studyPlan = data?.studyPlan;
  const pending = items.filter(i => !i.completed);
  const completed = items.filter(i => i.completed);
  const studyHoursLogged = studyPlan?.studyHoursLoggedWeek ?? sessions.reduce((s, sess) => s + (sess.duration_minutes as number || 0), 0) / 60;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold">Academic</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowStudyLog(!showStudyLog)} className="btn-secondary flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4" /> Log Study
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      {studyPlan && studyPlan.plan.length > 0 && (
        <div className="card p-4 md:p-6 border-2 border-brand-500/20 bg-brand-50/30 dark:bg-brand-900/10">
          <div className="flex items-start gap-3">
            <BookOpen className="w-6 h-6 text-brand-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold">Your study plan</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                Based on due dates & workload — AiCoach adjusts as exams get closer.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <StatCard title="Today" value={`${studyPlan.totalRecommendedToday}h`} subtitle="recommended" />
                <StatCard title="This week" value={`${studyPlan.totalRecommendedWeek}h`} subtitle="needed" />
                <StatCard title="Logged" value={`${Math.round(studyHoursLogged * 10) / 10}h`} subtitle="this week" />
                <StatCard title="Gap" value={`${studyPlan.hoursGapWeek}h`} subtitle={studyPlan.hoursGapWeek > 0 ? 'to catch up' : 'on track'} />
              </div>
              {studyPlan.hoursGapWeek > 0 && (
                <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>You&apos;re ~{studyPlan.hoursGapWeek}h behind this week&apos;s plan. Prioritize items marked critical/high.</span>
                </div>
              )}
              {studyPlan.nextExam && (
                <p className="mt-3 text-sm font-medium text-brand-700 dark:text-brand-300">
                  Next exam: {studyPlan.nextExam.title} in {studyPlan.nextExam.daysUntil} day(s) — aim {studyPlan.nextExam.recommendedHoursToday}h today
                </p>
              )}
            </div>
          </div>
          <ProgressBar
            value={studyHoursLogged}
            max={Math.max(studyPlan.totalRecommendedWeek, 1)}
            label="Weekly study progress"
            color="bg-brand-500"
          />
        </div>
      )}

      {showStudyLog && (
        <form onSubmit={logStudy} className="card p-4 grid sm:grid-cols-3 gap-3">
          <input className="input" placeholder="Subject" value={studyForm.subject} onChange={e => setStudyForm({ ...studyForm, subject: e.target.value })} required />
          <input className="input" type="number" min={5} step={5} placeholder="Minutes" value={studyForm.duration_minutes} onChange={e => setStudyForm({ ...studyForm, duration_minutes: +e.target.value })} />
          <input className="input" placeholder="Notes (optional)" value={studyForm.notes} onChange={e => setStudyForm({ ...studyForm, notes: e.target.value })} />
          <button type="submit" className="btn-primary sm:col-span-3">Log session</button>
        </form>
      )}

      {showForm && (
        <form onSubmit={addItem} className="card p-4 grid sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
          <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="assignment">Assignment</option>
            <option value="exam">Exam</option>
            <option value="project">Project</option>
          </select>
          <input className="input" placeholder="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          <input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} required />
          <input className="input" type="number" placeholder="Est. hours" value={form.estimated_hours} onChange={e => setForm({ ...form, estimated_hours: +e.target.value })} />
          <label className="flex items-center gap-2 text-sm px-2">
            Stress {form.stress_level}/10
            <input className="flex-1" type="range" min={1} max={10} value={form.stress_level} onChange={e => setForm({ ...form, stress_level: +e.target.value })} />
          </label>
          <button type="submit" className="btn-primary sm:col-span-2">Add</button>
        </form>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Pending" value={pending.length} />
        <StatCard title="Urgent" value={studyPlan?.criticalCount ?? 0} subtitle="critical/high" />
        <StatCard title="Study logged" value={`${Math.round(studyHoursLogged)}h`} subtitle="this week" />
        <StatCard title="Done" value={items.length ? `${Math.round(completed.length / items.length * 100)}%` : '—'} />
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Priority queue</h3>
        {pending.length === 0 ? (
          <p className="text-gray-500 text-sm">No pending items. You&apos;re caught up!</p>
        ) : (
          <div className="space-y-2">
            {(studyPlan?.plan?.length ? studyPlan.plan : pending.map(p => ({
              id: p.id as string,
              title: p.title as string,
              type: p.type as string,
              subject: p.subject as string,
              due_date: p.due_date as string,
              daysUntil: 0,
              recommendedHoursToday: (p.estimated_hours as number) || 2,
              recommendedHoursThisWeek: (p.estimated_hours as number) || 2,
              urgency: 'medium' as const,
            }))).map(row => (
                <div key={row.id} className="flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <button onClick={() => toggleComplete(row.id, false)} className="mt-0.5">
                    <Circle className="w-5 h-5 text-gray-400 hover:text-brand-500" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{row.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {row.type} · {row.subject} · due {row.due_date}
                      {row.daysUntil >= 0 && row.daysUntil !== 0 && ` · ${row.daysUntil}d left`}
                    </p>
                    <p className="text-xs text-brand-600 dark:text-brand-400 mt-1">
                      Study ~{row.recommendedHoursToday}h today · {row.recommendedHoursThisWeek}h this week
                    </p>
                  </div>
                  <span className={`text-[10px] uppercase font-semibold px-2 py-1 rounded-full shrink-0 ${urgencyColors[row.urgency] ?? urgencyColors.medium}`}>
                    {row.urgency}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Recent study sessions</h3>
          <div className="space-y-2">
            {sessions.slice(0, 8).map(sess => (
              <div key={sess.id as string} className="flex justify-between text-sm py-1 border-b border-gray-50 dark:border-gray-800 last:border-0">
                <span>{sess.subject as string || 'Study'} · {Math.round((sess.duration_minutes as number) / 6) / 10}h</span>
                <span className="text-gray-500 text-xs">{new Date(sess.recorded_at as string).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
