import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Utensils, Dumbbell, Heart, BookOpen, Calendar,
  Settings, LogOut, Menu, X, Moon, Sun, Activity, FileText, Brain, Link2, MoreHorizontal
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import clsx from 'clsx';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/chat', icon: MessageSquare, label: 'AI Coach' },
  { to: '/nutrition', icon: Utensils, label: 'Nutrition' },
  { to: '/training', icon: Dumbbell, label: 'Training' },
  { to: '/recovery', icon: Heart, label: 'Recovery' },
  { to: '/academic', icon: BookOpen, label: 'Academic' },
  { to: '/schedule', icon: Calendar, label: 'Schedule' },
  { to: '/insights', icon: Brain, label: 'Insights' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/integrations', icon: Link2, label: 'Integrations' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const bottomNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home', end: true },
  { to: '/chat', icon: MessageSquare, label: 'Coach' },
  { to: '/nutrition', icon: Utensils, label: 'Food' },
  { to: '/recovery', icon: Heart, label: 'Recovery' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isChat = location.pathname === '/chat';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  const sidebar = (
    <aside className={clsx(
      'fixed inset-y-0 left-0 z-50 w-[min(85vw,18rem)] bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-200 lg:translate-x-0 lg:static lg:w-64',
      sidebarOpen ? 'translate-x-0' : '-translate-x-full'
    )}>
      <div className="flex flex-col h-full pt-[env(safe-area-inset-top)]">
        <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-500 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-lg truncate">AiCoach</h1>
              <p className="text-xs text-gray-500 truncate">Student Athlete OS</p>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 touch-target"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-2 sm:p-3 space-y-0.5 overflow-y-auto overscroll-contain">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={closeSidebar}
              className={({ isActive }) => clsx('nav-link touch-target', isActive && 'nav-link-active')}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-2 sm:p-3 border-t border-gray-200 dark:border-gray-800 space-y-0.5 pb-[env(safe-area-inset-bottom)]">
          <button onClick={toggleTheme} className="nav-link w-full touch-target">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <div className="px-3 py-2 text-sm text-gray-500 truncate">{user?.name}</div>
          <button onClick={handleLogout} className="nav-link w-full text-red-500 hover:text-red-600 touch-target">
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-dvh max-w-[100vw] overflow-x-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeSidebar} aria-hidden />
      )}
      {sidebar}

      <div className="flex-1 flex flex-col min-w-0 min-h-dvh">
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2 sm:p-4 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur supports-[padding:max(0px)]:pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="touch-target p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="font-bold truncate text-base sm:text-lg">
            {navItems.find(n => n.to === location.pathname || (n.to !== '/' && location.pathname.startsWith(n.to)))?.label ?? 'AiCoach'}
          </h1>
          <button
            onClick={toggleTheme}
            className="touch-target p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </header>

        <main className={clsx(
          'flex-1 flex flex-col min-h-0 overflow-x-hidden',
          isChat ? 'p-0 lg:p-8' : 'overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8',
          'pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-8',
        )}>
          <div className={clsx(isChat ? 'flex flex-col flex-1 min-h-0' : 'max-w-7xl mx-auto w-full')}>
            <Outlet />
          </div>
        </main>

        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
          aria-label="Primary navigation"
        >
          <div className="grid grid-cols-5 h-16">
            {bottomNavItems.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => clsx(
                  'flex flex-col items-center justify-center gap-0.5 text-[10px] sm:text-xs font-medium transition-colors touch-target',
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400',
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 text-[10px] sm:text-xs font-medium transition-colors touch-target',
                sidebarOpen ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400',
              )}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span>More</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
