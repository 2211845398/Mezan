# Self-hosted font assets

The SPA references three font families in `src/styles/index.css`; the browser
loads them from `/fonts/<family>/...`. Drop the actual `.woff2` files into the
layout below (filenames are fixed — update the `@font-face` rules if you
change them):

```
public/fonts/
├── tajawal/
│   ├── tajawal-400.woff2
│   ├── tajawal-500.woff2
│   └── tajawal-700.woff2
├── ibm-plex-arabic/
│   ├── ibm-plex-arabic-400.woff2
│   ├── ibm-plex-arabic-500.woff2
│   └── ibm-plex-arabic-700.woff2
└── inter/
    └── inter-var.woff2
```

Sources (all permissively licensed):

- **Tajawal** — Google Fonts (OFL 1.1). Convert the TTFs to `woff2` once at
  repo setup time; do NOT fetch from the Google Fonts CDN at runtime (privacy
  + offline rule, see `WEB_FRONTEND_PLAN.md` §6.5).
- **IBM Plex Sans Arabic** — GitHub (OFL 1.1).
- **Inter** — GitHub releases — variable axis `.woff2`.

While these files are absent, the browser falls back to the `system-ui` stack
defined by the `@font-face` `local(...)` hints; Vite will warn on build about
unresolved URLs, which is expected until real font files land.
