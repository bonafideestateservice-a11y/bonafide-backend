// Keep tests off Redis: without REDIS_URL, emitted events fail to queue (and
// are logged) instead of adding jobs to a developer's local queues.
process.env.REDIS_URL = "";
