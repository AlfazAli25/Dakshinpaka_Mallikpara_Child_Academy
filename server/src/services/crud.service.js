const createCrudService = (Model) => ({
  findAll: async (filter = {}, populate = '') => Model.find(filter).populate(populate),
  findById: async (id, populate = '') => Model.findById(id).populate(populate),
  create: async (payload) => Model.create(payload),
  updateById: async (id, payload) => Model.findByIdAndUpdate(id, payload, { new: true, runValidators: true }),
  deleteById: async (id) => Model.findByIdAndDelete(id)
});

module.exports = createCrudService;