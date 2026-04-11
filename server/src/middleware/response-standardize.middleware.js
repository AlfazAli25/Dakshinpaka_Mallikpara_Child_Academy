const normalizeApiPayload = (payload, statusCode) => {
  const isSuccess = statusCode < 400;

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const hasSuccessFlag = Object.prototype.hasOwnProperty.call(payload, 'success');

    if (hasSuccessFlag) {
      const { success, data, message, pagination, ...rest } = payload;
      return {
        success: Boolean(success),
        data: data ?? (Boolean(success) ? {} : null),
        message: typeof message === 'string' ? message : '',
        pagination: pagination && typeof pagination === 'object' ? pagination : {},
        ...rest
      };
    }

    return {
      success: isSuccess,
      data: payload,
      message: '',
      pagination: {}
    };
  }

  return {
    success: isSuccess,
    data: payload ?? null,
    message: '',
    pagination: {}
  };
};

const responseStandardizeMiddleware = (_req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    const normalizedPayload = normalizeApiPayload(payload, res.statusCode || 200);
    return originalJson(normalizedPayload);
  };

  next();
};

module.exports = {
  responseStandardizeMiddleware
};
