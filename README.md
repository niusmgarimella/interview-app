# Online Interview App (prototype)

TypeScript: Node.js/Express backend + React (Vite) frontend, built from the Technical Design Document v1.0.

## Run
```bash
cp .env.example .env        # set SESSION_SECRET, PAN_KEY, ADMIN_EMAIL/PASSWORD, (optional) GEMINI_API_KEY or ANTHROPIC_API_KEY
npm install                 # backend deps
npm start                   # backend (tsx) on http://localhost:3000   (npm run dev = auto-restart)
cd client && npm install && npm run dev    # React UI on http://localhost:5173
```
Type checks: `npm run typecheck` (server) and `cd client && npm run typecheck`.
Production-style: `cd client && npm run build` then `npm start` serves the built UI at http://localhost:3000.
Compile server to JS: `npm run build` then `npm run start:prod`.
Optional sample data: `npm run seed` creates a test candidate (`candidate@example.com` / `Candidate@123`), one sample interview and assigns it.
Sign in as the seeded admin → Candidates → create a candidate (temporary password shown once) → Interviews → create → Attempts → assign.
Without `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`, a MOCK AI provider is used so you can test the flow end to end.

## What is implemented
- Admin-created accounts, bcrypt hashes, rate-limited generic login errors, forced password change, no public signup/forgot-password
- Protected JSON repository (serialized writes, temp file + atomic rename, `.bak`), data in `./data` outside `public/`
- AI adapter (Claude via REST, schema validation, retries), questions + private metadata persisted before display
- Candidate API returns allow-listed fields only; future questions blocked; answers lock atomically and idempotently
- Server-side deadline, window-violation episodes (3rd accepted violation => TERMINATED, answers preserved)
- Evaluation: deterministic MCQ, AI rubric for CODING/SHORT_TEXT; admin review, re-evaluate, release (audited); results hidden until release
- PAN encrypted with AES-256-GCM, only last 4 stored in the clear, never sent to AI or logs

## NOT implemented (needs your decision / infrastructure)
- **Sandboxed code execution.** CODING answers are currently graded by AI rubric only. Never run candidate code in the Node process;
  add an isolated runner (e.g. Docker/gVisor, no network, CPU/memory/time limits) and call it from `server/evaluate.js`.
- CSRF tokens (cookies are `SameSite=Lax`; add tokens before production), HTTPS/reverse proxy, persistent session store, data-retention jobs.
- JSON storage is single-process only. Migrate to SQLite/PostgreSQL before real concurrency.
