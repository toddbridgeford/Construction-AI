'use client';

export function PerplexityShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#eef2f7] px-3 pb-6 pt-4 text-slate-100 sm:px-5 sm:pt-6">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mb-3 flex items-center justify-between px-1 sm:mb-4 sm:px-0">
          <button
            aria-label="Close dashboard"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm sm:h-14 sm:w-14"
          >
            <span className="text-xl leading-none sm:text-2xl">×</span>
          </button>
          <button
            aria-label="Menu"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm sm:h-14 sm:w-14"
          >
            <span className="text-lg leading-none sm:text-xl">☰</span>
          </button>
        </div>

        <div className="rounded-[24px] border border-[#1f2937] bg-[#0b1220] p-2 shadow-[0_20px_60px_rgba(2,6,23,0.38)] sm:rounded-[28px] sm:p-3">
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
