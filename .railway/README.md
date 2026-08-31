# Railway project

Production topology for Academia Espronceda. The source of truth is
`railway.ts`. Apply it from a machine logged into Railway after filling
`preserve()` secrets in the dashboard.

```bash
npm install railway
railway link
railway config plan
railway config apply
```

Do not put tokens or the public domain in this folder. See
[Plataforma de despliegue](../docs/08-plataforma-despliegue.md).
