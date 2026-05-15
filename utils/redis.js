const Redis = require('ioredis');

const redisConfig = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000),
};

const pub = new Redis(redisConfig);
const sub = new Redis(redisConfig);

pub.on('error', (err) => console.error('Redis Pub Error:', err));
sub.on('error', (err) => console.error('Redis Sub Error:', err));

module.exports = { pub, sub };
