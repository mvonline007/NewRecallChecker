# Rappel Conso RSS Viewer (Vercel / Node.js)

## Run locally
```bash
npm install
npm run dev
```

## Deploy to Vercel
- Upload this folder to GitHub, or upload the ZIP directly in Vercel.
- Framework: Next.js (auto).

## Notes
- RSS parsing runs server-side in `app/api/rss`.
- Distributor scraping runs server-side in `app/api/detail`.
- Embedded fiche uses server-side HTML proxy `app/api/proxy`.
