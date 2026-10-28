import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd(), "..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

/**
 * Lightweight contract test: webhook CronJob manifests stay wired into CI deploy
 * workflows with auth, encryption env, and the delivery worker route.
 */
describe("webhook delivery deployment contract", () => {
  const environments = [
    {
      name: "dev",
      cronPath: "k8s/cc-process-webhook-deliveries.yml",
      cronName: "citycatalyst-process-webhook-deliveries",
      workflowPath: ".github/workflows/web-develop.yml",
    },
    {
      name: "test",
      cronPath: "k8s/test/cc-test-process-webhook-deliveries.yml",
      cronName: "citycatalyst-test-process-webhook-deliveries",
      workflowPath: ".github/workflows/web-test.yml",
    },
    {
      name: "prod",
      cronPath: "k8s/prod/cc-prod-process-webhook-deliveries.yml",
      cronName: "citycatalyst-prod-process-webhook-deliveries",
      workflowPath: ".github/workflows/web-tag.yml",
    },
  ] as const;

  test.each(environments)(
    "$name runs and deploys an authenticated webhook delivery worker",
    ({ cronPath, cronName, workflowPath }) => {
      const cron = readRepoFile(cronPath);
      const workflow = readRepoFile(workflowPath);

      expect(cron).toContain("kind: CronJob");
      expect(cron).toContain('schedule: "*/5 * * * *"');
      expect(cron).toContain("concurrencyPolicy: Forbid");
      expect(cron).toContain("Authorization: Bearer $CC_CRON_JOB_API_KEY");
      expect(cron).toContain("/api/v1/cron/process-webhook-deliveries");
      expect(workflow).toContain(`- ${cronPath}`);
      expect(workflow).toContain(`kubectl apply -f ${cronPath} -n default`);
      expect(workflow).toContain(`kubectl set env cronjob/${cronName}`);
      expect(workflow).toContain("WEBHOOK_SECRET_ENCRYPTION_KEY");
    },
  );
});
