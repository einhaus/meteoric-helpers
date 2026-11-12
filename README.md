Database MCP: the opt-in server API is `@einhaus/meteoric-helpers/mcp/database`.
See [configuration, permissions, deployment boundaries, and tests](docs/database-mcp.md).

AI model defaults live in the shared model profiles. Use `resolveAiRequestConfig` for text, `resolveAiMediaModelId` for image generation or video extraction, and `resolveSpeechModelId` for narration. A new model becomes a default when a profile changes and the updated package is installed.

`GEMINI_MODEL_CATALOG` contains reviewed Gemini models. The Node export `discoverGeminiModels(apiKey)` lists every model available to a Gemini API key. Pass that key as `geminiApiKey` to `auditAiModelCatalog` to compare it with the catalog.

To publish (GitHub Packages):
Run build:
bun run build

Publish:
bun publish

To setup GitHub Packages token environment variable: export GITHUB_PACKAGE_TOKEN=
