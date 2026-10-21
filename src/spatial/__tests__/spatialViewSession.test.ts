import { createSpatialViewSession } from "../spatialViewSession";

test("view choice does not clear a failure; only Retry advances its attempt", () => {
  const session = createSpatialViewSession("home-a");
  session.choose("home-a", "home", 0, "3d");
  session.fail("home-a", "home", 0, "context_lost");
  session.choose("home-a", "home", 0, "2d");
  session.choose("home-a", "home", 0, "3d");
  expect(session.getSnapshot().home).toEqual({
    view: "3d",
    failure: "context_lost",
    attempt: 0,
  });
  expect(session.getSnapshot().house).toEqual({
    view: "auto",
    failure: null,
    attempt: 0,
  });
  session.retry("home-a", "home", 0);
  session.fail("home-a", "home", 0, "init_failed");
  expect(session.getSnapshot().home).toEqual({
    view: "3d",
    failure: null,
    attempt: 1,
  });
});
test("scopes reset both bounded entries and reject callbacks from the old identity", () => {
  const session = createSpatialViewSession("a");
  const listener = jest.fn();
  const remove = session.subscribe(listener);
  session.fail("a", "home", 0, "watchdog");
  session.scope("b");
  const state = session.getSnapshot();
  session.choose("a", "house", 0, "3d");
  session.fail("a", "home", 0, "context_lost");
  session.retry("a", "home", 0);
  session.scope("b");
  expect(session.getSnapshot()).toBe(state);
  expect(listener).toHaveBeenCalledTimes(2);
  remove();
  session.scope("a");
  session.fail("a", "home", 0, "context_lost");
  session.choose("a", "home", 0, "3d");
  session.retry("a", "home", 0);
  expect(session.getSnapshot().home).toEqual({
    view: "auto",
    failure: null,
    attempt: 2,
  });
  expect(listener).toHaveBeenCalledTimes(2);
});
