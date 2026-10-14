import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PortalBoxProps {
  /** Omit for a plain outlined box */
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** An outlined section with a filled header bar */
export function PortalBox({ title, action, className, children }: PortalBoxProps) {
  return (
    <section className={cn('portal-box', className)}>
      {title ? (
        <div className="portal-box-title">
          <h2>{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
