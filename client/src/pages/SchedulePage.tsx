import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Mail, Link2, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { LoadingSpinner, StatCard } from '../components/ui';
import { fmtDateShort, capitalize } from '../utils/format';

type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  event_type: string;
  source: string;
};

export default function SchedulePage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.data.getCalendar().then(data => setEvents(data as CalendarEvent[])).finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <LoadingSpinner />;

  const upcoming = events.filter(e => new Date(e.start_time) >= new Date()).sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  const emails = events.filter(e => e.source === 'gmail').slice(0, 10);
  const calendarEvents = upcoming.filter(e => e.source !== 'gmail');
  const exams = upcoming.filter(e => e.event_type === 'exam');
  const matches = upcoming.filter(e => e.event_type === 'match');

  const typeColor: Record<string, string> = {
    match: 'border-red-500/50 bg-red-50 dark:bg-red-900/20',
    exam: 'border-purple-500/50 bg-purple-50 dark:bg-purple-900/20',
    training: 'border-blue-500/50 bg-blue-50 dark:bg-blue-900/20',
    email: 'border-gray-400/50',
    general: 'border-gray-300 dark:border-gray-600',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-gray-500 mt-1">Calendar, emails & auto-detected events</p>
        </div>
        <Link to="/integrations" className="btn-secondary inline-flex items-center gap-2 self-start">
          <Link2 className="w-4 h-4" /> Connect Google
        </Link>
      </div>

      {events.length === 0 && (
        <div className="card p-4 flex items-start gap-3 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">No schedule data yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Connect Google on the <Link to="/integrations" className="text-brand-500 underline">Integrations</Link> page — one click imports your calendar and recent emails automatically.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Upcoming Events" value={calendarEvents.length} icon={<Calendar className="w-5 h-5" />} />
        <StatCard title="Recent Emails" value={emails.length} icon={<Mail className="w-5 h-5" />} />
        <StatCard title="Exams" value={exams.length} />
        <StatCard title="Matches" value={matches.length} />
      </div>

      {calendarEvents.length > 0 && (
        <div className="card p-4 md:p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Calendar className="w-4 h-4" /> Upcoming Events</h3>
          <div className="space-y-2">
            {calendarEvents.slice(0, 20).map(event => (
              <div key={event.id} className={`p-3 rounded-xl border-l-4 ${typeColor[event.event_type] ?? typeColor.general}`}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs text-gray-500 mt-1">{fmtDateShort(event.start_time)} · {capitalize(event.event_type)} · {event.source.replace('_', ' ')}</p>
                  </div>
                </div>
                {event.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{event.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {emails.length > 0 && (
        <div className="card p-4 md:p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Mail className="w-4 h-4" /> Recent Emails</h3>
          <div className="space-y-2">
            {emails.map(event => (
              <div key={event.id} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <p className="font-medium text-sm">{event.title}</p>
                <p className="text-xs text-gray-500 mt-1">{fmtDateShort(event.start_time)}</p>
                {event.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{event.description.split('\n')[1] ?? event.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
