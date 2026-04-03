import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function renderKustomize(target) {
  return execFileSync('kubectl', ['kustomize', target], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function splitDocuments(rendered) {
  return rendered
    .split(/^---\s*$/m)
    .map((document) => document.trim())
    .filter(Boolean);
}

function getTopLevelValue(document, key) {
  const match = document.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

function getMetadataName(document) {
  const lines = document.split(/\r?\n/);
  let inMetadata = false;

  for (const line of lines) {
    if (!inMetadata) {
      if (line.trim() === 'metadata:') {
        inMetadata = true;
      }
      continue;
    }

    if (!line.startsWith('  ')) {
      break;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith('name:')) {
      return trimmed.slice('name:'.length).trim();
    }
  }

  return null;
}

function parseDocuments(rendered) {
  return splitDocuments(rendered).map((document) => ({
    document,
    apiVersion: getTopLevelValue(document, 'apiVersion'),
    kind: getTopLevelValue(document, 'kind'),
    name: getMetadataName(document),
  }));
}

function findDocument(documents, kind, name) {
  return documents.find((document) => document.kind === kind && document.name === name);
}

function expectDeploymentShape(documents, name, expectedReplicas) {
  const deployment = findDocument(documents, 'Deployment', name);
  assert(deployment, `Missing Deployment/${name}`);
  assert(deployment.document.includes(`name: ${name}`), `Deployment/${name} must render its own metadata name`);
  assert(deployment.document.includes(`replicas: ${expectedReplicas}`), `Deployment/${name} must render replicas: ${expectedReplicas}`);
  assert(deployment.document.includes('readinessProbe:'), `Deployment/${name} must define a readiness probe`);
  assert(deployment.document.includes('livenessProbe:'), `Deployment/${name} must define a liveness probe`);
  assert(deployment.document.includes('startupProbe:'), `Deployment/${name} must define a startup probe`);
  assert(deployment.document.includes('resources:'), `Deployment/${name} must define resource requests/limits`);
  assert(deployment.document.includes('terminationGracePeriodSeconds:'), `Deployment/${name} must define terminationGracePeriodSeconds`);
  assert(deployment.document.includes('serviceAccountName:'), `Deployment/${name} must define a service account`);
}

function expectService(documents, name) {
  const service = findDocument(documents, 'Service', name);
  assert(service, `Missing Service/${name}`);
  assert(service.document.includes('ports:'), `Service/${name} must expose ports`);
}

function expectAutoscaler(documents, name) {
  assert(findDocument(documents, 'HorizontalPodAutoscaler', name), `Missing HorizontalPodAutoscaler/${name}`);
}

function expectPdb(documents, name) {
  assert(findDocument(documents, 'PodDisruptionBudget', name), `Missing PodDisruptionBudget/${name}`);
}

function validateOverlay(overlay, expectedReplicas) {
  const rendered = renderKustomize(overlay);
  const documents = parseDocuments(rendered);

  const expectedDeployments = [
    'sms-platform-api',
    'sms-platform-worker-dispatch',
    'sms-platform-worker-dlr',
    'sms-platform-worker-outbox',
    'sms-platform-worker-campaign',
    'sms-platform-worker-fraud',
    'sms-platform-worker-reconciliation',
    'sms-platform-control-plane',
  ];

  for (const deploymentName of expectedDeployments) {
    expectDeploymentShape(documents, deploymentName, expectedReplicas[deploymentName]);
    expectService(documents, deploymentName);
  }

  expectAutoscaler(documents, 'sms-platform-api');
  expectAutoscaler(documents, 'sms-platform-worker-dispatch');
  expectAutoscaler(documents, 'sms-platform-control-plane');

  expectPdb(documents, 'sms-platform-api');
  expectPdb(documents, 'sms-platform-worker-dispatch');
  expectPdb(documents, 'sms-platform-control-plane');

  assert(findDocument(documents, 'Ingress', 'sms-platform'), `Missing Ingress/sms-platform in ${overlay}`);
  assert(findDocument(documents, 'ConfigMap', 'sms-platform-backend-config'), `Missing backend ConfigMap in ${overlay}`);
  assert(findDocument(documents, 'ConfigMap', 'sms-platform-control-plane-config'), `Missing control-plane ConfigMap in ${overlay}`);
}

function validateMonitoringBundle() {
  const documents = parseDocuments(renderKustomize('k8s/monitoring'));
  const serviceMonitor = findDocument(documents, 'ServiceMonitor', 'sms-platform');
  const prometheusRule = findDocument(documents, 'PrometheusRule', 'sms-platform-alerts');

  assert(serviceMonitor, 'Missing ServiceMonitor/sms-platform');
  assert(serviceMonitor.document.includes('/api/v1/metrics'), 'ServiceMonitor must scrape /api/v1/metrics');

  assert(prometheusRule, 'Missing PrometheusRule/sms-platform-alerts');
  assert(prometheusRule.document.includes('SmsPlatformOutboxBacklogGrowing'), 'PrometheusRule must include outbox backlog alert');
  assert(prometheusRule.document.includes('SmsPlatformProviderCircuitOpen'), 'PrometheusRule must include provider circuit alert');
}

function validateMigrationJob() {
  const documents = parseDocuments(readFileSync(path.join(rootDir, 'k8s', 'jobs', 'migration-job.yaml'), 'utf8'));
  const job = findDocument(documents, 'Job', 'sms-platform-migrate');
  assert(job, 'Missing Job/sms-platform-migrate');
  assert(job.document.includes('restartPolicy: Never'), 'Migration job must use restartPolicy: Never');
  assert(job.document.includes('backoffLimit: 1'), 'Migration job must define backoffLimit: 1');
  assert(job.document.includes('node scripts/run-migrations.mjs') || job.document.includes('scripts/run-migrations.mjs'), 'Migration job must run the migration script');
}

function validateDigitalOceanTemplate() {
  const template = readFileSync(path.join(rootDir, '.do', 'deploy.template.yaml'), 'utf8');

  assert(template.includes('name: x-sms'), 'DigitalOcean template must define the x-sms app name');
  assert(template.includes('region: fra'), 'DigitalOcean template must use the fra region');
  assert(template.includes('repo_clone_url: https://github.com/tekleabkidus-commits/sms-platform-backend'), 'DigitalOcean template must point at the correct GitHub repository');
  assert(template.includes('source_dir: control-plane'), 'DigitalOcean template must include the control-plane source directory');
  assert(template.includes('run_command: npm run start:api'), 'DigitalOcean template must define the API run command');
  assert(template.includes('run_command: npm run start:worker-dispatch'), 'DigitalOcean template must define the dispatch worker run command');
  assert(template.includes('run_command: npm run start:worker-reconciliation'), 'DigitalOcean template must define the reconciliation worker run command');
  assert(template.includes('prefix: /backend'), 'DigitalOcean template must route the backend under /backend');
  assert(template.includes('NEXT_PUBLIC_BACKEND_SWAGGER_URL'), 'DigitalOcean template must configure the control-plane Swagger URL');
  assert(template.includes('ALLOW_INSECURE_PLAIN_SECRETS'), 'DigitalOcean template must keep insecure plain-text secrets disabled');
}

validateOverlay('k8s/overlays/staging', {
  'sms-platform-api': 2,
  'sms-platform-worker-dispatch': 2,
  'sms-platform-worker-dlr': 2,
  'sms-platform-worker-outbox': 2,
  'sms-platform-worker-campaign': 1,
  'sms-platform-worker-fraud': 1,
  'sms-platform-worker-reconciliation': 1,
  'sms-platform-control-plane': 2,
});

validateOverlay('k8s/overlays/production', {
  'sms-platform-api': 4,
  'sms-platform-worker-dispatch': 6,
  'sms-platform-worker-dlr': 3,
  'sms-platform-worker-outbox': 3,
  'sms-platform-worker-campaign': 1,
  'sms-platform-worker-fraud': 1,
  'sms-platform-worker-reconciliation': 1,
  'sms-platform-control-plane': 3,
});

validateMonitoringBundle();
validateMigrationJob();
validateDigitalOceanTemplate();

console.log('Manifest validation passed for staging, production, monitoring, migration job, and DigitalOcean App Platform assets.');
