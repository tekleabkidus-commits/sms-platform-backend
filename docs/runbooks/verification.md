# Verification Commands

## Backend

```bash
npm ci
npm run verify
```

## Control Plane

```bash
cd control-plane
npm ci
npm run test:ci
```

## Kubernetes Manifests

```bash
cmd /c npm run validate:manifests
```

## Smoke Checks

```bash
node scripts/smoke-check.mjs
```
