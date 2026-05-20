function serializeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === 'object') {
    if (typeof value.toHexString === 'function') {
      return value.toHexString();
    }

    return serializeDocument(value);
  }

  return value;
}

function serializeDocument(document) {
  const plain =
    document && typeof document.toObject === 'function'
      ? document.toObject({ virtuals: false })
      : document;

  return Object.entries(plain || {}).reduce((serialized, [key, value]) => {
    if (key === '__v' || key === 'passwordHash') {
      return serialized;
    }

    if (key === '_id') {
      serialized.id = serializeValue(value);
      return serialized;
    }

    serialized[key] = serializeValue(value);
    return serialized;
  }, {});
}

function serializeList(documents) {
  return documents.map(serializeDocument);
}

function sendList(res, documents, meta = {}) {
  res.json({
    data: serializeList(documents),
    meta,
  });
}

function sendItem(res, document) {
  if (!document) {
    res.status(404).json({
      error: {
        message: "Resource not found",
      },
    });
    return;
  }

  res.json({
    data: serializeDocument(document),
  });
}

module.exports = {
  sendItem,
  sendList,
  serializeDocument,
  serializeList,
};
