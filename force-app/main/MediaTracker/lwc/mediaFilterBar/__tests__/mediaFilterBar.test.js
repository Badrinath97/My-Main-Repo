import { createElement } from "lwc";
import MediaFilterBar from "c/mediaFilterBar";

function render(props = {}) {
  const element = createElement("c-media-filter-bar", { is: MediaFilterBar });
  Object.assign(element, {
    typeOptions: [
      { label: "Movie", value: "Movie" },
      { label: "Anime", value: "Anime" }
    ],
    statusOptions: [{ label: "Completed", value: "Completed" }],
    sortOptions: [{ label: "Title", value: "title" }],
    filter: {
      sortBy: "lastModified",
      sortDirection: "DESC",
      favoritesOnly: false
    },
    ...props
  });
  document.body.appendChild(element);
  return element;
}

describe("c-media-filter-bar", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.useRealTimers();
  });

  it("maps the 'All' option back to an empty filter value", () => {
    const element = render({ filter: { mediaType: "Anime" } });
    const handler = jest.fn();
    element.addEventListener("filterchange", handler);

    const typeCombo = element.shadowRoot.querySelector(
      'lightning-combobox[data-id="type"]'
    );
    expect(typeCombo.value).toBe("Anime");
    typeCombo.dispatchEvent(
      new CustomEvent("change", { detail: { value: "__all__" } })
    );

    expect(handler.mock.calls[0][0].detail).toEqual({ mediaType: "" });
  });

  it("picks a sensible direction when the sort field changes", () => {
    const element = render();
    const handler = jest.fn();
    element.addEventListener("filterchange", handler);

    element.shadowRoot
      .querySelector('lightning-combobox[data-id="sort"]')
      .dispatchEvent(new CustomEvent("change", { detail: { value: "title" } }));

    expect(handler.mock.calls[0][0].detail).toEqual({
      sortBy: "title",
      sortDirection: "ASC"
    });
  });

  it("debounces search input", () => {
    jest.useFakeTimers();
    const element = render();
    const handler = jest.fn();
    element.addEventListener("filterchange", handler);
    const search = element.shadowRoot.querySelector("lightning-input");

    search.value = "fri";
    search.dispatchEvent(new CustomEvent("change"));
    search.value = "frieren";
    search.dispatchEvent(new CustomEvent("change"));
    expect(handler).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ searchTerm: "frieren" });
  });

  it("hides the type filter when the instance is limited to one type", () => {
    const element = render({
      typeOptions: [{ label: "Anime", value: "Anime" }]
    });
    expect(
      element.shadowRoot.querySelector('lightning-combobox[data-id="type"]')
    ).toBeNull();
  });

  it("hides language and collection filters until there are options", () => {
    const element = render();
    expect(
      element.shadowRoot.querySelector('lightning-combobox[data-id="language"]')
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector(
        'lightning-combobox[data-id="collection"]'
      )
    ).toBeNull();
  });

  it("sorts by collection order when a collection is picked", () => {
    const element = render({
      languageOptions: [{ label: "Hindi", value: "Hindi" }],
      collectionOptions: [{ label: "MCU", value: "c01" }]
    });
    const handler = jest.fn();
    element.addEventListener("filterchange", handler);

    const collectionCombo = element.shadowRoot.querySelector(
      'lightning-combobox[data-id="collection"]'
    );
    collectionCombo.dispatchEvent(
      new CustomEvent("change", { detail: { value: "c01" } })
    );
    collectionCombo.dispatchEvent(
      new CustomEvent("change", { detail: { value: "__all__" } })
    );
    element.shadowRoot
      .querySelector('lightning-combobox[data-id="language"]')
      .dispatchEvent(new CustomEvent("change", { detail: { value: "Hindi" } }));

    expect(handler.mock.calls[0][0].detail).toEqual({
      collectionId: "c01",
      sortBy: "collectionOrder",
      sortDirection: "ASC"
    });
    expect(handler.mock.calls[1][0].detail).toEqual({ collectionId: "" });
    expect(handler.mock.calls[2][0].detail).toEqual({ language: "Hindi" });
  });

  it("switches to the collections view", () => {
    const element = render();
    const handler = jest.fn();
    element.addEventListener("viewchange", handler);
    element.shadowRoot.querySelector('button[title="Collections"]').click();
    expect(handler.mock.calls[0][0].detail).toEqual({ view: "collections" });
  });

  it("emits viewchange", () => {
    const element = render();
    const handler = jest.fn();
    element.addEventListener("viewchange", handler);
    element.shadowRoot.querySelector('button[title="List view"]').click();
    expect(handler.mock.calls[0][0].detail).toEqual({ view: "list" });
  });
});
