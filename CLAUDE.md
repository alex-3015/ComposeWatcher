# CLAUDE.md

Compose Watcher v3 uses the same repository workflow and architecture documented in `AGENTS.md`. Read that file before making changes.

Key invariants:

- Run root npm-workspace commands and keep a single root `package-lock.json`.
- Define public schemas and static types once in `contracts/src/index.ts` with TypeBox 1.x.
- Keep the list payload lean; release notes and breaking-change objects belong only to the detail endpoint.
- Lists never wait for GitHub. Global refreshes coalesce, repository changes are targeted, and mapping revisions must guard stale runs.
- Use async atomic JSON stores and version incompatible caches.
- Production is one Fastify process on port 8080 serving API, SPA, and icons; do not reintroduce nginx or shell supervision.
- Preserve the accessible, responsive detail drawer and its lazy Markdown/sanitizer chunk.
- Maintain 80% coverage, the 150 kB list-payload budget, and the 70 kB-gzip initial JavaScript budget.

Primary commands:

```bash
npm ci
npm run check
npm run test:e2e
docker compose up --build
```
