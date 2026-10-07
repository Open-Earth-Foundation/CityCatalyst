import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Exercise the finished dashboard and RTK requests in a browser. Controlled API
// responses cover deletion races and failures; these tests do not prove backend cleanup.
const cityId = "f8063baa-e795-4ffb-a507-7a2ea6090eae";
const runId = "e7cca88d-de54-4050-88ed-d6b39790853b";
const noteName = "Disposable deletion test note";
const dashboard = `/en/cities/${cityId}/concept-notes/`;
const run = {
  run_id: runId,
  city_id: cityId,
  user_id: "owner",
  name: noteName,
  status: "active",
  workflow_step: "assembling_context",
  thread_id: null,
  uploads: [],
  progress_summary: {},
  created_at: "2026-09-21T12:00:00Z",
  updated_at: "2026-09-21T12:00:00Z",
};

async function mockDashboard(context: BrowserContext) {
  const state = {
    exists: true,
    deleteStatus: 204,
    listStatus: 200,
    deletes: 0,
  };
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = `${url.pathname.replace(/\/$/, "")}/`;
    if (
      path === `/api/v1/concept-notes/${runId}/` &&
      request.method() === "DELETE"
    ) {
      expect(url.searchParams.get("city_id")).toBe(cityId);
      state.deletes++;
      const status = state.exists ? state.deleteStatus : 404;
      if (status === 204) {
        state.exists = false;
        return route.fulfill({ status });
      }
      return route.fulfill({
        status,
        json: { error: { message: "Deletion failed" } },
      });
    }
    if (path === "/api/v1/concept-notes/") {
      expect(url.searchParams.get("city_id")).toBe(cityId);
      return route.fulfill({
        status: state.listStatus,
        json:
          state.listStatus === 200
            ? { runs: state.exists ? [run] : [] }
            : { error: { message: "List unavailable" } },
      });
    }
    if (path === "/api/v1/user/access-status/")
      return route.fulfill({
        json: {
          data: {
            isOrgOwner: false,
            isProjectAdmin: false,
            isCollaborator: true,
            organizationId: "test-organization",
          },
        },
      });
    if (path === "/api/v1/user/")
      return route.fulfill({
        json: {
          data: {
            userId: "owner",
            name: "Deletion reviewer",
            preferredLanguage: "en",
            role: "user",
          },
        },
      });
    if (path === `/api/v1/city/${cityId}/`)
      return route.fulfill({
        json: { data: { cityId, name: "Krakow", country: "Poland" } },
      });
    if (path === "/api/v1/user/projects/") return route.fulfill({ json: [] });
    if (path.includes("/modules/") && path.endsWith("/access/"))
      return route.fulfill({ json: { data: { hasAccess: true } } });
    if (path.includes("/dashboard/"))
      return route.fulfill({ json: { data: { widgets: {} } } });
    return route.fulfill({ json: { data: [] } });
  });
  return state;
}

async function openDelete(page: Page) {
  await page
    .getByRole("button", { name: `Delete: ${noteName}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Permanently delete concept note?",
  });
  await expect(dialog).toContainText(noteName);
  return dialog;
}

test("cancel preserves the note; successful deletion closes the dialog and survives reload", async ({
  context,
  page,
}) => {
  const state = await mockDashboard(context);
  await page.goto(dashboard);
  const dialog = await openDelete(page);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(state.deletes).toBe(0);
  await expect(page.getByTestId(`concept-note-run-${runId}`)).toBeVisible();
  await openDelete(page);
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Concept note deleted", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByTestId(`concept-note-run-${runId}`)).toHaveCount(0);
  expect(state.deletes).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No concept notes yet", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId(`concept-note-run-${runId}`)).toHaveCount(0);
});

test("a stale confirmation in another tab closes after confirming the note is absent", async ({
  context,
  page,
}) => {
  const state = await mockDashboard(context);
  await page.goto(dashboard);
  const staleDialog = await openDelete(page);
  const otherTab = await context.newPage();
  await otherTab.goto(dashboard);
  const otherDialog = await openDelete(otherTab);
  await otherDialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(otherDialog).toBeHidden();
  await staleDialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(staleDialog).toBeHidden();
  await expect(
    page
      .getByText("This concept note is no longer available.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  expect(state.deletes).toBe(2);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No concept notes yet", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId(`concept-note-run-${runId}`)).toHaveCount(0);
});

for (const failure of [
  { name: "404 while the note still exists", status: 404, listStatus: 200 },
  {
    name: "404 with an unavailable authorized list",
    status: 404,
    listStatus: 403,
  },
  { name: "forbidden deletion", status: 403, listStatus: 200 },
  { name: "an operation in progress", status: 409, listStatus: 200 },
  { name: "upstream failure", status: 503, listStatus: 200 },
]) {
  test(`keeps the dialog actionable after ${failure.name}`, async ({
    context,
    page,
  }) => {
    const state = await mockDashboard(context);
    await page.goto(dashboard);
    const dialog = await openDelete(page);
    state.deleteStatus = failure.status;
    state.listStatus = failure.listStatus;
    await dialog
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(
      failure.status === 409
        ? "Wait for file processing and the current concept note operation to finish, then try deleting it again."
        : "The concept note could not be deleted. Please try again.",
    );
    await expect(dialog).toBeVisible();
    await expect(
      page.getByText("Concept note deleted", { exact: true }).first(),
    ).toHaveCount(0);
    await expect(
      page.getByText("This concept note is no longer available.", {
        exact: true,
      }),
    ).toHaveCount(0);
    // A recovered request can be retried from the same dialog.
    state.deleteStatus = 204;
    state.listStatus = 200;
    await dialog
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText("Concept note deleted", { exact: true }).first(),
    ).toBeVisible();
    expect(state.deletes).toBe(2);
  });
}
