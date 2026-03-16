import { beforeEach, describe, expect, it } from 'vitest';
import { PerformanceBenchmark } from '../../src/misc/PerformanceBenchmark.js';

describe('PerformanceBenchmark', () => {
    beforeEach(() => {
        PerformanceBenchmark.resetInstance();
    });

    it('allows overlapping spans with the same id to end independently', () => {
        const benchmark = PerformanceBenchmark.getInstance({
            enabled: true,
            precision: 'ms',
            decimalPlaces: 2
        });

        benchmark.startTracking('shared-span');
        benchmark.startTracking('shared-span');

        expect(() => benchmark.endTracking('shared-span')).not.toThrow();
        expect(() => benchmark.endTracking('shared-span')).not.toThrow();
        expect(() => benchmark.endTracking('shared-span')).toThrow('No active span found for id: shared-span');
    });
});
