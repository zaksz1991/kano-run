REPLACE these files in repo root (same names):
  package.json
  vercel.json
  .gitignore

Then:
  git add package.json vercel.json .gitignore
  git commit -m "fix: Vercel build exit 126 — run vite via node"
  git push

In Vercel dashboard:
  Deployments → ... → Redeploy → CHECK "Clear cache and deploy"

Do NOT skip clear cache. Old node_modules/.bin/vite without +x is in the cache.
