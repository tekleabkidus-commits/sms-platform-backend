import { AppCard, PageHeader } from '@/components/ui/primitives';
import { getSwaggerUrl } from '@/lib/runtime-env';

export default function ApiDocsPage(): React.ReactElement {
  const swaggerUrl = getSwaggerUrl();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Developer portal"
        title="API documentation"
        description="The portal links directly to the backend Swagger/OpenAPI surface and gives a few ready-to-copy request examples."
      />

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">OpenAPI</h2>
          <a
            href={swaggerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Open Swagger UI
          </a>
          <p className="text-sm text-slate-600">{swaggerUrl}</p>
        </AppCard>
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Sample request</h2>
          <pre className="overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{`curl -X POST "$BACKEND/api/v1/messages" \\
  -H "x-api-key: <your-key>" \\
  -H "x-idempotency-key: client-123" \\
  -H "content-type: application/json" \\
  -d '{
    "phoneNumber": "+251911234567",
    "senderId": "MYAPP",
    "templateRef": "otp-login@1",
    "mergeData": { "code": "815204" },
    "trafficType": "otp"
  }'`}</pre>
        </AppCard>
      </div>
    </div>
  );
}
