import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const useParamsMock = jest.fn<() => { lng?: string | string[] }>();

jest.unstable_mockModule("next/navigation", () => ({
  useParams: useParamsMock,
}));
jest.unstable_mockModule("@/components/not-found-page", () => ({
  NotFoundPage: () => null,
}));

const { default: ConceptNotesNotFound } =
  await import("@/app/[lng]/cities/[cityId]/concept-notes/not-found");
const { default: CatchAllNotFound } = await import("@/app/[...not_found]/page");

function renderedLanguage(element: unknown): string {
  return (element as { props: { lng: string } }).props.lng;
}

describe("Concept Notes not-found page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the branded page in the route locale", () => {
    useParamsMock.mockReturnValue({ lng: "de" });

    expect(renderedLanguage(ConceptNotesNotFound())).toBe("de");
  });

  it("falls back to English for an unsupported route locale", () => {
    useParamsMock.mockReturnValue({ lng: "unsupported" });

    expect(renderedLanguage(ConceptNotesNotFound())).toBe("en");
  });

  it("preserves the locale for the existing catch-all 404 route", async () => {
    const page = await CatchAllNotFound({
      params: Promise.resolve({ not_found: ["fr", "missing-page"] }),
    });

    expect(renderedLanguage(page)).toBe("fr");
  });
});
