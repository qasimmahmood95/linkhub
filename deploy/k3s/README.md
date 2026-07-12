# Deploying linkhub to k3s

Single-replica by design — SQLite is single-writer and the login rate limiter
is in-process. The Deployment pins `replicas: 1` with a `Recreate` strategy;
leave both alone.

## Deploy

```sh
# 1. Namespace + secret (the secret is never committed)
kubectl apply -f namespace.yaml
kubectl -n linkhub create secret generic linkhub-admin-token \
  --from-literal=ADMIN_TOKEN="$(openssl rand -base64 32)"

# 2. Everything else
kubectl apply -k .

# 3. Watch it come up
kubectl -n linkhub get pods -w
```

Add `linkhub.lan` (or your chosen hostname from `ingress.yaml`) to your LAN
DNS, pointing at the cluster's Traefik entrypoint.

## Image access

CI publishes `ghcr.io/qasimmahmood95/linkhub` on pushes to `main` and on
`v*` tags. GHCR packages are **private by default** — either make the package
public (GitHub → Packages → linkhub → settings → change visibility), or give
the cluster a pull secret:

```sh
kubectl -n linkhub create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=qasimmahmood95 \
  --docker-password=<a read:packages PAT>
```

and add `imagePullSecrets: [{name: ghcr-pull}]` to the Deployment's pod spec.

## Public exposure

Nothing in these manifests exposes the app to the internet, deliberately.
Point Nginx Proxy Manager (or your tunnel) at the LAN hostname and apply the
`/admin` location block from the [main README](../../README.md#intended-deployment).
The app enforces the admin token regardless — the proxy block is layer one,
not the security model.

## Upgrades and rollbacks

```sh
kubectl -n linkhub set image deployment/linkhub linkhub=ghcr.io/qasimmahmood95/linkhub:v1.1.0
kubectl -n linkhub rollout undo deployment/linkhub   # if it goes wrong
```

Take a JSON export before upgrading; it is the real backup and restores
through the admin UI in seconds.
