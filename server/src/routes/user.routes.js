const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const userController = require('../controllers/user.controller');

const router = express.Router();

router.get('/:id', protect, userController.getById);
router.put('/:id', protect, userController.updateById);

module.exports = router;