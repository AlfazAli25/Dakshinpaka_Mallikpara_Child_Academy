const CONTROL_KEYS = new Set([
  '_page',
  '_limit',
  '_sort',
  '_order',
  '_select',
  '_lean',
  'page',
  'limit',
  'sort',
  'order',
  'select',
  'lean'
]);

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const parseReadOptions = (inputFilter = {}) => {
  const filter = { ...inputFilter };
  const rawPage = filter.page ?? filter._page;
  const rawLimit = filter.limit ?? filter._limit;
  const rawSort = filter.sort ?? filter._sort;
  const rawOrder = String(filter.order ?? filter._order ?? 'desc').toLowerCase();
  const rawSelect = filter.select ?? filter._select;
  const rawLean = filter.lean ?? filter._lean;

  for (const key of CONTROL_KEYS) {
    delete filter[key];
  }

  const hasExplicitLimit = rawLimit !== undefined && rawLimit !== null && String(rawLimit).trim() !== '';
  const hasExplicitPage = rawPage !== undefined && rawPage !== null && String(rawPage).trim() !== '';

  const page = toPositiveInt(rawPage, 1);
  const defaultLimit = hasExplicitLimit || hasExplicitPage ? 20 : 0;
  const limit = Math.min(toPositiveInt(rawLimit, defaultLimit), 200);
  const skip = limit > 0 ? (page - 1) * limit : 0;
  const sort = rawSort
    ? {
      [String(rawSort)]: rawOrder === 'asc' ? 1 : -1
    }
    : null;

  return {
    filter,
    page,
    limit,
    select: rawSelect ? String(rawSelect) : '',
    sort,
    skip,
    lean: String(rawLean || 'true').toLowerCase() !== 'false'
  };
};

const createCrudService = (Model) => ({
  findAll: async (inputFilter = {}, populate = '') => {
    const { filter, select, sort, skip, limit, lean } = parseReadOptions(inputFilter);

    let query = Model.find(filter);
    if (select) {
      query = query.select(select);
    }
    if (populate) {
      query = query.populate(populate);
    }
    if (sort) {
      query = query.sort(sort);
    }
    if (limit > 0) {
      query = query.skip(skip).limit(limit);
    }
    if (lean) {
      query = query.lean();
    }

    return query;
  },
  countDocuments: async (inputFilter = {}) => {
    const { filter } = parseReadOptions(inputFilter);
    return Model.countDocuments(filter);
  },
  findById: async (id, populate = '') => {
    let query = Model.findById(id);
    if (populate) {
      query = query.populate(populate);
    }
    return query.lean();
  },
  create: async (payload) => Model.create(payload),
  updateById: async (id, payload) => Model.findByIdAndUpdate(id, payload, { new: true, runValidators: true }),
  deleteById: async (id) => Model.findByIdAndDelete(id)
});

module.exports = createCrudService;