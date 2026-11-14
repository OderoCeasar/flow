import { useTranslation } from 'react-i18next';
import { ApiError } from './api';

// Turns any error into plain words. Known codes use our translations; other
// server errors already carry a human message; everything else is generic.
export function useErrorMessage() {
  const { t, i18n } = useTranslation();
  return (err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.isNetwork) return t('errors.network');
      const key = `errors.codes.${err.code}`;
      if (i18n.exists(key)) return t(key);
      if (err.message && i18n.language === 'en') return err.message;
      if (err.status === 429) return t('errors.codes.rate_limited');
      if (err.status >= 500) return t('errors.server');
      if (err.message) return err.message;
    }
    return t('errors.generic');
  };
}

// fieldError translates known field messages, or falls back to the server's text.
export function useFieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError ? err.fields : {};
}
