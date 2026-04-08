const SCHOOL_NAME = process.env.SCHOOL_NAME || 'Dakshinpaka Mallikpara Child Academy';
const SCHOOL_BRANCH_NAME =
	process.env.SCHOOL_BRANCH_NAME ||
	`${SCHOOL_NAME} Kindergarten`;
const SCHOOL_ADDRESS =
	process.env.SCHOOL_ADDRESS ||
	'Vill- Dakshinpaka, P.O - Mallikpara, Dist- Malda, West Bengal - 732123';
const SCHOOL_MOBILE =
	process.env.SCHOOL_MOBILE ||
	'+91 9734196551, +91 9733114790';
const SCHOOL_TIME_ZONE =
	process.env.SCHOOL_TIME_ZONE ||
	'Asia/Kolkata';

module.exports = {
	SCHOOL_NAME,
	SCHOOL_BRANCH_NAME,
	SCHOOL_ADDRESS,
	SCHOOL_MOBILE,
	SCHOOL_TIME_ZONE
};
