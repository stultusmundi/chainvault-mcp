import { ApiProxy } from '../../proxy/api-proxy.js';

/**
 * One proxy shared by every tool that talks to an external API.
 *
 * Rate limits and usage counters are scoped per agent and service inside the
 * proxy, so sharing the instance is what makes those budgets meaningful: a
 * per-tool proxy would hand an agent a fresh allowance for each tool it called.
 */
export const apiProxy = new ApiProxy();
