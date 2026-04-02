const asyncHandler = require('../middleware/async.middleware');

const createCrudController = (service, moduleName) => {
  const list = asyncHandler(async (req, res) => {
    const data = await service.findAll(req.query || {});
    res.json({ success: true, data });
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