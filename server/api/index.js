require('dotenv').config();

const app = require('../src/app');
const connectDB = require('../src/config/db');

module.exports = async (req, res) => {
	try {
		await connectDB();
		return app(req, res);
	} catch (error) {
		console.error('API initialization error:', error);
		return res.status(500).json({
			success: false,
			message: 'Server initialization failed'
		});
	}
};
