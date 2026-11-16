import { gridColumns, gridGap, gridUnit } from "../CardGrid";

test.each([
  [288, 1],
  [358, 1],
  [655, 1],
  [656, 2],
  [736, 2],
  [991, 2],
  [992, 3],
  [1152, 3],
  [1376, 3],
])("a %ipx content width lays cards in %i column(s)", (width, columns) => {
  expect(gridColumns(width)).toBe(columns);
});

test.each([656, 736, 763, 992, 1152, 1376])(
  "a full row of %ipx never exceeds its width, so its last card cannot wrap",
  (width) => {
    const columns = gridColumns(width);
    const row = gridUnit(width) * columns + gridGap * (columns - 1);
    expect(row).toBeLessThanOrEqual(width);
    expect(width - row).toBeLessThan(0.05);
  },
);
