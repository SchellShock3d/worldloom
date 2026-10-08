/** A quiet full-page message for missing pages and errors: three threads, the middle one cut. */
export function StatusPage({ title, children, actions, code }: { title: string; children?: React.ReactNode; actions?: React.ReactNode; code?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center px-6 py-16">
      <div className="flex max-w-md flex-col items-center text-center">
        <svg viewBox="0 0 160 48" className="mb-6 h-12 w-40" aria-hidden>
          <path d="M4 10 C 40 2, 80 18, 156 8" fill="none" stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 24 C 30 18, 52 30, 70 24" fill="none" stroke="var(--brass)" strokeWidth="2" strokeLinecap="round" />
          <path d="M90 25 C 110 20, 132 30, 156 22" fill="none" stroke="var(--brass)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 5" />
          <circle cx="70" cy="24" r="3.5" fill="var(--surface)" stroke="var(--brass)" strokeWidth="2" />
          <path d="M4 38 C 50 46, 100 30, 156 40" fill="none" stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {code && <p className="mb-1 text-sm tabular text-faint">{code}</p>}
        <h1 className="font-serif text-3xl font-semibold leading-tight">{title}</h1>
        {children && <div className="mt-2 text-muted">{children}</div>}
        {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
