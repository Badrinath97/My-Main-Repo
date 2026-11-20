import { createElement } from "lwc";
import MediaCard from "c/mediaCard";

const ANIME_CONFIG = {
  value: "Anime",
  label: "Anime",
  iconName: "utility:magicwand",
  tracksProgress: true,
  progressUnit: "Episodes"
};
const MOVIE_CONFIG = {
  value: "Movie",
  label: "Movie",
  iconName: "utility:video",
  tracksProgress: false
};

function buildItem(overrides = {}) {
  return {
    id: "a00000000000001",
    title: "Frieren",
    mediaType: "Anime",
    status: "In Progress",
    rating: 9.5,
    releaseYear: 2023,
    platform: "Crunchyroll",
    progressCurrent: 10,
    progressTotal: 28,
    progressPercent: 36,
    isFavorite: false,
    ...overrides
  };
}

function render(item, typeConfig) {
  const element = createElement("c-media-card", { is: MediaCard });
  element.item = item;
  element.typeConfig = typeConfig;
  document.body.appendChild(element);
  return element;
}

describe("c-media-card", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders title, subtitle, rating and progress for tracked types", () => {
    const element = render(buildItem(), ANIME_CONFIG);
    const root = element.shadowRoot;

    expect(root.querySelector(".title").textContent).toBe("Frieren");
    expect(root.querySelector("p").textContent).toBe("2023 · Crunchyroll");
    expect(root.querySelector(".rating").textContent).toContain("9.5/10");
    expect(root.querySelector("lightning-progress-bar").value).toBe(36);
    expect(root.querySelector(".progress-row span").textContent).toBe(
      "10 / 28 Episodes"
    );
  });

  it("hides progress controls for types that do not track progress", () => {
    const element = render(buildItem({ mediaType: "Movie" }), MOVIE_CONFIG);
    expect(
      element.shadowRoot.querySelector("lightning-progress-bar")
    ).toBeNull();
  });

  it("disables +1 when progress reached the total", () => {
    const element = render(buildItem({ progressCurrent: 28 }), ANIME_CONFIG);
    const [minus, plus] = element.shadowRoot.querySelectorAll(
      ".progress-row lightning-button-icon"
    );
    expect(minus.disabled).toBe(false);
    expect(plus.disabled).toBe(true);
  });

  it("emits progress, favorite, edit and delete intents with the item id", () => {
    const element = render(buildItem(), ANIME_CONFIG);
    const handlers = {
      progress: jest.fn(),
      favorite: jest.fn(),
      edit: jest.fn(),
      delete: jest.fn()
    };
    Object.entries(handlers).forEach(([name, fn]) =>
      element.addEventListener(name, fn)
    );
    const root = element.shadowRoot;

    root.querySelectorAll(".progress-row lightning-button-icon")[1].click();
    root.querySelector("lightning-button-icon-stateful").click();
    const menu = root.querySelector("lightning-button-menu");
    menu.dispatchEvent(
      new CustomEvent("select", { detail: { value: "edit" } })
    );
    menu.dispatchEvent(
      new CustomEvent("select", { detail: { value: "delete" } })
    );

    expect(handlers.progress.mock.calls[0][0].detail).toEqual({
      id: "a00000000000001",
      step: 1
    });
    expect(handlers.favorite.mock.calls[0][0].detail).toEqual({
      id: "a00000000000001"
    });
    expect(handlers.edit).toHaveBeenCalledTimes(1);
    expect(handlers.delete).toHaveBeenCalledTimes(1);
  });

  it("falls back to the type icon when the poster fails to load", async () => {
    const element = render(
      buildItem({ posterUrl: "https://example.com/missing.jpg" }),
      ANIME_CONFIG
    );
    element.shadowRoot
      .querySelector("img")
      .dispatchEvent(new CustomEvent("error"));
    await Promise.resolve();
    expect(element.shadowRoot.querySelector("img")).toBeNull();
    expect(element.shadowRoot.querySelector("lightning-icon").iconName).toBe(
      "utility:magicwand"
    );
  });
});

describe("c-media-card seasons", () => {
  const SERIES_CONFIG = {
    ...ANIME_CONFIG,
    value: "TV Series",
    label: "TV Series",
    tracksSeasons: true
  };

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows the current season with its own episode count", () => {
    const element = render(
      buildItem({
        mediaType: "TV Series",
        currentSeasonNumber: 2,
        seasons: [
          { seasonNumber: 1, episodeCount: 10, episodesWatched: 10 },
          { seasonNumber: 2, episodeCount: 8, episodesWatched: 3 }
        ]
      }),
      SERIES_CONFIG
    );
    expect(element.shadowRoot.querySelector(".season").textContent).toBe(
      "Season 2 · 3 / 8 · 2 seasons"
    );
  });

  it("handles a season that is still airing", () => {
    const element = render(
      buildItem({
        mediaType: "TV Series",
        currentSeasonNumber: 1,
        seasons: [{ seasonNumber: 1, episodeCount: null, episodesWatched: 4 }]
      }),
      SERIES_CONFIG
    );
    expect(element.shadowRoot.querySelector(".season").textContent).toBe(
      "Season 1 · 4 watched"
    );
  });

  it("hides the season line when the type does not track seasons", () => {
    const element = render(
      buildItem({
        seasons: [{ seasonNumber: 1, episodeCount: 5, episodesWatched: 1 }]
      }),
      ANIME_CONFIG
    );
    expect(element.shadowRoot.querySelector(".season")).toBeNull();
  });
});
