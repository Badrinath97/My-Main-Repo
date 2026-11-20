import { createElement } from "lwc";
import MediaItemDetail from "c/mediaItemDetail";

const ANIME = {
  value: "Anime",
  label: "Anime",
  iconName: "utility:magicwand",
  tracksProgress: true,
  tracksSeasons: true,
  tracksMovies: true,
  progressUnit: "Episodes",
  hiddenFields: [
    "releaseYear",
    "platform",
    "startDate",
    "completedDate",
    "collection"
  ]
};

const NARUTO = {
  id: "a01",
  title: "Naruto",
  mediaType: "Anime",
  status: "In Progress",
  rating: 9,
  language: "Japanese",
  genre: "Action",
  platform: "Crunchyroll",
  releaseYear: 2002,
  collectionName: "Naruto Universe",
  isFavorite: true,
  progressCurrent: 230,
  progressTotal: 720,
  progressPercent: 32,
  currentSeasonNumber: 2,
  notes: "Rewatch the Chunin exams.",
  seasons: [
    {
      id: "s1",
      seasonNumber: 1,
      name: "Classic",
      episodeCount: 220,
      episodesWatched: 220,
      isComplete: true,
      airedDate: "2002-10-03",
      completedDate: "2007-02-08"
    },
    {
      id: "s2",
      seasonNumber: 2,
      name: "Season 2",
      episodeCount: 500,
      episodesWatched: 10,
      isComplete: false,
      airedDate: "2007-02-15"
    }
  ],
  movies: [
    {
      id: "m1",
      name: "Ninja Clash in the Land of Snow",
      isComplete: true,
      airedDate: "2004-08-21"
    },
    { id: "m2", name: "The Last", isComplete: false }
  ]
};

function render(item = NARUTO, typeConfig = ANIME) {
  const element = createElement("c-media-item-detail", { is: MediaItemDetail });
  Object.assign(element, { item, typeConfig });
  document.body.appendChild(element);
  return element;
}

describe("c-media-item-detail", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows the header with status, favorite, stars and overall progress", () => {
    const root = render().shadowRoot;

    expect(root.querySelector(".title").textContent).toBe("Naruto");
    expect(root.querySelector(".tagline").textContent).toBe(
      "Anime · Japanese · Action"
    );
    expect(root.querySelector(".pill").className).toContain("pill_progress");
    expect(root.querySelector(".favorite")).not.toBeNull();
    expect(root.querySelectorAll(".star_on")).toHaveLength(5); // 9/10 -> 5 stars
    expect(root.querySelector(".rating-value").textContent).toBe("9/10");
    expect(root.querySelector(".overall .fill").style.width).toBe("32%");
    expect(root.querySelector(".percent").textContent).toBe("32%");
  });

  it("lists facts but leaves out the fields hidden for the type", () => {
    const root = render().shadowRoot;
    const labels = [...root.querySelectorAll(".fact dt")].map(
      (dt) => dt.textContent
    );
    expect(labels).toEqual(["Language", "Genre"]);
  });

  it("shows every season with its own progress and airing dates", () => {
    const root = render().shadowRoot;
    const rows = root.querySelectorAll(".row:not(.row_head)");

    expect(root.querySelector(".table").className).toContain("table_dates2");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".season-name").textContent).toBe("Classic");
    expect(rows[0].querySelector(".episodes").textContent).toBe("220 / 220");
    expect(rows[0].querySelector(".fill").style.width).toBe("100%");
    const [aired, completed] = rows[0].querySelectorAll(".col_date");
    expect(aired.textContent).toBe("Oct 3, 2002");
    expect(completed.textContent).toBe("Feb 8, 2007");

    // The automatic "Season 2" name is shown as is, and it is the one being watched.
    expect(rows[1].querySelector(".season-name").textContent).toBe("Season 2");
    expect(rows[1].className).toContain("row_current");
    expect(rows[1].querySelector(".now")).not.toBeNull();
    expect(rows[1].querySelectorAll(".col_date")[1].textContent).toBe("—");
  });

  it("lists movies with their release date and watched state", () => {
    const root = render().shadowRoot;
    const movies = root.querySelectorAll(".movie");

    expect(movies).toHaveLength(2);
    expect(movies[0].querySelector(".movie-name").textContent).toBe(
      "Ninja Clash in the Land of Snow"
    );
    expect(movies[0].querySelector(".movie-date").textContent).toBe(
      "Aug 21, 2004"
    );
    expect(movies[0].querySelector("lightning-icon").iconName).toBe(
      "utility:success"
    );
    expect(movies[1].querySelector("lightning-icon").alternativeText).toBe(
      "Not watched yet"
    );
    expect(root.querySelector(".notes").textContent).toBe(
      "Rewatch the Chunin exams."
    );
  });

  it("shows a simple item without seasons, movies or progress", () => {
    const root = render(
      {
        id: "a02",
        title: "Inception",
        mediaType: "Movie",
        status: "Completed",
        releaseYear: 2010,
        startDate: "2024-01-05",
        completedDate: "2024-01-05"
      },
      {
        value: "Movie",
        label: "Movie",
        tracksProgress: false,
        hiddenFields: []
      }
    ).shadowRoot;

    expect(root.querySelector(".table")).toBeNull();
    expect(root.querySelector(".movies")).toBeNull();
    expect(root.querySelector(".overall")).toBeNull();
    expect(root.querySelector(".stars")).toBeNull();
    expect(root.querySelector(".poster_placeholder")).not.toBeNull();
    const labels = [...root.querySelectorAll(".fact dt")].map(
      (dt) => dt.textContent
    );
    expect(labels).toEqual(["Release year", "Started", "Completed"]);
  });

  it("links the platform to its page, only for web links", async () => {
    const GAME = {
      value: "Video Game",
      label: "Video Game",
      tracksProgress: false,
      hiddenFields: []
    };
    const element = createElement("c-media-item-detail", {
      is: MediaItemDetail
    });
    element.item = {
      id: "g01",
      title: "Ninja Storm Connections",
      mediaType: "Video Game",
      status: "Completed",
      platform: "FitGirl",
      platformUrl: "https://example.com/naruto-storm"
    };
    element.typeConfig = GAME;
    document.body.appendChild(element);

    const link = element.shadowRoot.querySelector("a.fact-link");
    expect(link.getAttribute("href")).toBe("https://example.com/naruto-storm");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent.trim()).toBe("FitGirl");
    // Video games no longer track hours.
    expect(element.shadowRoot.querySelector(".track")).toBeNull();

    // Unsafe input must never become a link.
    const scriptUrl = ["javascript", "alert(1)"].join(":");
    element.item = { ...element.item, platformUrl: scriptUrl };
    await Promise.resolve();
    expect(element.shadowRoot.querySelector("a.fact-link")).toBeNull();
    expect(element.shadowRoot.textContent).toContain("FitGirl");

    element.item = {
      ...element.item,
      platform: null,
      platformUrl: "https://www.example.com/game"
    };
    await Promise.resolve();
    expect(
      element.shadowRoot.querySelector("a.fact-link").textContent.trim()
    ).toBe("example.com");
  });

  it("shows the aired date and hides Started/Completed for movies", () => {
    const element = createElement("c-media-item-detail", {
      is: MediaItemDetail
    });
    element.item = {
      id: "m01",
      title: "Thor",
      mediaType: "Movie",
      status: "Completed",
      airedDate: "2011-05-06",
      startDate: "2026-11-20",
      completedDate: "2026-11-20"
    };
    element.typeConfig = {
      value: "Movie",
      label: "Movie",
      tracksProgress: false,
      hiddenFields: ["startDate", "completedDate"],
      extraFields: ["airedDate"]
    };
    document.body.appendChild(element);

    const labels = [...element.shadowRoot.querySelectorAll(".fact dt")].map(
      (dt) => dt.textContent
    );
    expect(labels).toContain("Aired");
    expect(labels).not.toContain("Started");
    expect(labels).not.toContain("Completed");
  });
});
