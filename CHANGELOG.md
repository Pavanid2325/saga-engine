# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of `@saga-engine/core`

## [0.1.0] - 2024-01-XX

### Added

#### Core Features
- `Saga` class with fluent builder pattern for defining multi-step transactions
- `SagaOrchestrator` for executing sagas with automatic compensation on failure
- `InMemoryStore` for development and testing
- Full TypeScript support with generics for type-safe input/output

#### Saga Definition
- `step()` method for adding steps with execute and optional compensate functions
- `addSteps()` method for bulk step addition
- Step result access via `ctx.stepResults` Map
- Unique saga execution IDs via `ctx.sagaId`

#### Compensation
- Automatic reverse-order compensation when any step fails
- Configurable compensation failure strategies: `retry`, `continue`, `halt`
- Configurable retry attempts and delay for `retry` strategy
- Compensation error collection and reporting

#### Events
- `saga:started` - Emitted when saga execution begins
- `step:executed` - Emitted after each successful step
- `step:failed` - Emitted when a step throws an error
- `compensation:started` - Emitted when compensation begins
- `step:compensated` - Emitted after each successful compensation
- `compensation:completed` - Emitted when all compensations complete
- `saga:completed` - Emitted on successful saga completion
- `saga:failed` - Emitted on saga failure (after compensation)

#### State Management
- `StateStore` interface for pluggable storage backends
- Full saga state persistence (status, steps, results, timestamps)
- `getPendingSagas()` for crash recovery support
- `recover()` method to handle interrupted sagas on startup

#### Developer Experience
- Comprehensive error messages
- TypeScript strict mode compatible
- ESM and CommonJS builds
- Zero runtime dependencies

### Testing
- 193+ unit, integration, and stress tests
- Edge case coverage for production scenarios
- Concurrent execution tests
- Large data handling tests

---

## Version History

- **0.1.0** - Initial public release

[Unreleased]: https://github.com/saga-engine/saga-engine/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/saga-engine/saga-engine/releases/tag/v0.1.0
