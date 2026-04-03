# Kubernetes Deployment Assets

This directory contains a deployable base plus staging and production overlays for the SMS platform.

## Layout

- `base/`
  Core manifests for the backend API, worker roles, control-plane, services, HPAs, PDBs, config maps, ingress, and service account assumptions.
- `overlays/staging/`
  Lower-scale staging deployment with staging hostnames and environment labels.
- `overlays/production/`
  Higher-scale production deployment with production hostnames and more conservative disruption settings.
- `jobs/migration-job.yaml`
  Explicit migration job to run before rolling out a new backend image.
- `monitoring/`
  Prometheus Operator resources and alerting rules.

## Secrets

The manifests intentionally reference Kubernetes secrets rather than embedding values.

Required secret objects:

- `sms-platform-backend-secrets`
- `sms-platform-control-plane-secrets`

Typical keys include:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `KAFKA_SASL_USERNAME`
- `KAFKA_SASL_PASSWORD`
- `JWT_PUBLIC_KEY`
- `JWT_PRIVATE_KEY`
- `BACKEND_BASE_URL`

## Apply

```bash
kustomize build k8s/overlays/staging | kubectl apply -f -
kustomize build k8s/overlays/production | kubectl apply -f -
kubectl apply -f k8s/jobs/migration-job.yaml
```
