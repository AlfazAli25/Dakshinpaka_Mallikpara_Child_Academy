const IORedis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const { runMonthlySync } = require('./monthly-sync.service');
const { getRedisUrl, getRedisConnectionOptions } = require('../config/redis');
const { logError, logInfo, logWarn } = require('../utils/logger');

const JOB_QUEUE_NAME = 'system-jobs';
const MONTHLY_SYNC_JOB_NAME = 'monthly-sync';
const ENABLE_SYSTEM_JOBS = String(process.env.ENABLE_SYSTEM_JOBS || 'true').toLowerCase() !== 'false';

let queueInstance = null;
let workerInstance = null;
let queueConnection = null;
let workerConnection = null;
let queueBootstrapPromise = null;

const createRedisConnection = () => {
	const redisUrl = getRedisUrl();
	if (!redisUrl) {
		return null;
	}

	return new IORedis(redisUrl, getRedisConnectionOptions());
};

const buildMonthlySyncJobId = ({ force = false } = {}) => {
	const monthKey = new Date().toISOString().slice(0, 7);
	return `${MONTHLY_SYNC_JOB_NAME}:${monthKey}:${force ? 'force' : 'normal'}`;
};

const runInProcessFallback = ({ reason, force }) => {
	setImmediate(async () => {
		try {
			await runMonthlySync({ reason, force });
		} catch (error) {
			logError('monthly_sync_background_fallback_failed', {
				reason,
				message: error?.message || 'Unknown monthly sync fallback failure'
			});
		}
	});
};

const ensureSystemJobQueue = async () => {
	if (!ENABLE_SYSTEM_JOBS) {
		return null;
	}

	if (queueInstance && workerInstance) {
		return queueInstance;
	}

	if (queueBootstrapPromise) {
		return queueBootstrapPromise;
	}

	queueBootstrapPromise = (async () => {
		const redisUrl = getRedisUrl();
		if (!redisUrl) {
			logInfo('system_job_queue_disabled', {
				reason: 'REDIS_URL not configured'
			});
			return null;
		}

		queueConnection = createRedisConnection();
		workerConnection = createRedisConnection();

		if (!queueConnection || !workerConnection) {
			return null;
		}

		queueInstance = new Queue(JOB_QUEUE_NAME, {
			connection: queueConnection,
			defaultJobOptions: {
				removeOnComplete: 20,
				removeOnFail: 50,
				attempts: 2,
				backoff: {
					type: 'exponential',
					delay: 3000
				}
			}
		});

		workerInstance = new Worker(
			JOB_QUEUE_NAME,
			async (job) => {
				if (job.name === MONTHLY_SYNC_JOB_NAME) {
					const force = Boolean(job.data?.force);
					const reason = String(job.data?.reason || 'queue-monthly-sync');
					return runMonthlySync({ reason, force });
				}

				logWarn('system_job_skipped', {
					jobName: job.name
				});
				return null;
			},
			{
				connection: workerConnection,
				concurrency: 1
			}
		);

		workerInstance.on('completed', (job) => {
			logInfo('system_job_completed', {
				jobId: job.id,
				jobName: job.name
			});
		});

		workerInstance.on('failed', (job, error) => {
			logError('system_job_failed', {
				jobId: job?.id,
				jobName: job?.name,
				message: error?.message || 'Unknown job failure'
			});
		});

		logInfo('system_job_queue_ready', {
			queueName: JOB_QUEUE_NAME
		});

		return queueInstance;
	})().catch((error) => {
		logWarn('system_job_queue_init_failed', {
			message: error?.message || 'Unknown queue initialization error'
		});

		queueInstance = null;
		workerInstance = null;
		return null;
	}).finally(() => {
		queueBootstrapPromise = null;
	});

	return queueBootstrapPromise;
};

const enqueueMonthlySyncJob = async ({ reason = 'queue-monthly-sync', force = false } = {}) => {
	const queue = await ensureSystemJobQueue();
	if (!queue) {
		runInProcessFallback({ reason, force });
		return {
			queued: true,
			mode: 'in-process-fallback',
			jobId: buildMonthlySyncJobId({ force })
		};
	}

	const jobId = buildMonthlySyncJobId({ force });
	const job = await queue.add(
		MONTHLY_SYNC_JOB_NAME,
		{
			reason,
			force
		},
		{
			jobId
		}
	);

	return {
		queued: true,
		mode: 'bullmq',
		jobId: String(job?.id || jobId)
	};
};

module.exports = {
	enqueueMonthlySyncJob
};