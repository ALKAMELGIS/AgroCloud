About AgroCloud

AgroCloud is a smart agriculture platform that combines AI, satellite imagery, and geospatial technology to help farmers and agricultural organizations monitor and understand their fields.

AgroCloud is designed to transform satellite data into practical agricultural information, making crop monitoring faster, more scalable, and easier to use.

## For developers

```bash
npm install
npm run dev          # frontend http://localhost:5180/AgroCloud/  +  API http://localhost:3011
npm run typecheck
npm test             # frontend (Vitest) + backend (node --test)
npm run test:e2e     # Playwright on desktop, tablet and mobile (runs against a production build)
```

- [ARCHITECTURE.md](ARCHITECTURE.md): repository tree, layer rules, module map, performance rules
- [design-system/agrocloud/IMPLEMENTATION.md](design-system/agrocloud/IMPLEMENTATION.md): design tokens and UI rules
- [core/docs/DEPLOYMENT.md](core/docs/DEPLOYMENT.md) · [core/docs/AUTHENTICATION.md](core/docs/AUTHENTICATION.md) · [SECURITY.md](SECURITY.md)
