'use client';

import { audienceModes } from '@/data/audienceModes';
import { AudienceMode } from '@/types';

export function AudienceModeToggle({ value, onChange }: { value: AudienceMode; onChange: (mode: AudienceMode) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-panelSoft/55 p-1.5">
      {audienceModes.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`rounded-xl px-3 py-1.5 text-[11px] font-medium transition ${
            mode === value
              ? 'bg-accent/90 text-[#081224] shadow-[0_6px_18px_rgba(96,165,250,0.3)]'
              : 'text-muted hover:bg-white/[0.04] hover:text-ink'
          }`}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
