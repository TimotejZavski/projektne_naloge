const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parsePositiveInt(value, fallback, max = MAX_LIMIT) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseDate(value, fieldName) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} must be a valid ISO date`);
    error.statusCode = 400;
    throw error;
  }

  return date;
}

function buildPagination(query) {
  const limit = parsePositiveInt(query.limit, DEFAULT_LIMIT);
  const page = parsePositiveInt(query.page, 1, 100000);
  const skip = (page - 1) * limit;

  return {
    limit,
    page,
    skip,
  };
}

function buildDateRange(query, fromField = "from", toField = "to") {
  const from = parseDate(query[fromField], fromField);
  const to = parseDate(query[toField], toField);

  if (from && to && from > to) {
    const error = new Error(`${fromField} must be before ${toField}`);
    error.statusCode = 400;
    throw error;
  }

  if (!from && !to) {
    return undefined;
  }

  return {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
}

function buildSort(query, allowedFields, fallback) {
  const requestedField = query.sortBy;
  const field = allowedFields.includes(requestedField) ? requestedField : fallback.field;
  const direction = query.sortDirection === "asc" ? 1 : fallback.direction;

  return {
    [field]: direction,
  };
}

module.exports = {
  buildDateRange,
  buildPagination,
  buildSort,
};
