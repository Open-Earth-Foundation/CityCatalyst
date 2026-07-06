#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${K8S_NAMESPACE:-default}"
JOB_TIMEOUT="${JOB_TIMEOUT:-180s}"

: "${SMOKE_FIXTURE_MANIFEST:?SMOKE_FIXTURE_MANIFEST is required}"
: "${CA_SERVICE_NAME:?CA_SERVICE_NAME is required}"
: "${CA_DEPLOYMENT_NAME:?CA_DEPLOYMENT_NAME is required}"
: "${CC_EXPECTED_AUDIENCE:?CC_EXPECTED_AUDIENCE is required}"

CA_SMOKE_USER_ID="${CA_SMOKE_USER_ID:-11111111-1111-4111-8111-111111111111}"
CA_SMOKE_CITY_ID="${CA_SMOKE_CITY_ID:-22222222-2222-4222-8222-222222222222}"
CA_SMOKE_INVENTORY_ID="${CA_SMOKE_INVENTORY_ID:-33333333-3333-4333-8333-333333333333}"

echo "Seeding CA/CC smoke fixture from ${SMOKE_FIXTURE_MANIFEST}"
JOB_NAME="$(kubectl create -f "${SMOKE_FIXTURE_MANIFEST}" \
  -n "${NAMESPACE}" \
  -o jsonpath='{.metadata.name}')"
echo "Created job/${JOB_NAME} from ${SMOKE_FIXTURE_MANIFEST}"

if ! kubectl wait --for=condition=complete "job/${JOB_NAME}" \
  -n "${NAMESPACE}" \
  --timeout="${JOB_TIMEOUT}"; then
  echo "::error::job/${JOB_NAME} did not complete within ${JOB_TIMEOUT}"
  kubectl logs "job/${JOB_NAME}" -n "${NAMESPACE}" --all-containers=true || true
  kubectl describe "job/${JOB_NAME}" -n "${NAMESPACE}" || true
  exit 1
fi

kubectl logs "job/${JOB_NAME}" -n "${NAMESPACE}" --all-containers=true || true

echo "Waiting for Climate Advisor rollout: deployment/${CA_DEPLOYMENT_NAME}"
kubectl rollout status "deployment/${CA_DEPLOYMENT_NAME}" \
  -n "${NAMESPACE}" \
  --timeout=300s

echo "Finding running Climate Advisor pod for app=${CA_DEPLOYMENT_NAME}"
CA_POD="$(kubectl get pods \
  -n "${NAMESPACE}" \
  -l "app=${CA_DEPLOYMENT_NAME}" \
  --field-selector=status.phase=Running \
  -o jsonpath='{.items[0].metadata.name}')"

if [[ -z "${CA_POD}" ]]; then
  echo "::error::No running pod found for app=${CA_DEPLOYMENT_NAME}"
  kubectl get pods -n "${NAMESPACE}" -l "app=${CA_DEPLOYMENT_NAME}" -o wide || true
  exit 1
fi

echo "Checking CC to CA service reachability via ${CA_SERVICE_NAME}/health"
kubectl exec -i "${CA_POD}" -n "${NAMESPACE}" -- \
  python - "${CA_SERVICE_NAME}" <<'PY'
import sys
import urllib.error
import urllib.request

service_name = sys.argv[1]
url = f"http://{service_name}/health"

try:
    with urllib.request.urlopen(url, timeout=10) as response:
        print(f"Health check passed for {url}: HTTP {response.status}")
except urllib.error.URLError as exc:
    raise SystemExit(f"Health check failed for {url}: {exc}") from exc
PY

echo "Running CA to CC auth smoke from deployed Climate Advisor pod"
kubectl exec "${CA_POD}" -n "${NAMESPACE}" -- \
  env \
    "CA_SMOKE_USER_ID=${CA_SMOKE_USER_ID}" \
    "CA_SMOKE_CITY_ID=${CA_SMOKE_CITY_ID}" \
    "CA_SMOKE_INVENTORY_ID=${CA_SMOKE_INVENTORY_ID}" \
  python -m scripts.smoke_cc_contract \
    --expected-audience "${CC_EXPECTED_AUDIENCE}"
