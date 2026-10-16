# Contributing to Dotcom Arcade

Dotcom Arcade is developed on a private forge and published to GitHub as a
read-only mirror, so issues and pull requests aren't accepted there. You're
welcome to fork it under the [GPL-3.0](LICENSE).

It's built on [flashpoint-web](https://github.com/darkraise/flashpoint-web).
Fixes to code the two still share may belong upstream.

## Development Setup

### Project Structure

```
backend/    # Express REST API + game content serving (:3100)
frontend/   # React + Vite application (:5173)
streaming/  # Session manager and streamer for games browsers can't run
docs/       # Documentation
```

### Option 1: Docker

```bash
# Configure environment
cp .env.example .env
# Edit .env - set FLASHPOINT_HOST_PATH and JWT_SECRET (required)

# Build and start
docker compose up -d --build

# View logs
docker compose logs -f
```

The app (UI and API) runs on `http://localhost:80`.

### Option 2: Manual Setup (Recommended for Development)

**Prerequisites:**

- Node.js 20+
- Flashpoint Archive installed locally

```bash
# Install dependencies
npm run install:all

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env - set FLASHPOINT_PATH to your Flashpoint installation

# Start development servers
npm run dev
```

Frontend runs on `http://localhost:5173`, backend on `http://localhost:3100`.

## Running Tests

```bash
# Run all tests
npm test

# Backend tests with coverage
cd backend && npm test -- --coverage

# Frontend tests
cd frontend && npm test
```

## Code Style

See [CLAUDE.md](CLAUDE.md) for detailed coding standards. Key points:

- **TypeScript:** No `any` types, use `unknown` or proper interfaces
- **Backend:** Wrap async handlers with `asyncHandler()`, static routes before
  parameterized
- **Frontend:** Use `@/` imports, all API calls through `lib/api.ts`, use theme
  tokens
- **General:** Validate inputs, handle errors properly, clean up resources

Run `npm run format` before committing. Commit messages follow
[Conventional Commits](https://www.conventionalcommits.org/).

## License

This project is licensed under [GPL-3.0](LICENSE). By contributing, you agree
that your contributions will be licensed under the same license.
