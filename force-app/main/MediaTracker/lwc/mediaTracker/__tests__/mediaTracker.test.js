import { createElement } from "lwc";
import MediaTracker from "c/mediaTracker";
import getTypeConfigs from "@salesforce/apex/MediaTrackerController.getTypeConfigs";
import getMediaItems from "@salesforce/apex/MediaTrackerController.getMediaItems";
import getStats from "@salesforce/apex/MediaTrackerController.getStats";
import incrementProgress from "@salesforce/apex/MediaTrackerController.incrementProgress";
import getCollections from "@salesforce/apex/MediaTrackerController.getCollections";

jest.mock(
  "@salesforce/apex/MediaTrackerController.getTypeConfigs",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/MediaTrackerController.getMediaItems",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/MediaTrackerController.getStats",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/MediaTrackerController.incrementProgress",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/MediaTrackerController.toggleFavorite",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/MediaTrackerController.deleteMediaItem",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/MediaTrackerController.getCollections",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/MediaTrackerController.deleteCollection",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
// lightning/modal has no Jest stub; the forms are exercised in the org.
jest.mock("c/mediaItemForm", () => ({ default: { open: jest.fn() } }), {
  virtual: true
});
jest.mock("c/mediaCollectionForm", () => ({ default: { open: jest.fn() } }), {
  virtual: true
});

const COLLECTIONS = [
  {
    id: "c01",
    name: "Marvel Cinematic Universe",
    path: "Marvel Cinematic Universe",
    depth: 0,
    itemCount: 3,
    completedCount: 1
  },
  {
    id: "c02",
    name: "Infinity Saga",
    path: "Marvel Cinematic Universe › Infinity Saga",
    parentId: "c01",
    depth: 1,
    itemCount: 2,
    completedCount: 1
  }
];

const TYPE_CONFIGS = [
  {
    value: "Movie",
    label: "Movie",
    iconName: "utility:video",
    tracksProgress: false,
    sortOrder: 10
  },
  {
    value: "Anime",
    label: "Anime",
    iconName: "utility:magicwand",
    tracksProgress: true,
    progressUnit: "Episodes",
    sortOrder: 30
  }
];
const ITEMS = [
  {
    id: "a01",
    title: "Frieren",
    mediaType: "Anime",
    status: "In Progress",
    progressCurrent: 27,
    progressTotal: 28,
    isFavorite: false
  },
  {
    id: "a02",
    title: "Inception",
    mediaType: "Movie",
    status: "Completed",
    isFavorite: true
  }
];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0)); // eslint-disable-line @lwc/lwc/no-async-operation

function render(props = {}) {
  const element = createElement("c-media-tracker", { is: MediaTracker });
  Object.assign(element, props);
  document.body.appendChild(element);
  getTypeConfigs.emit(TYPE_CONFIGS);
  return element;
}

describe("c-media-tracker", () => {
  beforeEach(() => {
    getMediaItems.mockResolvedValue({
      items: ITEMS,
      totalCount: 5,
      hasMore: true
    });
    getStats.mockResolvedValue({
      total: 5,
      favorites: 1,
      averageRating: 9,
      byStatus: [],
      byType: []
    });
    getCollections.mockResolvedValue(COLLECTIONS);
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("loads the first page and renders one card per item", async () => {
    const element = render();
    await flush();

    const cards = element.shadowRoot.querySelectorAll("c-media-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].typeConfig.value).toBe("Anime");
    expect(
      element.shadowRoot.querySelector('p[slot="footer"]').textContent
    ).toBe("Showing 2 of 5");
    expect(getMediaItems.mock.calls[0][0].filter).toMatchObject({
      pageOffset: 0,
      pageSize: 12,
      sortBy: "lastModified",
      mediaTypes: []
    });
  });

  it("restricts queries and stats to the configured media types", async () => {
    render({ mediaTypes: "Anime, TV Series" });
    await flush();

    expect(getMediaItems.mock.calls[0][0].filter.mediaTypes).toEqual([
      "Anime",
      "TV Series"
    ]);
    expect(getStats).toHaveBeenCalledWith({
      mediaTypes: ["Anime", "TV Series"]
    });
  });

  it("skips stats when hidden", async () => {
    const element = render({ hideStats: true });
    await flush();
    expect(getStats).not.toHaveBeenCalled();
    expect(element.shadowRoot.querySelector("c-media-stats")).toBeNull();
  });

  it("reloads from offset 0 when the filter changes and appends on load more", async () => {
    const element = render();
    await flush();

    element.shadowRoot.querySelector("c-media-filter-bar").dispatchEvent(
      new CustomEvent("filterchange", {
        detail: { mediaType: "Movie", favoritesOnly: true }
      })
    );
    await flush();
    expect(getMediaItems.mock.calls[1][0].filter).toMatchObject({
      mediaTypes: ["Movie"],
      favoritesOnly: true,
      pageOffset: 0
    });

    getMediaItems.mockResolvedValueOnce({
      items: ITEMS.map((item) => ({ ...item, id: `${item.id}-p2` })),
      totalCount: 4,
      hasMore: false
    });
    element.shadowRoot
      .querySelector('lightning-button[data-id="load-more"]')
      .click();
    await flush();
    expect(getMediaItems.mock.calls[2][0].filter.pageOffset).toBe(2);
    expect(element.shadowRoot.querySelectorAll("c-media-card")).toHaveLength(4);
  });

  it("updates a card in place after progress changes", async () => {
    incrementProgress.mockResolvedValue({
      ...ITEMS[0],
      progressCurrent: 28,
      status: "Completed"
    });
    const element = render();
    await flush();

    element.shadowRoot
      .querySelector("c-media-card")
      .dispatchEvent(
        new CustomEvent("progress", { detail: { id: "a01", step: 1 } })
      );
    await flush();

    expect(incrementProgress).toHaveBeenCalledWith({
      recordId: "a01",
      step: 1
    });
    expect(element.shadowRoot.querySelector("c-media-card").item.status).toBe(
      "Completed"
    );
  });

  it("passes collections to the filter bar and filters by language and collection", async () => {
    const element = render();
    await flush();

    const bar = element.shadowRoot.querySelector("c-media-filter-bar");
    expect(bar.collectionOptions).toEqual([
      { label: "Marvel Cinematic Universe", value: "c01" },
      { label: "Marvel Cinematic Universe › Infinity Saga", value: "c02" }
    ]);

    bar.dispatchEvent(
      new CustomEvent("filterchange", {
        detail: { language: "Hindi", collectionId: "c01" }
      })
    );
    await flush();
    expect(getMediaItems.mock.calls[1][0].filter).toMatchObject({
      languages: ["Hindi"],
      collectionIds: ["c01"],
      includeSubCollections: true
    });
  });

  it("opens a collection from the collections view in collection order", async () => {
    const element = render();
    await flush();

    element.shadowRoot
      .querySelector("c-media-filter-bar")
      .dispatchEvent(
        new CustomEvent("viewchange", { detail: { view: "collections" } })
      );
    await flush();
    expect(element.shadowRoot.querySelector("c-media-card")).toBeNull();
    const list = element.shadowRoot.querySelector("c-media-collection-list");
    expect(list.collections).toHaveLength(2);

    list.dispatchEvent(new CustomEvent("select", { detail: { id: "c02" } }));
    await flush();

    expect(
      element.shadowRoot.querySelector("c-media-collection-list")
    ).toBeNull();
    expect(element.shadowRoot.querySelectorAll("c-media-card")).toHaveLength(2);
    const lastCall = getMediaItems.mock.calls.at(-1)[0].filter;
    expect(lastCall).toMatchObject({
      collectionIds: ["c02"],
      sortBy: "collectionOrder",
      sortDirection: "ASC"
    });
  });

  it("filters by collection when a card's collection chip is clicked", async () => {
    const element = render();
    await flush();

    element.shadowRoot.querySelector("c-media-card").dispatchEvent(
      new CustomEvent("collectionselect", {
        detail: { id: "a01", collectionId: "c01" }
      })
    );
    await flush();
    expect(getMediaItems.mock.calls.at(-1)[0].filter.collectionIds).toEqual([
      "c01"
    ]);
  });

  it("shows the server error message", async () => {
    getMediaItems.mockRejectedValue({ body: { message: "Boom" } });
    const element = render();
    await flush();
    expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toBe(
      "Boom"
    );
  });
});
