const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDateRange,
  buildPagination,
  buildSort,
} = require("../src/query/queryParams");

test("buildPagination clamps invalid values to safe defaults", () => {
  assert.deepEqual(buildPagination({ page: "-1", limit: "500" }), {
    page: 1,
    limit: 200,
    skip: 0,
  });
});

test("buildDateRange validates date order", () => {
  assert.throws(
    () =>
      buildDateRange({
        from: "2026-05-21T00:00:00.000Z",
        to: "2026-05-20T00:00:00.000Z",
      }),
    /from must be before to/
  );
});

test("buildSort allows explicit descending sort direction", () => {
  assert.deepEqual(
    buildSort(
      { sortBy: "name", sortDirection: "desc" },
      ["name"],
      { field: "name", direction: 1 }
    ),
    { name: -1 }
  );
});
