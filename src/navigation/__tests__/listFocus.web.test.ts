/** @jest-environment jsdom */
import { listFocusTarget } from "../listFocus.web";

afterEach(() => {
  document.body.replaceChildren();
  jest.restoreAllMocks();
});

// jsdom has no layout: a node is laid out unless marked data-unlaid.
function node(tag: string, id: string, parent: HTMLElement = document.body) {
  const element = document.createElement(tag);
  element.id = id;
  parent.append(element);
  return element;
}
beforeEach(() => {
  jest.spyOn(Element.prototype, "getClientRects").mockImplementation(function (
    this: Element,
  ) {
    return {
      length: this.closest("[data-unlaid]") ? 0 : 1,
    } as unknown as DOMRectList;
  });
});

test("returns to the origin while it is shown", () => {
  const card = node("div", "detail-origin-card");
  node("h1", "home-list-title");
  node("main", "maurice-content");
  expect(listFocusTarget("#detail-origin-card")).toBe(card);
});

test("falls back to the list title when the origin was filtered away or hidden", () => {
  const title = node("h1", "home-list-title");
  node("main", "maurice-content");
  expect(listFocusTarget("#detail-origin-gone")).toBe(title);
  node("div", "detail-origin-card").dataset.unlaid = "";
  expect(listFocusTarget("#detail-origin-card")).toBe(title);
  const inert = node("section", "inert-wrapper");
  inert.setAttribute("aria-hidden", "true");
  node("div", "detail-origin-hidden", inert);
  expect(listFocusTarget("#detail-origin-hidden")).toBe(title);
});

test("a direct link without a list focuses the main region", () => {
  const main = node("main", "maurice-content");
  expect(listFocusTarget(null)).toBe(main);
});

test("never chooses a hidden node; waits instead", () => {
  node("h1", "home-list-title").dataset.unlaid = "";
  node("main", "maurice-content").dataset.unlaid = "";
  expect(listFocusTarget(null)).toBeNull();
});
