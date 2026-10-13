import type { ConceptNoteRun, InitialConceptNoteUpload } from "@/util/types";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Real browser components and RTK requests, with controlled upload failures.
// Separate service tests verify durable persistence across database sessions.
const cityId = "f8063baa-e795-4ffb-a507-7a2ea6090eae";
const dashboard = `/en/cities/${cityId}/concept-notes/`;
type Mode = "fail" | "success" | "partial" | "invalid" | "lost-response";
async function mockUploads(context: BrowserContext, initialMode: Mode) {
  const runs: Array<
      ConceptNoteRun & {
        progress_summary: { initial_uploads: InitialConceptNoteUpload[] };
      }
    > = [],
    events: Array<{ method: string; path: string }> = [],
    attempts: string[] = [];
  const accepted = new Set<string>();
  let threads = 0,
    uploads = 0,
    mode = initialMode;
  await context.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace(/\/$/, "");
    const json = (data: unknown) => route.fulfill({ json: data });
    if (path === "/api/auth/session")
      return json({
        user: {
          id: "local-repro",
          name: "Local tester",
          email: "local@example.test",
        },
        expires: "2099-01-01",
      });
    if (req.method() !== "GET") events.push({ method: req.method(), path });
    if (path === "/api/v1/chat/threads" && req.method() === "POST")
      return json({ threadId: `thread-${++threads}` });
    if (path === "/api/v1/concept-notes/start") {
      const body = req.postDataJSON();
      const run = {
        run_id: `e7cca88d-de54-4050-88ed-d6b39790853${runs.length}`,
        city_id: cityId,
        user_id: "local-repro",
        name: body.name,
        status: "active",
        project_id: null,
        funder_id: null,
        selected_funding_opportunity_id: null,
        workflow_step: "assembling_context",
        thread_id: body.thread_id,
        uploads: [],
        progress_summary: { initial_uploads: body.initial_uploads ?? [] },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      runs.push(run);
      return json(run);
    }
    if (path.endsWith("/uploads") && req.method() === "POST") {
      uploads++;
      const body = req.postData() ?? "";
      const source = runs[0].progress_summary.initial_uploads.find((entry) =>
        body.includes(entry.upload_id),
      );
      if (!source) throw new Error("Missing persisted upload identity");
      attempts.push(source.upload_id);
      if (
        mode === "fail" ||
        mode === "invalid" ||
        (mode === "partial" && source.filename === "second.md")
      ) {
        return route.fulfill({
          status: mode === "invalid" ? 422 : 503,
          json: { error: { message: "Forced local failure" } },
        });
      }
      source.accepted = true;
      accepted.add(source.upload_id);
      if (mode === "lost-response" && uploads === 1)
        return route.abort("failed");
      return json({
        uploadId: source.upload_id,
        status: "queued",
        stage: "ocr",
        canRetry: false,
        filename: source.filename,
      });
    }
    if (runs.length && path === `/api/v1/concept-notes/${runs[0].run_id}`)
      return json(runs[0]);
    if (path === "/api/v1/concept-notes") return json({ runs });
    if (path === "/api/v1/user/access-status")
      return json({
        data: {
          isOrgOwner: false,
          isProjectAdmin: false,
          isCollaborator: true,
          organizationId: "local-org",
        },
      });
    if (path === "/api/v1/user")
      return json({
        data: {
          userId: "local-repro",
          name: "Local tester",
          preferredLanguage: "en",
          role: "user",
        },
      });
    if (path === `/api/v1/city/${cityId}`)
      return json({ data: { cityId, name: "Krakow", country: "Poland" } });
    if (path === "/api/v1/user/projects") return json([]);
    if (path.includes("/modules/") && path.endsWith("/access"))
      return json({ data: { hasAccess: true } });
    if (path.includes("/dashboard")) return json({ data: { widgets: {} } });
    return json({ data: [] });
  });

  return {
    runs,
    attempts,
    accepted,
    get threads() {
      return threads;
    },
    get uploads() {
      return uploads;
    },
    setMode(value: Mode) {
      mode = value;
    },
  };
}

function source(name = "source.md") {
  return {
    name,
    mimeType: "text/markdown",
    buffer: Buffer.from("# Local source\nClimate project evidence."),
  };
}
async function create(page: Page, files = [source()]) {
  await page.goto(dashboard);
  await page
    .getByRole("button", { name: "+ New concept note", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByPlaceholder("e.g. Resilient neighbourhoods programme")
    .fill("CC-857 upload recovery");
  await dialog.locator("input[type=file]").setInputFiles(files);
  for (const file of files)
    await expect(dialog.getByText(file.name, { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create & open workspace", exact: true })
    .click();
  return dialog;
}

test("recovers a lost response automatically with one run, thread and upload identity", async ({
  context,
  page,
}) => {
  const state = await mockUploads(context, "lost-response");
  await create(page);
  await expect.poll(() => state.runs.length).toBe(1);
  await expect(page).toHaveURL(
    new RegExp(`${state.runs[0].run_id}.*uploadId=`),
  );
  expect(state.uploads).toBe(2);
  expect(new Set(state.attempts).size).toBe(1);
  expect(state.accepted.size).toBe(1);
  expect(state.runs).toHaveLength(1);
  expect(state.threads).toBe(1);
});

test("persistent failure is truthful after reload and optional retry reuses the workspace", async ({
  context,
  page,
}) => {
  const state = await mockUploads(context, "fail");
  const dialog = await create(page);
  await expect(dialog.getByRole("alert")).toContainText(
    "Your workspace is saved",
  );
  expect(state.uploads).toBe(2);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  const card = page.getByTestId(`concept-note-run-${state.runs[0].run_id}`);
  await expect(card).toContainText("Upload incomplete");
  await expect(card).not.toContainText("4%");
  await expect(card).not.toContainText("Assembling context");
  await page.screenshot({
    path: test.info().outputPath("upload-incomplete.png"),
    fullPage: true,
  });
  await expect(card.getByRole("button", { name: /^Delete:/ })).toBeEnabled();
  await card
    .getByRole("button", { name: "Try upload again", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Try upload again", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Select the original files",
  );
  expect(state.uploads).toBe(2);
  await dialog.locator("input[type=file]").setInputFiles(source());
  await expect(dialog.getByText("source.md", { exact: true })).toBeVisible();
  state.setMode("success");
  await dialog
    .getByRole("button", { name: "Try upload again", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`${state.runs[0].run_id}.*uploadId=`),
  );
  expect(state.threads).toBe(1);
  expect(state.runs).toHaveLength(1);
  expect(new Set(state.attempts).size).toBe(1);
  await page.goto(dashboard);
  await expect(card).not.toContainText("Upload incomplete");
});

test("partial failure retries only missing files after reopening", async ({
  context,
  page,
}) => {
  const state = await mockUploads(context, "partial");
  const dialog = await create(page, [source("first.md"), source("second.md")]);
  await expect(dialog.getByRole("alert")).toContainText(
    "Your workspace is saved",
  );
  expect(state.uploads).toBe(3);
  expect(state.accepted.size).toBe(1);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Try upload again", exact: true })
    .click();
  await dialog.locator("input[type=file]").setInputFiles(source("second.md"));
  await expect(dialog.getByText("second.md", { exact: true })).toBeVisible();
  state.setMode("success");
  await dialog
    .getByRole("button", { name: "Try upload again", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`${state.runs[0].run_id}.*uploadId=`),
  );
  expect(state.uploads).toBe(4);
  expect(state.accepted.size).toBe(2);
  expect(
    state.attempts.filter(
      (id) =>
        id === state.runs[0].progress_summary.initial_uploads[0].upload_id,
    ),
  ).toHaveLength(1);
  expect(state.threads).toBe(1);
});

test("invalid upload is not retried automatically", async ({
  context,
  page,
}) => {
  const state = await mockUploads(context, "invalid");
  const dialog = await create(page);
  await expect(dialog.getByRole("alert")).toContainText(
    "Your workspace is saved",
  );
  expect(state.uploads).toBe(1);
});
