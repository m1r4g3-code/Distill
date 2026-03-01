# Distill Frontend

The frontend for the Distill web extraction API — built with Next.js 15, TypeScript, and Tailwind CSS v4.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Architecture

```
app/
  (marketing)/     → Landing page (/)
  (auth)/          → Login + Signup (/login, /signup)
  (dashboard)/     → All dashboard pages (/dashboard/*)
components/
  shared/          → Reusable components (Logo, GlassCard, CodeBlock, etc.)
  layout/          → Layout components (Sidebar, TopNav, BottomNav)
lib/
  api-client.ts    → API functions with MOCK_MODE flag
  constants.ts     → All mock data
  store.ts         → Zustand state management
  utils.ts         → Utility functions
types/
  index.ts         → All types matching backend Pydantic schemas
```

## Mock Mode

All API calls return realistic mock data by default. To connect to the backend:

1. Set `NEXT_PUBLIC_API_URL` in `.env.local`
2. Open `lib/api-client.ts` and flip `MOCK_MODE = false`

## Design System

- **Fonts**: Geist (sans) + Geist Mono (mono)
- **Theme**: Light + Dark mode via `next-themes`
- **Background**: Dot grid with radial fade
- **Cards**: Glassmorphism with backdrop blur
- **Buttons**: Neumorphic primary, ghost secondary
- **Colors**: All CSS custom properties in `globals.css`

## Stack

- [Next.js 15](https://nextjs.org) — App Router
- [TypeScript](https://typescriptlang.org) — Type safety
- [Tailwind CSS v4](https://tailwindcss.com) — Styling
- [Framer Motion](https://framer.com/motion) — Animations
- [Zustand](https://zustand-demo.pmnd.rs) — State management
- [Recharts](https://recharts.org) — Charts
- [Lucide React](https://lucide.dev) — Icons
