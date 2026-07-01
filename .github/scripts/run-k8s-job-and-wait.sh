#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <job-manifest> [namespace]" >&2
  exit 2
fi

MANIFEST="$1"
NAMESPACE="${2:-default}"
TIMEOUT="${JOB_TIMEOUT:-180s}"

JOB_NAME="$(kubectl create -f "${MANIFEST}" -n "${NAMESPACE}" -o jsonpath='{.metadata.name}')"
echo "Created job/${JOB_NAME} from ${MANIFEST}"

if ! kubectl wait --for=condition=complete "job/${JOB_NAME}" -n "${NAMESPACE}" --timeout="${TIMEOUT}"; then
  echo "job/${JOB_NAME} did not complete within ${TIMEOUT}" >&2
  kubectl logs "job/${JOB_NAME}" -n "${NAMESPACE}" --all-containers=true || true
  kubectl describe "job/${JOB_NAME}" -n "${NAMESPACE}" || true
  exit 1
fi

kubectl logs "job/${JOB_NAME}" -n "${NAMESPACE}" --all-containers=true || true
