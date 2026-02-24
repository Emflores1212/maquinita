# Maquinita Operator Dashboard

Next.js 14 App Router dashboard for Maquinita operators, with Supabase Auth and PostgreSQL (RLS) foundations.

## Tech

- Next.js 14 + TypeScript
- Tailwind CSS v4
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- Recharts + Lucide + Framer Motion

## Scripts

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - lint with Next.js ESLint config
- `npm run supabase:types` - regenerate Supabase database types

## Environment

Copy values into `.env.local` (see `.env.local.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_ID`
- Stripe, Resend, Google Maps, Twilio, and VAPID keys

## Supabase SQL Migrations

Located in `supabase/migrations`:

- `001_schema.sql` - core schema
- `002_rls.sql` - row-level security and policies
- `003_profile_trigger.sql` - auto profile creation on auth user insert
- `004_storage.sql` - storage buckets and object policies
