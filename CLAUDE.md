# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build and Development
- `npm run build` - Clean, regenerate barrel files, and compile TypeScript
- `npm run build:barrel` - Regenerate barrel export files (index.ts and node.ts)
- `npm run watch` - Development mode with file watching and auto-compilation
- `npm run clean` - Remove dist directory
- `npm test` - Run tests using Vitest

### Publishing
- `npm publish --access public` - Publish to npm registry
- Set `GITHUB_PACKAGE_TOKEN` environment variable for GitHub package publishing

## Architecture Overview

### Barrel File System
This project uses an automated barrel file generation system (`utilities/buildBarrelFile.ts`) that creates two entry points:

- **`src/index.ts`** - Web-compatible exports only (excludes Node.js-specific modules)
- **`src/node.ts`** - All exports including Node.js-specific utilities

The build script automatically categorizes functions based on their imports:
- Functions importing Node.js modules (fs, path, crypto, etc.) go to node.js entry point only
- Web-compatible functions are included in both entry points
- Files like `S3Helper` are always considered Node.js-specific

### Module Organization
Utilities are organized by category in `src/` subdirectories:
- `array/` - Array manipulation and search functions
- `cache/` - Caching services (LocalCacheService, Redis-based CacheService)
- `date/` - Extensive date/time utilities including trading hours and market calculations
- `db/` - Database helpers for MySQL, PostgreSQL, and ClickHouse
- `file/` - File operations including S3 utilities and compression
- `math/` - Mathematical calculations, statistics, and financial formulas
- `misc/` - General utilities (logging, email, object manipulation)
- `object/` - Object property access and manipulation
- `path/` - URL and path utilities
- `string/` - String manipulation functions

### Database Utilities
The project includes comprehensive database support:
- Type generation utilities for MySQL and PostgreSQL schemas
- Connection helpers with proper TypeScript typing
- Support for ClickHouse, MySQL2, and pg drivers

### Dual Export Strategy
The package.json defines multiple export paths supporting both CommonJS and ES modules:
- Main exports for web/Node.js environments
- Specialized database helper exports
- Flexible import patterns supporting various module systems

### Development Workflow
The barrel file generation runs automatically during build to ensure all new utilities are properly exported. The system distinguishes between web-safe and Node.js-specific code to maintain browser compatibility for the main entry point.