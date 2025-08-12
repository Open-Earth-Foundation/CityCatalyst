# Setup

- [https://grafana.com/docs/k6/latest/set-up/install-k6/](Setup k6)

# Running

```bash
cd load-test
npm run load
```

_OR_ (for manual parameter selection)

```bash
k6 run --vus 30 --duration 10s city_catalyst.ts
```
