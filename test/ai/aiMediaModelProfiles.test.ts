import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAiMediaModelId } from '../../src/ai/aiMediaModelProfiles.js';
import { auditAiModelCatalog } from '../../src/ai/aiModelCatalogSync.js';

afterEach(() => vi.unstubAllGlobals());

describe('shared media model profiles', () => {
    it('selects the shared image and video defaults', () => {
        expect(resolveAiMediaModelId({ profile: 'imageGeneration' })).toBe('gpt-image-2.6-flare');
        expect(resolveAiMediaModelId({ profile: 'videoExtraction' })).toBe('gemini-4-hydrogen');
    });

    it('preserves supported overrides and updates retired model IDs', () => {
        expect(resolveAiMediaModelId({ profile: 'imageGeneration', model: 'gpt-image-2.6-sunburst' })).toBe('gpt-image-2.6-sunburst');
        expect(resolveAiMediaModelId({ profile: 'imageGeneration', model: 'gpt-image-2-2026-04-21' })).toBe('gpt-image-2.6-flare');
        expect(resolveAiMediaModelId({ profile: 'videoExtraction', model: 'google:gemini-3.8-flash' })).toBe('gemini-3.8-flash');
        expect(resolveAiMediaModelId({ profile: 'videoExtraction', model: 'models/gemini-2.5-flash' })).toBe('gemini-3.5-flash-lite');
        expect(resolveAiMediaModelId({ profile: 'videoExtraction', model: 'models/gemini-experimental' })).toBe('gemini-experimental');
        expect(() => resolveAiMediaModelId({ profile: 'imageGeneration', model: 'gpt-6-sol' })).toThrow('does not support image output');
    });
});

describe('Gemini catalog discovery', () => {
    it('audits every page without promoting a newly discovered model', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    models: [{ name: 'models/gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen' }],
                    nextPageToken: 'page-2'
                })
            )
            .mockResolvedValueOnce(
                Response.json({
                    models: [{ name: 'models/gemini-new-model', displayName: 'Gemini New Model' }]
                })
            );
        vi.stubGlobal('fetch', fetchMock);

        const audit = await auditAiModelCatalog({ geminiApiKey: 'test-key' });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [requestUrl, requestConfig] = fetchMock.mock.calls[1] ?? [];
        expect(new URL(String(requestUrl)).searchParams.get('pageToken')).toBe('page-2');
        expect(new Headers(requestConfig?.headers).get('x-goog-api-key')).toBe('test-key');
        expect(audit.providers.find((provider) => provider.provider === 'google')).toMatchObject({
            skipped: false,
            missingFromCatalog: ['gemini-new-model']
        });
        expect(resolveAiMediaModelId({ profile: 'videoExtraction' })).toBe('gemini-4-hydrogen');
    });
});
