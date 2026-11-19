// Whether this build may be indexed by search engines. Default: NO. Only the production
// build sets PUBLIC_INDEXABLE=true (Workers Builds → Build variables, see README); previews
// of other branches stay noindex even then (isIndexableBuild checks WORKERS_CI_BRANCH).
// Read both import.meta.env (a local .env file) and process.env (real CI variables).
import { isIndexableBuild } from "./seo";

export const INDEXABLE: boolean = isIndexableBuild({
  PUBLIC_INDEXABLE: import.meta.env.PUBLIC_INDEXABLE ?? process.env.PUBLIC_INDEXABLE,
  WORKERS_CI_BRANCH: process.env.WORKERS_CI_BRANCH,
});
