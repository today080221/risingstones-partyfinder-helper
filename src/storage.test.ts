import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultUiState, loadUiState, normalizeSourceFilters } from "./storage";

describe("saved source filter migration", () => {
  it("migrates legacy all into the default multi-source selection", () => {
    expect(normalizeSourceFilters(undefined, "all")).toEqual(["official", "nga"]);
  });

  it("migrates a legacy single source into one selected source", () => {
    expect(normalizeSourceFilters(undefined, "nga")).toEqual(["nga"]);
  });

  it("keeps a valid multi-source selection and drops invalid values", () => {
    expect(normalizeSourceFilters(["nga", "tieba", "official"], undefined)).toEqual(["nga", "official"]);
  });
});

describe("saved local filter migration", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      clear: () => store.clear()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("migrates legacy fetched labels into local label filters", () => {
    localStorage.setItem(
      "risingstones-partyfinder-helper:v1",
      JSON.stringify({
        ...defaultUiState,
        labels: ["seeking"],
        filters: {
          ...defaultUiState.filters,
          selectedLabelIds: undefined
        }
      })
    );

    expect(loadUiState().filters.selectedLabelIds).toEqual(["seeking"]);
  });
});
