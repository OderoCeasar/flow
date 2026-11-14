import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../../../lib/drafts';
import { ListSkeleton } from '../../../components/ui/States';
import PhotoStep from './PhotoStep';
import LocationStep from './LocationStep';
import DetailsStep from './DetailsStep';
import Done from './Done';

type DraftData = Omit<Draft, 'updatedAt'>;

interface FlowState {
  draft: DraftData;
  update: (patch: Partial<DraftData>) => void;
  reset: () => void;
}

const FlowCtx = createContext<FlowState | null>(null);

export function useFlow() {
  const ctx = useContext(FlowCtx);
  if (!ctx) throw new Error('useFlow outside ReportFlow');
  return ctx;
}

// Unfinished drafts older than this are discarded rather than resumed.
const DRAFT_MAX_AGE = 24 * 3600 * 1000;

export default function ReportFlow() {
  const [draft, setDraft] = useState<DraftData | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    void loadDraft().then((d) => {
      if (d && Date.now() - d.updatedAt < DRAFT_MAX_AGE) {
        const { updatedAt: _ignored, ...rest } = d;
        setDraft(rest);
      } else setDraft({});
    });
  }, []);

  const update = useCallback((patch: Partial<DraftData>) => {
    setDraft((d) => {
      const next = { ...(d ?? {}), ...patch };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void saveDraft(next), 300);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    clearTimeout(saveTimer.current);
    setDraft({});
    void clearDraft();
  }, []);

  if (!draft) return <div className="p-6"><ListSkeleton rows={2} /></div>;
  return (
    <FlowCtx.Provider value={{ draft, update, reset }}>
      <Routes>
        <Route index element={<PhotoStep />} />
        <Route path="location" element={<Guard need="photo"><LocationStep /></Guard>} />
        <Route path="details" element={<Guard need="location"><DetailsStep /></Guard>} />
        <Route path="done" element={<Done />} />
        <Route path="*" element={<Navigate to="/report" replace />} />
      </Routes>
    </FlowCtx.Provider>
  );
}

// Guard keeps people from landing mid-flow (e.g. from history) without earlier answers.
function Guard({ need, children }: { need: 'photo' | 'location'; children: ReactNode }) {
  const { draft } = useFlow();
  const hasPhotoStep = !!draft.photo || !!draft.noPhoto;
  if (!hasPhotoStep) return <Navigate to="/report" replace />;
  if (need === 'location' && (draft.lat == null || draft.lng == null)) return <Navigate to="/report/location" replace />;
  return <>{children}</>;
}
