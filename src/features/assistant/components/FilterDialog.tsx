'use client';

import { useTranslation } from 'react-i18next';
import { btnPrimary, btnQuiet } from '@/components/ui/styles';
import Modal from './Modal';
import { NO_FILTER, activeFilterCount, type FilterCounts, type ViewFilter } from '../view';

interface Props {
  filter: ViewFilter;
  counts: FilterCounts;
  onChange: (filter: ViewFilter) => void;
  onClose: () => void;
}

const OPTIONS: { key: keyof ViewFilter; label: string }[] = [
  { key: 'new', label: 'assistant.status_new' },
  { key: 'wrong', label: 'assistant.status_wrong' },
  { key: 'correct', label: 'assistant.status_correct' },
  { key: 'starred', label: 'assistant.filter_starred' },
];

/** Which questions the list shows. Ticked options are alternatives ("unanswered or mistakes"). */
export default function FilterDialog({ filter, counts, onChange, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Modal
      title={t('assistant.filter_title')}
      closeLabel={t('assistant.close')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnQuiet} onClick={() => onChange(NO_FILTER)} disabled={activeFilterCount(filter) === 0}>
            {t('assistant.filter_reset')}
          </button>
          <button type="button" className={btnPrimary} onClick={onClose}>
            {t('assistant.filter_done')}
          </button>
        </>
      }
    >
      <fieldset>
        <legend className="sr-only">{t('assistant.filter_title')}</legend>
        {OPTIONS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 min-h-[48px] cursor-pointer">
            <input
              type="checkbox"
              checked={filter[key]}
              onChange={e => onChange({ ...filter, [key]: e.target.checked })}
              className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="flex-1 text-sm text-slate-900">{t(label)}</span>
            <span className="text-sm text-slate-500 tabular-nums">{counts[key === 'starred' ? 'starred' : key]}</span>
          </label>
        ))}
      </fieldset>
      <p className="mt-2 text-xs text-slate-500">{t('assistant.filters_hint')}</p>
    </Modal>
  );
}
