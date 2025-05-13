// eslint-disable-next-line @typescript-eslint/naming-convention
import NodeCache from 'node-cache';

export interface LocalCacheConfig {
    /**
     * Default time-to-live in seconds (default: 300 seconds / 5 minutes)
     */
    defaultTtl?: number;
}

/**
 * Local in-memory cache service using singleton pattern
 */
export class LocalCacheService {
    private readonly cache: NodeCache;
    private static instance: LocalCacheService | null = null;

    /**
     * Private constructor to prevent direct instantiation
     * @param config Optional configuration
     */
    private constructor(config?: LocalCacheConfig) {
        const defaultTtl = config?.defaultTtl ?? 300; // Default 5 min TTL
        this.cache = new NodeCache({ stdTTL: defaultTtl });
    }

    /**
     * Get the singleton instance of LocalCacheService
     * @param config Optional configuration
     * @returns LocalCacheService instance
     */
    public static getInstance(config?: LocalCacheConfig): LocalCacheService {
        if (!LocalCacheService.instance) {
            LocalCacheService.instance = new LocalCacheService(config);
        }

        return LocalCacheService.instance;
    }

    /**
     * Reconfigure the singleton instance with new settings
     * @param config New configuration
     * @returns The reconfigured LocalCacheService instance
     */
    public static reconfigure(config: LocalCacheConfig): LocalCacheService {
        LocalCacheService.instance = new LocalCacheService(config);
        return LocalCacheService.instance;
    }

    /**
     * Reset the singleton instance (primarily for testing)
     */
    public static resetInstance(): void {
        LocalCacheService.instance = null;
    }

    /**
     * Get a value from the cache
     * @param key Cache key
     * @returns The cached value or undefined if not found
     */
    get<T>(key: string): T | undefined {
        return this.cache.get<T>(key);
    }

    /**
     * Set a value in the cache
     * @param key Cache key
     * @param value Value to cache
     * @param ttl Optional time-to-live in seconds (overrides default TTL)
     */
    set<T>(key: string, value: T, ttl?: number): void {
        if (ttl) this.cache.set(key, value, ttl);
        else this.cache.set(key, value);
    }

    /**
     * Delete a value from the cache
     * @param key Cache key
     * @returns true if the key was found and deleted, false otherwise
     */
    del(key: string): boolean {
        return this.cache.del(key) > 0;
    }

    /**
     * Check if a key exists in the cache
     * @param key Cache key
     * @returns true if the key exists, false otherwise
     */
    has(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * Clear all cache entries
     */
    flushAll(): void {
        this.cache.flushAll();
    }
}
