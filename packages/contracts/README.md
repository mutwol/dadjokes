# @daddy-jokes/contracts

The API's OpenAPI spec (`openapi.json`) and a typed client generated from it.
Don't edit `src/schema.d.ts` by hand. After changing an API endpoint, run from the repo root:

```bash
pnpm contracts
```

That rebuilds the API, exports `openapi.json`, and regenerates the types. CI can run
`pnpm --filter @daddy-jokes/contracts check` to fail when they are out of date.

```ts
import { createApiClient, unwrap } from "@daddy-jokes/contracts";

const api = createApiClient({ baseUrl: "/api", getAccessToken: () => token });
const me = unwrap(await api.GET("/v1/me"));
```
