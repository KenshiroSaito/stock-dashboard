# Stock Dashboard

A full-stack stock dashboard with portfolio tracking, built as a learning project to practice modern web development.

## Tech Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS + Recharts
- **Backend**: Hono + TypeScript
- **Database**: PostgreSQL + Prisma
- **Authentication**: Google OAuth via Auth.js
- **Stock Data**: Alpha Vantage API
- **Monorepo**: pnpm workspaces + Turborepo
- **Deployment**: Vercel (web) + Render (api)

## Project Structure

\`\`\`
stock-dashboard/
├── apps/
│   ├── web/        # Next.js frontend (port 3000)
│   └── api/        # Hono backend (port 8080)
├── packages/       # Shared packages (planned)
└── docker-compose.yml  # PostgreSQL setup (planned)
\`\`\`

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 11+
- Docker Desktop (for PostgreSQL, coming soon)

### Setup

\`\`\`bash
# Install dependencies
pnpm install

# Run both dev servers
pnpm dev
\`\`\`

- Web: http://localhost:3000
- API: http://localhost:8080

### Available Scripts

\`\`\`bash
pnpm dev          # Run all apps in dev mode
pnpm build        # Build all apps
pnpm lint         # Lint all apps
pnpm typecheck    # Type check all apps
\`\`\`

## Development Status

🚧 **In progress** — currently setting up infrastructure (Phase 0)

### Roadmap

- [x] Monorepo setup (pnpm + Turborepo)
- [x] Next.js + Hono scaffolding
- [ ] PostgreSQL with Docker
- [ ] Prisma schema and migrations
- [ ] Phase 1: Stock price display
- [ ] Phase 2: Charts and comparison
- [ ] Phase 3: Authentication and portfolio
- [ ] Deployment

## License

MIT