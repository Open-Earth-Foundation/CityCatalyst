import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd(), "..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("PDF OCR dev deployment contract", () => {
  const cronPath = "k8s/cc-process-pdf-ocr-jobs.yml";
  const workflowPath = ".github/workflows/web-develop.yml";

  test("runs an authenticated, non-overlapping OCR processor every minute", () => {
    const cron = readRepoFile(cronPath);

    expect(cron).toContain("kind: CronJob");
    expect(cron).toContain('schedule: "* * * * *"');
    expect(cron).toContain("concurrencyPolicy: Forbid");
    expect(cron).toContain("Authorization: Bearer $CC_CRON_JOB_API_KEY");
    expect(cron).toContain("/api/v1/cron/process-pdf-ocr-jobs");
  });

  test("deploys the processor and configures the dev Mistral key", () => {
    const workflow = readRepoFile(workflowPath);

    expect(workflow).toContain(`- ${cronPath}`);
    expect(workflow).toContain(`kubectl apply -f ${cronPath} -n default`);
    expect(workflow).toContain(
      "kubectl set env cronjob/citycatalyst-process-pdf-ocr-jobs",
    );
    expect(workflow).toContain(
      "MISTRAL_API_KEY=${{secrets.MISTRAL_API_KEY_DEV}}",
    );
  });
});
