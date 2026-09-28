import React from 'react';

export function EmptyState({ title, description }: { title: string, description: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-lg border border-slate-200 border-dashed">
      <h3 className="text-lg font-medium text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}
