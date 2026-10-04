import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1 max-w-prose">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:shrink-0">{actions}</div>}
    </div>
  );
}
