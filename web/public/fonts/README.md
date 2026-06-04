# Font assets (legacy `/fonts/` URLs)

The SPA loads typography through **`@fontsource/*` packages** imported in
`src/styles/index.css`. Vite bundles `.woff2` files into `/assets/` with
content hashes — this is the supported path for dev, Docker, and nginx
production.

You do **not** need to copy files into this directory for normal builds.

## Optional manual drops

If you maintain custom font binaries or need stable `/fonts/...` URLs (e.g.
external PDF tooling), you may still place files here:

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

`web/nginx.conf` serves `/fonts/` with `try_files $uri =404` (no SPA fallback).

## Production Docker

```bash
docker build -f web/Dockerfile -t mezan-web .
docker run --rm -p 8080:80 mezan-web
```

See `web/Dockerfile` and `web/nginx.conf`.
