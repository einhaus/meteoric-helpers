import process from 'node:process';
import { msg } from './msg.js';

export interface PerformanceBenchmarkConfig {
    /**
     * Enable or disable the benchmarker.
     * When disabled, all methods become no-ops.
     * @default true
     */
    enabled?: boolean;

    /**
     * Precision for duration output in getSummary() and printSummary().
     * - 's': seconds (e.g., 1.234)
     * - 'ms': milliseconds (e.g., 1234.567)
     * - 'us': microseconds (e.g., 1234567.890)
     * - 'ns': nanoseconds (e.g., 1234567890)
     * @default 'ms'
     */
    precision?: 's' | 'ms' | 'us' | 'ns';

    /**
     * Number of decimal places for duration values.
     * @default 2
     */
    decimalPlaces?: number;
}

interface Checkpoint {
    label: string;
    timestamp: bigint;
}

interface SpanRecord {
    startTime: bigint;
    endTime?: bigint;
    completed: boolean;
}

interface SpanTracker {
    activeSpans: SpanRecord[];
    lastCompletedSpan?: SpanRecord;
}

interface AggregateRecord {
    totalTimeNs: bigint;
    callCount: number;
    minTimeNs: bigint;
    maxTimeNs: bigint;
    currentStartTime?: bigint;
}

export interface CheckpointSummary {
    label: string;
    timeSinceStart: number;
    timeSincePrevious: number;
}

export interface SpanSummary {
    duration: number;
    completed: boolean;
}

export interface AggregateSummary {
    totalTime: number;
    callCount: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
}

export interface BenchmarkSummary {
    enabled: boolean;
    precision: 's' | 'ms' | 'us' | 'ns';
    totalElapsed: number;
    checkpoints: CheckpointSummary[];
    spans: Record<string, SpanSummary>;
    aggregates: Record<string, AggregateSummary>;
}

export class PerformanceBenchmark {
    private static instance: PerformanceBenchmark | null = null;

    private enabled: boolean;
    private readonly precision: 's' | 'ms' | 'us' | 'ns';
    private readonly decimalPlaces: number;

    private inceptionTime: bigint;
    private checkpoints: Checkpoint[] = [];
    private readonly spans: Map<string, SpanTracker> = new Map();
    private readonly aggregates: Map<string, AggregateRecord> = new Map();

    private constructor(config: PerformanceBenchmarkConfig) {
        this.enabled = config.enabled ?? true;
        this.precision = config.precision ?? 'ms';
        this.decimalPlaces = config.decimalPlaces ?? 2;
        this.inceptionTime = process.hrtime.bigint();
    }

    /**
     * Get the singleton instance of PerformanceBenchmark
     * @param config Configuration required on first initialization
     * @returns The PerformanceBenchmark instance
     */
    public static getInstance(config?: PerformanceBenchmarkConfig): PerformanceBenchmark {
        if (!PerformanceBenchmark.instance) {
            if (!config) {
                throw new Error('PerformanceBenchmark config is required on first initialization');
            }

            PerformanceBenchmark.instance = new PerformanceBenchmark(config);
        }

        return PerformanceBenchmark.instance;
    }

    /**
     * Reset the singleton instance (primarily for testing)
     */
    public static resetInstance(): void {
        PerformanceBenchmark.instance = null;
    }

    /**
     * Convert nanoseconds to the configured output precision
     */
    private convertNsToOutput(ns: bigint): number {
        switch (this.precision) {
            case 'ns':
                return Number(ns);
            case 'us':
                return Number(ns) / 1_000;
            case 's':
                return Number(ns) / 1_000_000_000;
            case 'ms':
            default:
                return Number(ns) / 1_000_000;
        }
    }

    /**
     * Format a number with the configured decimal places and thousand separators
     */
    private formatNumber(value: number): string {
        return value.toLocaleString('en-US', {
            minimumFractionDigits: this.decimalPlaces,
            maximumFractionDigits: this.decimalPlaces
        });
    }

    /**
     * Get the precision unit label
     */
    private getPrecisionLabel(): string {
        switch (this.precision) {
            case 'ns':
                return 'ns';
            case 'us':
                return 'μs';
            case 's':
                return 's';
            case 'ms':
            default:
                return 'ms';
        }
    }

    /**
     * Record a checkpoint with the given label
     * @param label Descriptive label for this checkpoint
     */
    public track(label: string): void {
        if (!this.enabled) return;

        this.checkpoints.push({
            label,
            timestamp: process.hrtime.bigint() - this.inceptionTime
        });
    }

    /**
     * Begin timing a span with the given identifier
     * @param id Unique identifier for this span
     */
    public startTracking(id: string): void {
        if (!this.enabled) return;

        const tracker = this.spans.get(id) ?? { activeSpans: [] };

        tracker.activeSpans.push({
            startTime: process.hrtime.bigint(),
            completed: false
        });

        this.spans.set(id, tracker);
    }

    /**
     * End the span and return duration in configured precision
     * @param id Identifier for the span to end
     * @returns Duration in configured precision (ms by default)
     * @throws Error if no active span found for the given id
     */
    public endTracking(id: string): number {
        if (!this.enabled) return 0;

        const tracker = this.spans.get(id);
        const span = tracker?.activeSpans.pop();

        if (!tracker || !span) {
            throw new Error(`No active span found for id: ${id}`);
        }

        const endTime = process.hrtime.bigint();
        span.endTime = endTime;
        span.completed = true;
        tracker.lastCompletedSpan = span;

        const durationNs = endTime - span.startTime;
        return this.convertNsToOutput(durationNs);
    }

    /**
     * Begin timing one iteration of an aggregate measurement
     * @param id Identifier for this aggregate tracking point
     */
    public trackMultipleStart(id: string): void {
        if (!this.enabled) return;

        let record = this.aggregates.get(id);

        if (!record) {
            record = {
                totalTimeNs: BigInt(0),
                callCount: 0,
                minTimeNs: BigInt(Number.MAX_SAFE_INTEGER),
                maxTimeNs: BigInt(0)
            };

            this.aggregates.set(id, record);
        }

        record.currentStartTime = process.hrtime.bigint();
    }

    /**
     * End the current iteration and accumulate to totals
     * @param id Identifier for this aggregate tracking point
     * @throws Error if no active aggregate tracking found for the given id
     */
    public trackMultipleEnd(id: string): void {
        if (!this.enabled) return;

        const record = this.aggregates.get(id);

        if (record?.currentStartTime === undefined) {
            throw new Error(`No active aggregate tracking found for id: ${id}`);
        }

        const endTime = process.hrtime.bigint();
        const durationNs = endTime - record.currentStartTime;

        record.totalTimeNs += durationNs;
        record.callCount++;

        if (durationNs < record.minTimeNs) {
            record.minTimeNs = durationNs;
        }

        if (durationNs > record.maxTimeNs) {
            record.maxTimeNs = durationNs;
        }

        delete record.currentStartTime;
    }

    /**
     * Get structured summary of all tracking data
     * @returns BenchmarkSummary object
     */
    public getSummary(): BenchmarkSummary {
        const totalElapsedNs = process.hrtime.bigint() - this.inceptionTime;

        const checkpointSummaries: CheckpointSummary[] = this.checkpoints.map((checkpoint, index) => {
            const timeSinceStart = this.convertNsToOutput(checkpoint.timestamp);
            const previousCheckpoint = index > 0 ? this.checkpoints[index - 1] : null;
            const previousTimestamp = previousCheckpoint?.timestamp ?? BigInt(0);
            const timeSincePrevious = this.convertNsToOutput(checkpoint.timestamp - previousTimestamp);

            return {
                label: checkpoint.label,
                timeSinceStart,
                timeSincePrevious
            };
        });

        const spanSummaries: Record<string, SpanSummary> = {};

        for (const [id, tracker] of this.spans.entries()) {
            const activeSpan = tracker.activeSpans[tracker.activeSpans.length - 1];
            const span = activeSpan ?? tracker.lastCompletedSpan;
            if (!span) continue;

            let duration = 0;

            if (span.endTime !== undefined) {
                duration = this.convertNsToOutput(span.endTime - span.startTime);
            } else {
                // Still running - calculate current duration
                const currentDuration = process.hrtime.bigint() - span.startTime;
                duration = this.convertNsToOutput(currentDuration);
            }

            spanSummaries[id] = {
                duration,
                completed: activeSpan === undefined
            };
        }

        const aggregateSummaries: Record<string, AggregateSummary> = {};

        for (const [id, record] of this.aggregates.entries()) {
            const totalTime = this.convertNsToOutput(record.totalTimeNs);
            const averageTime = record.callCount > 0 ? totalTime / record.callCount : 0;

            const minTime = record.callCount > 0 ? this.convertNsToOutput(record.minTimeNs) : 0;

            const maxTime = this.convertNsToOutput(record.maxTimeNs);

            aggregateSummaries[id] = {
                totalTime,
                callCount: record.callCount,
                averageTime,
                minTime,
                maxTime
            };
        }

        return {
            enabled: this.enabled,
            precision: this.precision,
            totalElapsed: this.convertNsToOutput(totalElapsedNs),
            checkpoints: checkpointSummaries,
            spans: spanSummaries,
            aggregates: aggregateSummaries
        };
    }

    /**
     * Get total elapsed time since inception
     * @returns Elapsed time in configured precision
     */
    public getElapsed(): number {
        const elapsedNs = process.hrtime.bigint() - this.inceptionTime;
        return this.convertNsToOutput(elapsedNs);
    }

    /**
     * Format checkpoints section for summary output
     */
    private formatCheckpointsSection(checkpoints: CheckpointSummary[], unit: string, thinDivider: string): string[] {
        if (checkpoints.length === 0) return [];

        const lines: string[] = [];
        lines.push('');
        lines.push('CHECKPOINTS');
        lines.push(thinDivider);
        lines.push(`  #  ${'Label'.padEnd(35)}${'Since Start'.padStart(15)}${'Since Previous'.padStart(18)}`);
        lines.push(thinDivider);

        checkpoints.forEach((checkpoint, index) => {
            const num = String(index + 1).padStart(3);
            const label = checkpoint.label.substring(0, 33).padEnd(35);
            const sinceStart = `${this.formatNumber(checkpoint.timeSinceStart)} ${unit}`.padStart(15);
            const sincePrev = `${this.formatNumber(checkpoint.timeSincePrevious)} ${unit}`.padStart(18);
            lines.push(`${num}  ${label}${sinceStart}${sincePrev}`);
        });

        return lines;
    }

    /**
     * Format spans section for summary output
     */
    private formatSpansSection(spans: Record<string, SpanSummary>, unit: string, thinDivider: string): string[] {
        const spanIds = Object.keys(spans);
        if (spanIds.length === 0) return [];

        const lines: string[] = [];
        lines.push('');
        lines.push('SPANS');
        lines.push(thinDivider);
        lines.push(`  ${'ID'.padEnd(40)}${'Duration'.padStart(15)}${'Status'.padStart(15)}`);
        lines.push(thinDivider);

        for (const id of spanIds) {
            const span = spans[id];
            if (!span) continue;
            const idStr = id.substring(0, 38).padEnd(40);
            const duration = `${this.formatNumber(span.duration)} ${unit}`.padStart(15);
            const status = (span.completed ? 'completed' : 'running').padStart(15);
            lines.push(`  ${idStr}${duration}${status}`);
        }

        return lines;
    }

    /**
     * Format aggregates section for summary output
     */
    private formatAggregatesSection(aggregates: Record<string, AggregateSummary>, unit: string, thinDivider: string): string[] {
        const aggregateIds = Object.keys(aggregates);
        if (aggregateIds.length === 0) return [];

        const lines: string[] = [];
        lines.push('');
        lines.push('AGGREGATES');
        lines.push(thinDivider);

        const header = `  ${'ID'.padEnd(22)}${'Total'.padStart(12)}${'Count'.padStart(8)}${'Avg'.padStart(12)}${'Min'.padStart(
            12
        )}${'Max'.padStart(12)}`;

        lines.push(header);
        lines.push(thinDivider);

        for (const id of aggregateIds) {
            const agg = aggregates[id];
            if (!agg) continue;
            const idStr = id.substring(0, 20).padEnd(22);
            const total = this.formatNumber(agg.totalTime).padStart(12);
            const count = String(agg.callCount).padStart(8);
            const avg = this.formatNumber(agg.averageTime).padStart(12);
            const min = this.formatNumber(agg.minTime).padStart(12);
            const max = this.formatNumber(agg.maxTime).padStart(12);
            lines.push(`  ${idStr}${total}${count}${avg}${min}${max}`);
        }

        const unitLabel = `(${unit})`;
        lines.push(`  ${''.padEnd(22)}${unitLabel.padStart(12)}`);

        return lines;
    }

    /**
     * Print formatted summary table to console (via msg() for worker thread support)
     */
    public printSummary(): void {
        const summary = this.getSummary();
        const unit = this.getPrecisionLabel();
        const lines: string[] = [];

        const divider = '='.repeat(80);
        const thinDivider = '-'.repeat(80);

        lines.push('');
        lines.push(divider);
        lines.push('                        PERFORMANCE BENCHMARK SUMMARY');
        lines.push(divider);
        lines.push(`Total Elapsed: ${this.formatNumber(summary.totalElapsed)} ${unit}`);
        lines.push(`Status: ${summary.enabled ? 'Enabled' : 'Disabled'}`);
        lines.push(thinDivider);

        lines.push(...this.formatCheckpointsSection(summary.checkpoints, unit, thinDivider));
        lines.push(...this.formatSpansSection(summary.spans, unit, thinDivider));
        lines.push(...this.formatAggregatesSection(summary.aggregates, unit, thinDivider));

        lines.push('');
        lines.push(divider);
        lines.push('');

        msg(lines.join('\n'));
    }

    /**
     * Clear all tracking data and reset inception time
     */
    public reset(): void {
        this.inceptionTime = process.hrtime.bigint();
        this.checkpoints = [];
        this.spans.clear();
        this.aggregates.clear();
    }

    /**
     * Enable the benchmarker
     */
    public enable(): void {
        this.enabled = true;
    }

    /**
     * Disable the benchmarker (all tracking becomes no-op)
     */
    public disable(): void {
        this.enabled = false;
    }

    /**
     * Check if benchmarker is currently enabled
     * @returns true if enabled, false otherwise
     */
    public isEnabled(): boolean {
        return this.enabled;
    }
}
