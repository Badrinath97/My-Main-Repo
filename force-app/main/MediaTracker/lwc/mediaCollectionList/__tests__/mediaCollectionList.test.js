import { createElement } from "lwc";
import MediaCollectionList from "c/mediaCollectionList";

const COLLECTIONS = [
  {
    id: "c01",
    name: "Marvel Cinematic Universe",
    path: "Marvel Cinematic Universe",
    collectionType: "Cinematic Universe",
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

describe("c-media-collection-list", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders the tree with indentation, type labels and progress", () => {
    const element = render({ activeCollectionId: "c02" });
    const rows = element.shadowRoot.querySelectorAll("li");

    expect(rows).toHaveLength(2);
    expect(rows[0].style.paddingLeft).toBe("0.75rem");
    expect(rows[1].style.paddingLeft).toBe("2.25rem");
    expect(rows[1].className).toContain("row_active");
    expect(rows[1].querySelector(".slds-badge").textContent).toBe(
      "Phase / Saga"
    );
    expect(rows[0].querySelector(".meta").textContent).toContain(
      "1 of 4 completed"
    );
    expect(rows[0].querySelector("lightning-progress-bar").value).toBe(25);
    expect(rows[1].querySelector("lightning-progress-bar").value).toBe(0);
  });

  it("raises select, edit, delete and new events", () => {
    const element = render();
    const handlers = {};
    ["select", "edit", "delete", "new"].forEach((name) => {
      handlers[name] = jest.fn();
      element.addEventListener(name, handlers[name]);
    });

    element.shadowRoot.querySelector('button[data-id="c02"]').click();
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

  it("shows an empty state when there are no collections", () => {
    const element = render({ collections: [] });
    expect(element.shadowRoot.querySelector("ul")).toBeNull();
    expect(element.shadowRoot.querySelector(".empty")).not.toBeNull();
  });
});
