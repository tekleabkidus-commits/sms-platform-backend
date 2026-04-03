import Link from 'next/link';

export default function UnauthorizedPage(): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">Restricted route</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Your role cannot access this section.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The UI is honoring the backend RBAC model. If you should have access, update the user role in the backend and sign in again.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
