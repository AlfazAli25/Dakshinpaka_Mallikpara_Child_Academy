const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (value = '') => EMAIL_REGEX.test(String(value).trim());

module.exports = {
	isValidEmail
};