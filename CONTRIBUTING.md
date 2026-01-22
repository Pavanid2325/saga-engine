# Contributing to Saga Engine

Thank you for your interest in contributing to Saga Engine! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/saga-engine.git
   cd saga-engine
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Build the project:
   ```bash
   pnpm build
   ```
5. Run tests:
   ```bash
   pnpm test
   ```

## Development Workflow

### Branch Naming

- `feat/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation changes
- `refactor/description` — Code refactoring
- `test/description` — Test additions or modifications

### Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. Make your changes following our coding standards

3. Write or update tests as needed

4. Ensure all tests pass:
   ```bash
   pnpm test
   ```

5. Ensure the build succeeds:
   ```bash
   pnpm build
   ```

6. Commit your changes with a descriptive message:
   ```bash
   git commit -m "feat: add support for custom retry strategies"
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation only
- `style` — Code style (formatting, semicolons, etc.)
- `refactor` — Code refactoring
- `test` — Adding or updating tests
- `chore` — Maintenance tasks

Examples:
```
feat(core): add parallel step execution support
fix(orchestrator): handle compensation timeout correctly
docs: update README with Redis configuration examples
```

## Pull Request Process

1. Update the README.md if your changes affect the public API
2. Add or update tests for your changes
3. Ensure CI passes
4. Request review from maintainers
5. Address any feedback

### PR Title Format

Follow the same format as commit messages:
```
feat(core): add parallel step execution
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How were these changes tested?

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] All tests passing
- [ ] Build succeeds
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Prefer explicit types over `any`
- Use interfaces for public APIs
- Document public methods with JSDoc comments

### Code Style

- 2 spaces for indentation
- Single quotes for strings
- No semicolons (unless required)
- Trailing commas in multiline structures

### Testing

- Write tests for all new features
- Maintain test coverage
- Use descriptive test names
- Group related tests with `describe` blocks

Example:
```typescript
describe('SagaOrchestrator', () => {
  describe('execute()', () => {
    it('executes all steps in order', async () => {
      // test implementation
    });

    it('compensates on step failure', async () => {
      // test implementation
    });
  });
});
```

## Project Structure

```
saga-engine/
├── packages/
│   ├── core/           # @saga-engine/core
│   ├── redis/          # @saga-engine/redis (planned)
│   └── postgres/       # @saga-engine/postgres (planned)
├── examples/
│   └── basic-usage/
├── docs/
└── ...
```

### Adding a New Package

1. Create the package directory under `packages/`
2. Add `package.json` with proper naming (`@saga-engine/package-name`)
3. Add to `pnpm-workspace.yaml` if not using glob pattern
4. Add build scripts to root `turbo.json`

## Reporting Issues

### Bug Reports

Include:
- Saga Engine version
- Node.js version
- Minimal reproduction code
- Expected vs actual behavior
- Error messages/stack traces

### Feature Requests

Include:
- Use case description
- Proposed API (if applicable)
- Alternatives considered

## Questions?

- Open a [GitHub Discussion](https://github.com/saga-engine/saga-engine/discussions)
- Join our [Discord](https://discord.gg/saga-engine)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
