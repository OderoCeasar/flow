import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { leakName, StatusBadge } from '../../../components/ui/Badges';
import { Button } from '../../../components/ui/Button';
import { IconUsers, leakTypeIcon } from '../../../components/ui/Icons';
import { timeAgo } from '../../../lib/format';
import type { NearbyMatch } from '../../../lib/types';

// A bottom sheet asking whether the leak was already reported. Built on
// <dialog>, so focus stays inside, Esc closes it and it's announced as a dialog.
export function DuplicateSheet({
  match,
  onSame,
  onDifferent,
  onClose,
}: {
  match: NearbyMatch | null;
  onSame: (m: NearbyMatch) => void;
  onDifferent: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (match && !d.open) d.showModal?.();
    if (!match && d.open) d.close?.();
  }, [match]);
  const type = match ? leakName(t, match.leak_type, false) : '';
  const place = match ? match.address_text.split(',')[0]?.trim() || match.area_name : '';
  const Icon = leakTypeIcon[match?.leak_type ?? 'other'];
  return (
    <dialog
      ref={ref}
      aria-labelledby="dup-sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-none rounded-t-3xl p-0 text-ink shadow-2xl backdrop:bg-[#0f2c4a]/45 sm:bottom-8 sm:max-w-lg sm:rounded-3xl"
    >
      {match && (
        <div className="flex flex-col gap-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-surface-sunken" aria-hidden="true" />
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fdf1d8] text-[#9a5a06]" aria-hidden="true">
              <IconUsers size={22} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-700">{t('report.duplicate.eyebrow')}</p>
              <h2 id="dup-sheet-title" className="text-xl font-normal leading-snug text-ink-heading">
                {t('report.duplicate.sheetTitle', { distance: match.distance_m })}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-surface-line bg-[#fbfcfd] p-2.5">
            {match.photo_url ? (
              <img src={match.photo_url} alt={t('report.duplicate.photoAlt', { type })} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden="true">
                <Icon size={32} />
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-semibold text-ink">{place ? t('detail.titleOn', { type, place }) : type}</p>
              <p className="text-sm text-ink-muted">
                {t('report.duplicate.reportedAgo', { when: timeAgo(match.created_at, t) })}
                {match.report_count > 1 && <> · {t('report.duplicate.people', { count: match.report_count })}</>}
              </p>
              <span><StatusBadge status={match.status} size="sm" /></span>
            </div>
          </div>

          <p className="text-sm text-ink-muted">{t('report.duplicate.question')}</p>
          <div className="flex flex-col gap-2">
            <Button size="lg" block onClick={() => onSame(match)} autoFocus>
              {t('report.duplicate.yesSame')}
            </Button>
            <Button size="lg" variant="outline" block onClick={onDifferent}>
              {t('report.duplicate.different')}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
