// RTK Query endpoints generated from the API's OpenAPI document (packages/contracts/openapi.json).
// Regenerate after changing the API:  pnpm contracts  (root), then  pnpm --filter web api:generate
//
// The generated file is never edited by hand. Cache tags, optimistic updates and response
// transforms live in src/api/rtk/endpoints.ts, which enhances the generated endpoints.
/** @type {import('@rtk-query/codegen-openapi').ConfigFile} */
module.exports = {
  schemaFile: "../../packages/contracts/openapi.json",
  apiFile: "./src/api/rtk/baseApi.ts",
  apiImport: "baseApi",
  outputFile: "./src/api/rtk/generated.ts",
  exportName: "generatedApi",
  hooks: { queries: true, lazyQueries: true, mutations: true },
  // Tags are set per endpoint in endpoints.ts (entity + id), not per OpenAPI tag.
  tag: false,
  // Sign-in, refresh and logout stay on the fetch client: they manage the session the
  // RTK base query itself depends on.
  filterEndpoints: (operationId) => !["refreshSession", "logout"].includes(operationId),
  // Keep generated arg types flat and readable.
  flattenArg: false,
  useEnumType: false,
};
