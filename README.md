# Biodiversity Hub

A species catalog web app with an LLM-powered species chatbot. Next.js 14 (App Router) and TypeScript on the front end, Supabase (Postgres, magic-link auth) on the back end, Claude via the Anthropic SDK for the chatbot.

I built this for the fall 2026 engineering comp of Harvard Tech for Social Good (T4SG). T4SG gives applicants a starter app (species list, auth, add-species dialog, and empty stubs for the chatbot) and asks them to build features on top of it. The starter is the club's; the three features below are mine (commits from Sep 13–15, 2026).

## What I built

### Species chatbot
`app/api/chat/route.ts`, `lib/services/species-chat.ts`, `app/species-chatbot/page.tsx`

- `POST /api/chat` validates the request body with Zod (1–1000 characters, trimmed) and returns 400 on bad JSON or invalid input.
- The Anthropic call lives in a `server-only` service, so the API key never reaches the browser.
- The system prompt scopes the model to animals and species, declines anything else in one sentence, and tells the model to treat every user message as a question rather than as instructions — a basic prompt-injection guard.
- Typed error handling: a `SpeciesChatError` with specific messages for rate limits, refusals, and empty responses. The route maps those to 502 and anything unexpected to 500, so the UI always gets a readable message.
- Chat page with a message log, loading state, submit disabled while a request is in flight, and Markdown rendering for model replies.

### Species detail and edit flow
`app/species/species-details-dialog.tsx`, `app/species/species-card.tsx`

- Each card opens a detail dialog. The Edit button only renders for the species' author.
- Population input is validated before the write (blank means unknown, not 0; otherwise a whole number of 0 or more).
- The edit is applied to the UI immediately and rolled back if the write fails. The update uses `.select()` so a "successful" write that touched 0 rows (what Supabase returns when row-level security blocks it) is caught instead of silently showing stale data as saved.

### Comments
`supabase/comments.sql`, `lib/schema.ts`, `app/species/species-details-dialog.tsx`

- New `comments` table with foreign keys to `species` and `profiles`; TypeScript types regenerated with `npm run types`.
- Comments are fetched when a dialog opens, not for every card on the page.
- Posting adds the comment to the list immediately; delete is owner-only in the UI and enforced by row-level security in the database.

## Stack

Next.js 14 (App Router), TypeScript, Supabase (PostgreSQL, Auth), Tailwind CSS with shadcn/ui, Zod, Anthropic SDK, react-markdown.

## Known limits

- The chatbot is single-turn: each request sends only the current message, no conversation history.
- No streaming; a reply renders once it's complete.
- No automated tests yet.

## Running it locally

Follow [SETUP.md](SETUP.md) (T4SG's original setup guide: create a Supabase project, fill in `.env`, run `setup.sql` and `seed.sql`, then `npm run dev`). Then run `supabase/comments.sql` in the Supabase SQL editor and add `ANTHROPIC_API_KEY` to `.env` for the chatbot.
