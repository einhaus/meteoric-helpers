Database MCP: the opt-in server API is `@einhaus/meteoric-helpers/mcp/database`.
See [configuration, permissions, deployment boundaries, and tests](docs/database-mcp.md).

AI model defaults live in the shared model profiles. Use `resolveAiRequestConfig` for text, `resolveAiMediaModelId` for image generation or video extraction, and `resolveSpeechModelId` for narration. A new model becomes a default when a profile changes and the updated package is installed.

`GEMINI_MODEL_CATALOG` contains reviewed Gemini models. The Node export `discoverGeminiModels(apiKey)` lists every model available to a Gemini API key. Pass that key as `geminiApiKey` to `auditAiModelCatalog` to compare it with the catalog.

Use `listCatalogModelsForProvider('google')` to list Google entries through the common browser-safe catalog API. `validateAiModelCatalog()` validates identifiers and replacement paths across OpenAI, Anthropic, and Google. Existing text routing remains limited to OpenAI and Anthropic; adding a model to the Google catalog does not enable a new request provider in consuming apps.

For premium creative writing, `resolveAiRequestConfig({ preset: 'creativeWritingPremium' })` selects Claude Opus 5.5 with medium effort. Its model and cost policy are independent of general reasoning and balanced writing. Pass the resolved config to `buildAnthropicTextRequestParameters` to obtain compatible model, effort, thinking, temperature, and output-limit fields for an Anthropic Messages request. Supply system/user messages separately. Model-specific effort metadata also applies to existing Anthropic profiles; the Opus general reasoning profile now resolves high effort as specified by its inference profile.

The model-refresh automation reviews text, image, video, and speech defaults. Discovery does not automatically promote a new model, publish a package, or deploy consumers. Explicit consumer model overrides continue to take precedence over shared defaults.

To publish (GitHub Packages):
Run build:
bun run build

Publish:
bun publish

To setup GitHub Packages token environment variable: export GITHUB_PACKAGE_TOKEN=
