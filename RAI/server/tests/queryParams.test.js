const {
  buildDateRange,
  buildPagination,
  buildSort,
} = require('../src/query/queryParams');

describe('SCRUM-34 query parameter helpers', () => {
  it('clamps invalid pagination values to safe defaults', () => {
    expect(buildPagination({ page: '-1', limit: '500' })).toEqual({
      page: 1,
      limit: 200,
      skip: 0,
    });
  });

  it('validates date order', () => {
    expect(() =>
      buildDateRange({
        from: '2026-05-21T00:00:00.000Z',
        to: '2026-05-20T00:00:00.000Z',
      })
    ).toThrow(/from must be before to/);
  });

  it('allows explicit descending sort direction', () => {
    expect(
      buildSort(
        { sortBy: 'name', sortDirection: 'desc' },
        ['name'],
        { field: 'name', direction: 1 }
      )
    ).toEqual({ name: -1 });
  });
});
