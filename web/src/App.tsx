import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Home from './features/citizen/Home';
import NotFound from './features/citizen/NotFound';
import { RequireRole } from './lib/auth';
import { ListSkeleton } from './components/ui/States';
import { flushOutbox } from './lib/submit';
import { useToast } from './components/ui/Toast';

// Only the home screen is in the first download. The report flow loads next
// (and is precached for offline use); staff screens are never sent to citizens.
const ReportFlow = lazy(() => import('./features/citizen/report/ReportFlow'));
const Track = lazy(() => import('./features/citizen/Track'));
const MyReports = lazy(() => import('./features/citizen/MyReports'));
const SignIn = lazy(() => import('./features/citizen/SignIn'));
const StaffLogin = lazy(() => import('./features/staff/StaffLogin'));
const Dashboard = lazy(() => import('./features/dispatcher/Dashboard'));
const TechJobs = lazy(() => import('./features/tech/Jobs'));
const Admin = lazy(() => import('./features/admin/Admin'));

function useOutboxSync() {
  const { t } = useTranslation();
  const toast = useToast();
  useEffect(() => {
    const flush = async () => {
      const sent = await flushOutbox();
      if (sent.length) toast({ tone: 'success', message: t('report.outboxSent', { count: sent.length }) });
    };
    void flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [t, toast]);
}

export default function App() {
  useOutboxSync();
  return (
    <Suspense fallback={<div className="p-6"><ListSkeleton rows={4} /></div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/report/*" element={<ReportFlow />} />
        <Route path="/track/:ref" element={<Track />} />
        <Route path="/track" element={<Track />} />
        <Route path="/my-reports" element={<MyReports />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route
          path="/dashboard/*"
          element={
            <RequireRole roles={['dispatcher', 'admin']}>
              <Dashboard />
            </RequireRole>
          }
        />
        <Route
          path="/tech"
          element={
            <RequireRole roles={['technician']}>
              <TechJobs />
            </RequireRole>
          }
        />
        <Route
          path="/admin/*"
          element={
            <RequireRole roles={['admin']}>
              <Admin />
            </RequireRole>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
