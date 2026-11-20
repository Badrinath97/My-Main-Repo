import { createElement } from "lwc";
import MediaCollectionList from "c/mediaCollectionList";

// MCU > Infinity Saga > Phase 1, plus a separate top-level DC collection.
const COLLECTIONS = [
  {
    id: "c01",
    name: "Marvel Cinematic Universe",
    path: "Marvel Cinematic Universe",
    collectionType: "Cinematic Universe",
    posterUrl: "https://image.example.com/mcu.jpg",
    depth: 0,
    itemCount: 4,
    completedCount: 1
  },
  {
    id: "c02",
    name: "Infinity Saga",
    path: "Marvel Cinematic Universe › Infinity Saga",
    collectionType: "Phase",
    parentId: "c01",
    depth: 1,
    itemCount: 0,
    completedCount: 0
  },
  {
    id: "c03",
    name: "Phase 1",
    path: "Marvel Cinematic Universe › Infinity Saga › Phase 1",
    collectionType: "Phase",
    parentId: "c02",
    depth: 2,
    itemCount: 2,
    completedCount: 2
  },
  {
    id: "c04",
    name: "DC Extended Universe",
    path: "DC Extended Universe",
    collectionType: "Cinematic Universe",
    depth: 0,
    itemCount: 0,
    completedCount: 0
  }
];

function render(props = {}) {
  const element = createElement("c-media-collection-list", {
    is: MediaCollectionList
  });
  Object.assign(element, {
    collections: COLLECTIONS,
    typeOptions: [
      { label: "Cinematic Universe", value: "Cinematic Universe" },
      { label: "Phase / Saga", value: "Phase" }
    ],
    ...props
  });
  document.body.appendChild(element);
  return element;
}

const rowNames = (element) =>
  [...element.shadowRoot.querySelectorAll("li .name")].map((b) =>
    b.textContent.trim()
  );

const toggle = (element, id) =>
  element.shadowRoot.querySelector(`button[data-toggle="${id}"]`);

describe("c-media-collection-list", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("starts collapsed, showing only top-level collections", () => {
    const element = render();
    expect(rowNames(element)).toEqual([
      "Marvel Cinematic Universe",
      "DC Extended Universe"
    ]);
    // Only collections with sub-collections get a chevron.
    expect(toggle(element, "c01").getAttribute("aria-expanded")).toBe("false");
    expect(toggle(element, "c04")).toBeNull();
    expect(element.shadowRoot.querySelector("li .meta").textContent).toContain(
      "1 sub-collection"
    );
  });

  it("expands and collapses one level at a time", async () => {
    const element = render();

    toggle(element, "c01").click();
    await Promise.resolve();
    expect(rowNames(element)).toEqual([
      "Marvel Cinematic Universe",
      "Infinity Saga",
      "DC Extended Universe"
    ]);
    expect(toggle(element, "c01").getAttribute("aria-expanded")).toBe("true");

    toggle(element, "c02").click();
    await Promise.resolve();
    expect(rowNames(element)).toContain("Phase 1");

    // Collapsing the top level hides everything beneath it.
    toggle(element, "c01").click();
    await Promise.resolve();
    expect(rowNames(element)).toEqual([
      "Marvel Cinematic Universe",
      "DC Extended Universe"
    ]);
  });

  it("expands and collapses everything from the toolbar", async () => {
    const element = render();
    const root = element.shadowRoot;

    root.querySelector('button[data-id="expand-all"]').click();
    await Promise.resolve();
    expect(rowNames(element)).toHaveLength(4);

    const rows = root.querySelectorAll("li");
    expect(rows[0].style.paddingLeft).toBe("0.75rem");
    expect(rows[1].style.paddingLeft).toBe("2.25rem");
    expect(rows[2].style.paddingLeft).toBe("3.75rem");
    expect(rows[1].querySelector(".chip").textContent).toBe("Phase / Saga");
    expect(rows[0].querySelector(".fill").style.width).toBe("25%");
    expect(rows[2].querySelector(".fill").className).toContain(
      "fill_completed"
    );

    root.querySelector('button[data-id="collapse-all"]').click();
    await Promise.resolve();
    expect(rowNames(element)).toHaveLength(2);
  });

  it("shows collection posters and falls back to a placeholder", async () => {
    const element = render();
    const img = element.shadowRoot.querySelector("img.thumb");
    expect(img.getAttribute("src")).toBe("https://image.example.com/mcu.jpg");
    // DC has no poster.
    expect(
      element.shadowRoot.querySelectorAll(".thumb_placeholder")
    ).toHaveLength(1);

    img.dispatchEvent(new CustomEvent("error"));
    await Promise.resolve();
    expect(element.shadowRoot.querySelector("img.thumb")).toBeNull();
    expect(
      element.shadowRoot.querySelectorAll(".thumb_placeholder")
    ).toHaveLength(2);
  });

  it("raises select, edit, delete and new events", async () => {
    const element = render({ activeCollectionId: "c02" });
    const handlers = {};
    ["select", "edit", "delete", "new"].forEach((name) => {
      handlers[name] = jest.fn();
      element.addEventListener(name, handlers[name]);
    });

    toggle(element, "c01").click();
    await Promise.resolve();
    const child = element.shadowRoot.querySelector('button[data-id="c02"]');
    expect(child.closest("li").className).toContain("row_active");
    child.click();
    const menu = element.shadowRoot.querySelector(
      'lightning-button-menu[data-id="c01"]'
    );
    menu.dispatchEvent(
      new CustomEvent("select", { detail: { value: "edit" } })
    );
    menu.dispatchEvent(
      new CustomEvent("select", { detail: { value: "delete" } })
    );
    element.shadowRoot
      .querySelector('button[data-id="new-collection"]')
      .click();

    expect(handlers.select.mock.calls[0][0].detail).toEqual({ id: "c02" });
    expect(handlers.edit.mock.calls[0][0].detail).toEqual({ id: "c01" });
    expect(handlers.delete.mock.calls[0][0].detail).toEqual({ id: "c01" });
    expect(handlers.new).toHaveBeenCalledTimes(1);
  });

  it("hides the expand/collapse buttons when nothing is nested", () => {
    const element = render({ collections: [COLLECTIONS[3]] });
    expect(
      element.shadowRoot.querySelector('button[data-id="expand-all"]')
    ).toBeNull();
  });

  it("shows an empty state when there are no collections", () => {
    const element = render({ collections: [] });
    expect(element.shadowRoot.querySelector("ul")).toBeNull();
    expect(element.shadowRoot.querySelector(".empty")).not.toBeNull();
  });
});
