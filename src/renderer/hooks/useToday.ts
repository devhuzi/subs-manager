import { useEffect, useState } from 'react';
import { isoLocal } from '../../shared/dates';

/**
 * The current local day as a Date, re-rendering when the calendar day
 * changes: at local midnight, and on window focus / tab becoming visible
 * (timers don't fire reliably while a laptop sleeps). The returned Date
 * keeps its identity for the whole day, so it is safe as a memo dependency.
 */
export const useToday = (): Date => {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const update = (): void => {
      const now = new Date();
      setToday((prev) => (isoLocal(prev) === isoLocal(now) ? prev : now));
    };

    let timer: number | undefined;
    const scheduleMidnight = (): void => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = window.setTimeout(() => {
        update();
        scheduleMidnight();
      }, next.getTime() - now.getTime());
    };
    scheduleMidnight();

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') update();
    };
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return today;
};
