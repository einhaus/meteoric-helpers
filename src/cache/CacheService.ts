import { type RedisClientType, type RedisFunctions, type RedisModules, type RedisScripts, createClient } from '@redis/client';

/**
 * Configuration options for the CacheService
 */
export interface CacheServiceConfig {
    /**
     * Redis username (default: 'default')
     */
    username?: string;
    /**
     * Redis password
     */
    password: string;
    /**
     * Redis host (default: 'localhost')
     */
    host?: string;
    /**
     * Redis port (default: 6379)
     */
    port?: number;
}

/**
 * Redis cache service using singleton pattern
 */
export class CacheService {
    // Use camelCase for constant names as per linting rules
    private static readonly defaultKey = 'default';
    private static readonly instances: Map<string, CacheService> = new Map();
    private readonly config: CacheServiceConfig;
    private redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts> | null = null;

    /**
     * Private constructor to prevent direct instantiation
     * @param config Redis configuration
     */
    private constructor(config: CacheServiceConfig) {
        this.config = config;
    }

    /**
     * Get the singleton instance of CacheService
     * @param config Redis configuration
     * @param key Optional key to identify the instance (defaults to 'default')
     * @returns CacheService instance
     */
    public static getInstance(config?: CacheServiceConfig, key?: string): CacheService {
        const instanceKey = key || CacheService.defaultKey;
        const instance = CacheService.instances.get(instanceKey);

        if (!instance) {
            if (!config) {
                throw new Error(`CacheService instance with key "${instanceKey}" not initialized. Please provide configuration.`);
            }

            const newInstance = new CacheService(config);
            CacheService.instances.set(instanceKey, newInstance);
            return newInstance;
        } else if (config) {
            // If config is provided and instance exists, update the config with new values
            Object.assign(instance.config, config);
            // Close existing connection to apply new config on next getClient call
            void instance.close();
        }

        return instance;
    }

    /**
     * Get all registered instance keys
     * @returns Array of instance keys
     */
    public static getInstanceKeys(): string[] {
        return Array.from(CacheService.instances.keys());
    }

    /**
     * Reset the singleton instance (primarily for testing)
     * @param key Optional key to identify the instance to reset (defaults to all instances)
     */
    public static resetInstance(key?: string): void {
        if (key) {
            const instance = CacheService.instances.get(key);

            if (instance) {
                void instance.close();
                CacheService.instances.delete(key);
            }
        } else {
            // Reset all instances
            for (const [instanceKey, instance] of CacheService.instances.entries()) {
                void instance.close();
                CacheService.instances.delete(instanceKey);
            }
        }
    }

    /**
     * Get the Redis client, initializing it if necessary
     * @returns Redis client
     */
    async getClient() {
        if (!this.redisClient) this.initClient();
        if (!this.redisClient?.isOpen) await this.redisClient?.connect();

        return this.redisClient;
    }

    /**
     * Initialize the Redis client with the configured settings
     */
    private initClient() {
        const { username = 'default', password, host = 'localhost', port = 6379 } = this.config;

        this.redisClient = createClient({
            url: `redis://${username}:${password}@${host}:${port}`
        });

        this.redisClient.on('error', (err) => {
            console.error('Redis Client Error:', err);
        });
    }

    /**
     * Close the Redis client connection
     */
    async close() {
        if (this.redisClient?.isOpen) await this.redisClient.quit();
        this.redisClient = null;
    }

    /**
     * Set a value in the cache
     * @param key Cache key
     * @param value Value to cache
     * @param ttlSeconds Optional time-to-live in seconds (defaults to 24 hours)
     * @returns Redis response
     */
    async set(key: string, value: string, ttlSeconds?: number) {
        const client = await this.getClient();
        if (!client) throw new Error('Redis client not initialized');

        const TWENTY_FOUR_HOURS_IN_SECONDS = 86400;

        if (ttlSeconds) {
            return client.set(key, value, { EX: ttlSeconds });
        } else {
            return client.set(key, value, { EX: TWENTY_FOUR_HOURS_IN_SECONDS });
        }
    }

    /**
     * Get a value from the cache
     * @param key Cache key
     * @returns The cached value or null if not found
     */
    async get(key: string) {
        const client = await this.getClient();

        if (!client) throw new Error('Redis client not initialized');
        return client.get(key);
    }

    /**
     * Delete a value from the cache
     * @param key Cache key
     * @returns Number of keys removed
     */
    async del(key: string) {
        const client = await this.getClient();

        if (!client) throw new Error('Redis client not initialized');
        return client.del(key);
    }

    /**
     * Get a typed value from the cache
     * @param key Cache key
     * @returns The parsed cached value or null if not found
     */
    async getTyped<T>(key: string) {
        const client = await this.getClient();

        if (!client) throw new Error('Redis client not initialized');

        const value = await client.get(key);

        if (!value) return null;

        return JSON.parse(value) as T;
    }
}
