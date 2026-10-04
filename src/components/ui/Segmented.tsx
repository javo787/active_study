interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}

/** A few mutually exclusive filters shown side by side; the label names the group for screen readers. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 gap-1">
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value || 'all'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`px-3 rounded-md text-sm font-medium min-h-[36px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
              active ? 'bg-white text-ink shadow-sm' : 'text-slate-600 hover:text-ink'
            }`}
          >
            {option.label}
            {option.count !== undefined && <span className="ml-1.5 text-slate-400 tnum">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
