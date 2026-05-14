# OEF Cluster Notes

Known cluster aliases used in this repo context:

- `dev-cluster`
- `prod-cluster`

Reference cluster ARNs from the user-provided notes:

- Dev: `arn:aws:eks:us-east-1:004557241454:cluster/EKSE2753513-2271b64cd48c4f15ab0241929df9572c`
- Prod: `arn:aws:eks:us-east-1:993253388624:cluster/EKSE2753513-964d78ea2abb4c44b3467dd80995983a`

Operational preference for this skill:

- Do not switch contexts with `kubectl config use-context`.
- Pass the desired context explicitly via `--context`.
- Keep all checks read-only.
