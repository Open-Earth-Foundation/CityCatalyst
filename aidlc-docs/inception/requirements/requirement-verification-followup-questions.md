# Requirements Clarification Follow-up Questions

These follow-up questions are required by the enabled Resiliency Baseline. Fill every `[Answer]:` tag. They establish decisions that must be carried into the Requirements, Application Design, Construction, and Operations artifacts.

## Question 1 — RTO/RPO Goals and Disaster Recovery Strategy
What Recovery Time Objective (RTO) and Recovery Point Objective (RPO) goals should apply to this CC-737 workload?

A) Hours — Backup & Restore. Data is backed up; services are redeployed from IaC and restored from backups after failure.

B) Tens of minutes — Pilot Light. Data remains live; infrastructure is deployed but services are idle until failover.

C) Minutes — Warm Standby. Data remains live; services run at reduced capacity and scale during failover.

D) Near real-time — Multi-site Active/Active. Live services operate in multiple regions with minimal downtime.

E) N/A — Single-region deployment is acceptable; rely on existing multi-zone availability and recovery procedures.

X) Other (please describe after [Answer]: tag below)

[Answer]: X — RTO, RPO, and disaster recovery are outside the scope of CC-737. The workload will follow CityCatalyst's existing platform recovery objectives and procedures. This project will not define a new recovery strategy.

## Question 2 — Change Management Process
How should production changes for this workload be governed?

A) Use the existing organizational change-management process; provide its name or tool after the answer.

B) No formal process exists; propose a lightweight change record, approval, and rollback-note process.

C) N/A — this workload is exempt from formal change management; provide the rationale after the answer.

X) Other (please describe after [Answer]: tag below)

[Answer]: A — Use the existing change process through Linear and GitHub Pull Requests, with mandatory review, passing CI checks, and approval before deployment. No additional change-management process will be created for CC-737.

## Question 3 — CI/CD and Deployment Tooling
Which CI/CD tooling and deployment process should the workload use?

A) Use the existing CI/CD pipeline; provide the tool or workflow reference after the answer.

B) No pipeline exists; propose a CI/CD pipeline compatible with the current runtime and IaC.

X) Other (please describe after [Answer]: tag below)

[Answer]: A — Use the existing Climate Advisor, web/Core, and CC–CA contract workflows. Add CC-737 tests to the appropriate existing pipelines; no new CI/CD pipeline will be created.

## Question 4 — Rollback Mechanism
How should a failed production deployment be rolled back?

A) Redeploy the previous version-pinned artifact/IaC version.

B) Blue/green swap back to the previous environment.

C) Canary auto-rollback on health or metric regression.

D) Database-aware rollback is required; explicitly design migration/data reversal.

E) Use the organization's existing rollback procedure; provide the reference after the answer.

X) Other (please describe after [Answer]: tag below)

[Answer]: X — CC-737 will not introduce a new rollback mechanism. If required, the existing CityCatalyst rollback procedure will be used, including redeploying the previous version-pinned artifact when applicable.

## Question 5 — Deployment Style
What deployment strategy is acceptable for this workload?

A) Direct/in-place — lowest cost and highest blast radius.

B) Rolling — gradual instance or pod replacement.

C) Blue/green — separate environments with cutover and rollback.

D) Canary — progressive traffic shift with health/metric evaluation.

X) Other (please describe after [Answer]: tag below)

[Answer]: X — Deployment style is outside the scope of CC-737. Each affected service will follow its existing deployment strategy.

## Question 6 — Regional Topology
Does this workload require multi-region deployment, or is single-region with multi-zone redundancy sufficient?

A) Single-region, multi-zone — tolerates zone failure but not full-region failure.

B) Multi-region active-passive — survives regional failure through failover.

C) Multi-region active-active — survives regional failure with no planned downtime.

X) Other (please describe after [Answer]: tag below)

[Answer]: X — Regional topology is outside the scope of CC-737. The implementation will inherit the current CityCatalyst infrastructure and will not introduce or change a multi-region strategy.

## Question 7 — Resiliency Testing Approach
How will failover and recovery behavior be validated?

A) Use the existing DR testing, game-day, or chaos-engineering practice; provide the reference after the answer.

B) No practice exists; propose a DR testing schedule and chaos experiment plan.

C) Defer execution to Operations; capture test scenarios now and execute them later.

X) Other (please describe after [Answer]: tag below)

[Answer]: C — Failover and disaster-recovery testing are outside the implementation scope. Relevant scenarios, such as CityCatalyst Core unavailability and request timeouts, may be documented for later execution by Operations.

## Question 8 — Incident Response Process
How are production incidents handled for this workload?

A) Use the existing incident-response and on-call process; provide the reference after the answer.

B) No formal process exists; propose a lightweight incident-response and correction-of-errors process.

X) Other (please describe after [Answer]: tag below)

[Answer]: X — Incident response is outside the scope of CC-737. Any incidents related to this functionality will follow the existing CityCatalyst operational incident process; no new incident workflow will be created.
