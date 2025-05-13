export function getNestedValue<T, R = unknown>(obj: T, path: string): R | undefined {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const key of parts) {
        // If current is null or not an object, we can't go deeper
        if (current === null || typeof current !== 'object') {
            return undefined;
        }

        // Check if 'key' is a property on current
        if (!Object.prototype.hasOwnProperty.call(current, key)) {
            return undefined;
        }

        // Narrow type: treat 'current' as an indexable object
        current = (current as Record<string, unknown>)[key];
    }

    return current as R;
}
