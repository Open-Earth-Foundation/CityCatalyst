import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd(), "..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("PDF OCR deployment contract", () => {
  const environments = [
    {
      name: "dev",
      cronPath: "k8s/cc-process-pdf-ocr-jobs.yml",
      cronName: "citycatalyst-process-pdf-ocr-jobs",
      workflowPath: ".github/workflows/web-develop.yml",
      mistralSecret: "MISTRAL_API_KEY_DEV",
    },
    {
      name: "test",
      cronPath: "k8s/test/cc-test-process-pdf-ocr-jobs.yml",
      cronName: "citycatalyst-test-process-pdf-ocr-jobs",
      workflowPath: ".github/workflows/web-test.yml",
      mistralSecret: "MISTRAL_API_KEY_TEST",
    },
    {
      name: "prod",
      cronPath: "k8s/prod/cc-prod-process-pdf-ocr-jobs.yml",
      cronName: "citycatalyst-prod-process-pdf-ocr-jobs",
      workflowPath: ".github/workflows/web-tag.yml",
      mistralSecret: "MISTRAL_API_KEY_PROD",
    },
  ] as const;

  test.each(environments)(
    "$name runs and deploys an authenticated, non-overlapping OCR processor",
    ({ cronPath, cronName, workflowPath, mistralSecret }) => {
      const cron = readRepoFile(cronPath);
      const workflow = readRepoFile(workflowPath);

      expect(cron).toContain("kind: CronJob");
      expect(cron).toContain('schedule: "* * * * *"');
      expect(cron).toContain("concurrencyPolicy: Forbid");
      expect(cron).toContain("Authorization: Bearer $CC_CRON_JOB_API_KEY");
      expect(cron).toContain("/api/v1/cron/process-pdf-ocr-jobs");
      expect(workflow).toContain(`- ${cronPath}`);
      expect(workflow).toContain(`kubectl apply -f ${cronPath} -n default`);
      expect(workflow).toContain(`kubectl set env cronjob/${cronName}`);
      expect(workflow).toContain(
        `MISTRAL_API_KEY=\${{secrets.${mistralSecret}}}`,
      );
    },
  );
});
