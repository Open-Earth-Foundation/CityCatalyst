#!/usr/bin/env bash
# Reconcile the CNB database secret and run both Climate Advisor migration chains.

set -euo pipefail

: "${CNB_DATABASE_URL:?CNB_DATABASE_URL GitHub secret is required}"
: "${CNB_SECRET_NAME:?CNB_SECRET_NAME is required}"
: "${CA_MIGRATION_MANIFEST:?CA_MIGRATION_MANIFEST is required}"
: "${CNB_MIGRATION_MANIFEST:?CNB_MIGRATION_MANIFEST is required}"

namespace="${KUBERNETES_NAMESPACE:-default}"

kubectl create secret generic "${CNB_SECRET_NAME}" \
  --namespace "${namespace}" \
  --from-literal=CNB_DATABASE_URL="${CNB_DATABASE_URL}" \
  --dry-run=client \
  --output yaml | kubectl apply --namespace "${namespace}" --filename -

run_migration_job() {
  local manifest="$1"
  local description="$2"
  local job_name
  local attempt
  local succeeded
  local failed

  job_name="$(
    kubectl create \
      --filename "${manifest}" \
      --namespace "${namespace}" \
      --output "jsonpath={.metadata.name}"
  )"
  echo "Started ${description} migration job ${job_name}."

  for attempt in $(seq 1 60); do
    succeeded="$(
      kubectl get job "${job_name}" \
        --namespace "${namespace}" \
        --output "jsonpath={.status.succeeded}"
    )"
    failed="$(
      kubectl get job "${job_name}" \
        --namespace "${namespace}" \
        --output "jsonpath={.status.failed}"
    )"

    if [[ "${succeeded:-0}" -ge 1 ]]; then
      kubectl logs "job/${job_name}" --namespace "${namespace}"
      echo "${description} migrations completed."
      return 0
    fi

    if [[ "${failed:-0}" -ge 1 ]]; then
      kubectl logs "job/${job_name}" --namespace "${namespace}" || true
      echo "${description} migrations failed." >&2
      return 1
    fi

    sleep 5
  done

  kubectl logs "job/${job_name}" --namespace "${namespace}" || true
  echo "${description} migrations timed out." >&2
  return 1
}

run_migration_job "${CA_MIGRATION_MANIFEST}" "Climate Advisor"
run_migration_job "${CNB_MIGRATION_MANIFEST}" "CNB"
