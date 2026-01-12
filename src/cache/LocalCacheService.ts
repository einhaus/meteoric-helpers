// eslint-disable-next-line @typescript-eslint/naming-convention
import NodeCache from 'node-cache';

export interface LocalCacheConfig {
    /**
     * Default time-to-live in seconds (default: 300 seconds / 5 minutes)
     */
    defaultTtl?: number;

    /**
     * Maximum number of keys to store. When exceeded, oldest keys are evicted.
     * Set to 0 or undefined for unlimited (default: unlimited)
     * IMPORTANT: Setting a limit prevents unbounded memory growth in long-running processes
     */
    maxKeys?: number;

    /**
     * Whether to clone objects on get/set (default: true for safety, false for performance)
     * Setting to false avoids deep cloning which can double peak memory usage for large objects.
     * Use false when you don't mutate cached objects after retrieval.
     */
    useClones?: boolean;

    /**
     * Period in seconds for automatic expired key cleanup (default: 600 = 10 minutes)
     * Lower values = more frequent cleanup = less memory but more CPU
     */
    checkPeriod?: number;
}

export interface LocalCacheStats {
    keys: number;
    hits: number;
    misses: number;
    ksize: number;
    vsize: number;
}

/**
 * Local in-memory cache service using singleton pattern
 */
export class LocalCacheService {
    private readonly cache: NodeCache;
    private static instance: LocalCacheService | null = null;
    private readonly maxKeys: number;

    /**
     * Private constructor to prevent direct instantiation
     * @param config Optional configuration
     */
    private constructor(config?: LocalCacheConfig) {
        const defaultTtl = config?.defaultTtl ?? 300; // Default 5 min TTL
        const shouldUseClones = config?.useClones ?? true; // Default true for safety
        const checkPeriod = config?.checkPeriod ?? 600; // Default 10 min cleanup

        this.maxKeys = config?.maxKeys ?? 0; // 0 = unlimited

        this.cache = new NodeCache({
            stdTTL: defaultTtl,
            useClones: shouldUseClones,
            checkperiod: checkPeriod
        });
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
        // Enforce maxKeys limit if configured
        if (this.maxKeys > 0) {
            const currentKeys = this.cache.keys().length;

            // If at or over limit and this is a new key, evict oldest entries
            if (currentKeys >= this.maxKeys && !this.cache.has(key)) {
                const keysToEvict = Math.max(1, Math.floor(this.maxKeys * 0.1)); // Evict 10% to reduce churn
                const allKeys = this.cache.keys();

                // node-cache doesn't track insertion order, so we evict from the front
                // This is approximate LRU behavior
                for (let i = 0; i < keysToEvict && i < allKeys.length; i++) {
                    this.cache.del(allKeys[i]!);
                }
            }
        }

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

    /**
     * Get cache statistics for monitoring
     * @returns Object with cache stats (keys, hits, misses, size estimates)
     */
    getStats(): LocalCacheStats {
        return this.cache.getStats();
    }

    /**
     * Get all current keys in the cache
     * @returns Array of cache keys
     */
    keys(): string[] {
        return this.cache.keys();
    }
}
