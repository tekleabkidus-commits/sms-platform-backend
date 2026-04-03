import { AppCard } from '@/components/ui/primitives';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage(): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#cffafe_0%,#f8fafc_40%,#f8fafc_100%)] p-6">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[2.5rem] bg-slate-950 p-10 text-slate-100 shadow-[0_35px_120px_-50px_rgba(15,23,42,0.8)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-300">Carrier-grade control</p>
          <h1 className="mt-5 max-w-xl text-5xl font-semibold tracking-tight">Operate campaigns, providers, compliance, and delivery in one workspace.</h1>
          <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-300">
            The portal is wired directly to the live backend contracts for tenant messaging, routing, billing, audits, and network operations.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ['Messages', 'Trace every submit, retry, DLR, and billing transition.'],
              ['Providers', 'Watch circuit state, latency, and backlog before intervening.'],
              ['Compliance', 'Review fraud, opt-outs, suppression, and sender approvals.'],
            ].map(([title, description]) => (
              <div key={title} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-2 text-xs leading-6 text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </section>
        <AppCard className="self-center p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Sign in</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Access the control plane</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Use your tenant code, email, and password from the backend user registry.
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </AppCard>
      </div>
    </div>
  );
}
