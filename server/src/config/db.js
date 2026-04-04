const mongoose = require('mongoose');
const { logError, logInfo, logWarn } = require('../utils/logger');

let connectPromise = null;
let queryProfilerInstalled = false;

const SLOW_QUERY_THRESHOLD_MS = Number(process.env.SLOW_QUERY_THRESHOLD_MS || 500);
const LOG_ALL_DB_QUERIES = String(process.env.LOG_ALL_DB_QUERIES || '').toLowerCase() === 'true';
const AUTO_INDEX_DEFAULT = process.env.NODE_ENV !== 'production';

const toDurationMs = (startTime) => Number(process.hrtime.bigint() - startTime) / 1e6;

const stringifyForLogs = (value) => {
  try {
    const text = JSON.stringify(value);
    if (text.length > 1600) {
      return `${text.slice(0, 1600)}...<truncated>`;
    }
    return text;
  } catch (_error) {
    return '[unserializable]';
  }
};

const logQueryPerformance = ({ operationType, modelName, operation, durationMs, details }) => {
  const roundedDurationMs = Number(durationMs.toFixed(2));
  const payload = {
    operationType,
    modelName,
    operation,
    durationMs: roundedDurationMs,
    details: stringifyForLogs(details)
  };

  if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
    logWarn('slow_db_query', payload);
    return;
  }

  if (LOG_ALL_DB_QUERIES) {
    logInfo('db_query', payload);
  }
};

const installQueryProfiler = () => {
  if (queryProfilerInstalled) {
    return;
  }

  queryProfilerInstalled = true;

  const originalQueryExec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = async function profiledQueryExec(...args) {
    const startTime = process.hrtime.bigint();

    try {
      return await originalQueryExec.apply(this, args);
    } finally {
      const durationMs = toDurationMs(startTime);
      logQueryPerformance({
        operationType: 'query',
        modelName: this?.model?.modelName || 'unknown',
        operation: this?.op || 'unknown',
        durationMs,
        details: {
          filter: this?.getFilter ? this.getFilter() : this?._conditions,
          options: this?.getOptions ? this.getOptions() : this?.options,
          projection: this?._fields
        }
      });
    }
  };

  const originalAggregateExec = mongoose.Aggregate.prototype.exec;
  mongoose.Aggregate.prototype.exec = async function profiledAggregateExec(...args) {
    const startTime = process.hrtime.bigint();

    try {
      return await originalAggregateExec.apply(this, args);
    } finally {
      const durationMs = toDurationMs(startTime);
      logQueryPerformance({
        operationType: 'aggregate',
        modelName: this?._model?.modelName || 'unknown',
        operation: 'aggregate',
        durationMs,
        details: {
          pipeline: this?.pipeline ? this.pipeline() : this?._pipeline,
          options: this?.options
        }
      });
    }
  };
};

const buildMongoOptions = () => ({
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
  minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 2),
  serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 7000),
  socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000),
  retryWrites: true,
  autoIndex:
    process.env.MONGO_AUTO_INDEX === undefined
      ? AUTO_INDEX_DEFAULT
      : String(process.env.MONGO_AUTO_INDEX || '').toLowerCase() === 'true'
});

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = mongoose
    .connect(uri, buildMongoOptions())
    .then((connection) => {
      installQueryProfiler();
      logInfo('mongodb_connected', {
        host: connection?.connections?.[0]?.host || 'unknown'
      });
      return connection;
    })
    .catch((error) => {
      connectPromise = null;
      logError('mongodb_connection_failed', {
        message: error?.message || 'Unknown connection error'
      });
      throw error;
    });

  return connectPromise;
};

module.exports = connectDB;