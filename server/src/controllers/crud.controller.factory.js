const asyncHandler = require('../middleware/async.middleware');

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const parsePaginationFromQuery = (query = {}) => {
  const rawPage = query.page ?? query._page;
  const rawLimit = query.limit ?? query._limit;
  const hasPagination =
    rawPage !== undefined || rawLimit !== undefined;

  if (!hasPagination) {
    return {
      hasPagination: false,
      page: 1,
      limit: 0
    };
  }

  const page = toPositiveInt(rawPage, 1);
  const limit = Math.min(toPositiveInt(rawLimit, 20), 200);

  return {
    hasPagination: true,
    page,
    limit
  };
};

const createCrudController = (service, moduleName) => {
  const list = asyncHandler(async (req, res) => {
    const query = req.query || {};
    const pagination = parsePaginationFromQuery(query);

    if (pagination.hasPagination && typeof service.countDocuments === 'function') {
      const [data, total] = await Promise.all([
        service.findAll(query),
        service.countDocuments(query)
      ]);

      return res.json({
        success: true,
        data,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit)
        }
      });
    }

    const data = await service.findAll(query);
    return res.json({ success: true, data });
  });

  const get = asyncHandler(async (req, res) => {
    const item = await service.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: `${moduleName} not found` });
    }
    return res.json({ success: true, data: item });
  });

  const create = asyncHandler(async (req, res) => {
    const item = await service.create(req.body);
    res.status(201).json({ success: true, data: item });
  });

  const update = asyncHandler(async (req, res) => {
    const item = await service.updateById(req.params.id, req.body);
    if (!item) {
      return res.status(404).json({ success: false, message: `${moduleName} not found` });
    }
    return res.json({ success: true, data: item });
  });

  const remove = asyncHandler(async (req, res) => {
    const item = await service.deleteById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: `${moduleName} not found` });
    }
    return res.json({ success: true, message: `${moduleName} deleted` });
  });

  return { list, get, create, update, remove };
};

module.exports = createCrudController;