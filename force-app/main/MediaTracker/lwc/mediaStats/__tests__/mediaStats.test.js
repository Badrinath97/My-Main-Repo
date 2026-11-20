import { createElement } from "lwc";
import MediaStats from "c/mediaStats";

const STATS = {
  total: 25,
  favorites: 2,
  averageRating: 10,
  byStatus: [
    { value: "Completed", label: "Completed", count: 25 },
    { value: "Dropped", label: "Dropped", count: 0 }
  ],
  byType: [{ value: "Movie", label: "Movie", count: 23 }]
};

function render(props = {}) {
  const element = createElement("c-media-stats", { is: MediaStats });
  Object.assign(element, { stats: STATS, ...props });
  document.body.appendChild(element);
  return element;
}

describe("c-media-stats", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("toggles favorites from the Favorites tile", async () => {
    const element = render();
    const handler = jest.fn();
    element.addEventListener("favoritesselect", handler);

    const tile = element.shadowRoot.querySelector(
      'button[data-id="favorites"]'
    );
    expect(tile.getAttribute("aria-pressed")).toBe("false");
    tile.click();
    expect(handler.mock.calls[0][0].detail).toEqual({ favoritesOnly: true });

    element.favoritesOnly = true;
    await Promise.resolve();
    expect(tile.classList).toContain("tile_active");
    tile.click();
    expect(handler.mock.calls[1][0].detail).toEqual({ favoritesOnly: false });
  });

  it("highlights Total only when no status or favorites filter is on", async () => {
    const element = render();
    const total = () =>
      element.shadowRoot.querySelector('button[data-status=""]');
    expect(total().classList).toContain("tile_active");

    element.favoritesOnly = true;
    await Promise.resolve();
    expect(total().classList).not.toContain("tile_active");
  });

  it("emits the status of a clicked tile and clears it on a second click", async () => {
    const element = render();
    const handler = jest.fn();
    element.addEventListener("statusselect", handler);
    const completed = () =>
      element.shadowRoot.querySelector('button[data-status="Completed"]');

    completed().click();
    element.activeStatus = "Completed";
    await Promise.resolve();
    completed().click();

    expect(handler.mock.calls.map((c) => c[0].detail.status)).toEqual([
      "Completed",
      ""
    ]);
  });
});
