import { cn } from '@renderer/lib/utils';

// Each deployment supplies its own legal pages at build time; with neither
// set (e.g. a self-hosted personal instance) nothing is rendered.
const privacyUrl = import.meta.env.VITE_PRIVACY_URL;
const termsUrl = import.meta.env.VITE_TERMS_URL;

export const LegalLinks = ({ className }: { className?: string }) => {
  if (!privacyUrl && !termsUrl) return null;
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      {privacyUrl && (
        <a className="hover:text-foreground" href={privacyUrl} target="_blank" rel="noreferrer">
          Privacy
        </a>
      )}
      {privacyUrl && termsUrl && <span className="mx-1.5">&middot;</span>}
      {termsUrl && (
        <a className="hover:text-foreground" href={termsUrl} target="_blank" rel="noreferrer">
          Terms
        </a>
      )}
    </p>
  );
};
