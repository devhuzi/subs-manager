import { cn } from '@renderer/lib/utils';

interface Props {
  name: string;
  logoUrl?: string;
  brandColor?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const sizeClass = {
  sm: 'size-6 text-xs',
  md: 'size-8 text-xs',
};

const colorFromName = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
};

export const ServiceAvatar = ({
  name,
  logoUrl,
  brandColor,
  size = 'md',
  className,
}: Props): JSX.Element => {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={cn(
          'shrink-0 rounded-md bg-muted object-contain',
          sizeClass[size],
          className,
        )}
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const bg = brandColor ?? colorFromName(name);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium text-white',
        sizeClass[size],
        className,
      )}
      style={{ backgroundColor: bg }}
      aria-hidden
    >
      {initial}
    </span>
  );
};
