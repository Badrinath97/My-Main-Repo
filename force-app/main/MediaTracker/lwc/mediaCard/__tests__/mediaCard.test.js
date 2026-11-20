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
    expect(root.querySelector(".fill").style.width).toBe("36%");
    expect(root.querySelector(".fill").className).toContain("fill_progress");
    expect(root.querySelector(".overlay .pill").className).toContain(
      "pill_progress"
    );
    expect(root.querySelector(".progress-row span").textContent).toBe(
      "10 / 28 Episodes"
    );
  });

  it("hides progress controls for types that do not track progress", () => {
    const element = render(buildItem({ mediaType: "Movie" }), MOVIE_CONFIG);
    expect(element.shadowRoot.querySelector(".track")).toBeNull();
  });

  it("disables +1 when progress reached the total", () => {
    const element = render(buildItem({ progressCurrent: 28 }), ANIME_CONFIG);
    const [minus, plus] = element.shadowRoot.querySelectorAll(
      ".progress-row button"
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

    root.querySelectorAll(".progress-row button")[1].click();
    root.querySelector('button[data-id="favorite"]').click();
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

  it("opens details from the poster, the title, the keyboard and the menu", () => {
    const element = render(buildItem(), ANIME_CONFIG);
    const handler = jest.fn();
    element.addEventListener("open", handler);
    const root = element.shadowRoot;

    root.querySelector(".media").click();
    root.querySelector("button.title").click();
    root
      .querySelector(".media")
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    root
      .querySelector(".media")
      .dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    root
      .querySelector("lightning-button-menu")
      .dispatchEvent(new CustomEvent("select", { detail: { value: "open" } }));

    expect(handler).toHaveBeenCalledTimes(4);
    expect(handler.mock.calls[0][0].detail).toEqual({ id: "a00000000000001" });
  });

  it("moves status and rating into the body in the list view", () => {
    const element = createElement("c-media-card", { is: MediaCard });
    Object.assign(element, {
      item: buildItem(),
      typeConfig: ANIME_CONFIG,
      variant: "list"
    });
    document.body.appendChild(element);
    const root = element.shadowRoot;
    expect(root.querySelector(".overlay")).toBeNull();
    expect(root.querySelector(".badges .pill").textContent).toBe("In Progress");
    expect(root.querySelector(".badges .rating").textContent).toContain(
      "9.5/10"
    );
  });

  it("gives poster-less items a stable colourful placeholder", () => {
    const a = render(buildItem(), ANIME_CONFIG);
    const b = render(buildItem(), ANIME_CONFIG);
    const classA = a.shadowRoot.querySelector(".poster_placeholder").className;
    expect(classA).toMatch(/theme_[0-5]/);
    expect(b.shadowRoot.querySelector(".poster_placeholder").className).toBe(
      classA
    );
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

describe("c-media-card collections and language", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows the language in the subtitle", () => {
    const element = render(
      buildItem({ language: "Japanese", platform: null }),
      ANIME_CONFIG
    );
    expect(element.shadowRoot.querySelector("p").textContent).toBe(
      "2023 · Japanese"
    );
  });

  it("shows the collection with its order and fires collectionselect", () => {
    const element = render(
      buildItem({
        mediaType: "Movie",
        collectionId: "c02",
        collectionName: "Infinity Saga",
        collectionOrder: 3
      }),
      MOVIE_CONFIG
    );
    const handler = jest.fn();
    element.addEventListener("collectionselect", handler);

    const chip = element.shadowRoot.querySelector("button.collection");
    expect(chip.textContent.trim()).toBe("Infinity Saga #3");
    chip.click();

    expect(handler.mock.calls[0][0].detail).toEqual({
      id: "a00000000000001",
      collectionId: "c02"
    });
  });

  it("omits the order when it is not set and hides the chip without a collection", () => {
    const withCollection = render(
      buildItem({ collectionId: "c01", collectionName: "MCU" }),
      ANIME_CONFIG
    );
    expect(
      withCollection.shadowRoot
        .querySelector("button.collection")
        .textContent.trim()
    ).toBe("MCU");

    const without = render(buildItem(), ANIME_CONFIG);
    expect(without.shadowRoot.querySelector("button.collection")).toBeNull();
  });
});

describe("c-media-card movies", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  const MOVIES = [
    { id: "m1", name: "Mugen Train", isComplete: true },
    { id: "m2", name: "Infinity Castle", isComplete: false }
  ];

  it("shows how many related movies are watched, with titles on hover", () => {
    const element = render(buildItem({ movies: MOVIES }), {
      ...ANIME_CONFIG,
      tracksMovies: true
    });
    const line = element.shadowRoot.querySelector(".movies");
    expect(line.textContent.trim()).toBe("Movies · 1 / 2 watched");
    expect(line.title).toBe("✓ Mugen Train\n○ Infinity Castle");
  });

  it("hides the movie line without movies or when the type has none", () => {
    const noMovies = render(buildItem({ movies: [] }), {
      ...ANIME_CONFIG,
      tracksMovies: true
    });
    expect(noMovies.shadowRoot.querySelector(".movies")).toBeNull();

    const notTracked = render(buildItem({ movies: MOVIES }), ANIME_CONFIG);
    expect(notTracked.shadowRoot.querySelector(".movies")).toBeNull();
  });
});

describe("c-media-card season names", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows a season's own name but not the automatic 'Season N' name", () => {
    const element = render(
      buildItem({
        currentSeasonNumber: 2,
        seasons: [
          {
            seasonNumber: 1,
            name: "Season 1",
            episodeCount: 220,
            episodesWatched: 220
          },
          {
            seasonNumber: 2,
            name: "Shippuden",
            episodeCount: 500,
            episodesWatched: 12
          }
        ]
      }),
      { ...ANIME_CONFIG, tracksSeasons: true }
    );
    expect(element.shadowRoot.querySelector(".season").textContent).toBe(
      "Season 2: Shippuden · 12 / 500 · 2 seasons"
    );
  });
});
