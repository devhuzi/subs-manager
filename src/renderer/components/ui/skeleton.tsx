import type { HTMLAttributes } from 'react';
import { cn } from '@renderer/lib/utils';

export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div
    className={cn('animate-pulse rounded-md bg-muted', className)}
    {...props}
  />
);
