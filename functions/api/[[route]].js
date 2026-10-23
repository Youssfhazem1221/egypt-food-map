// Cloudflare Pages Functions entry: every /api/* request goes to the API handler.
// Everything else is a static file from public/.
import api from '../../src/worker.js';

export const onRequest = (context) => api.fetch(context.request, context.env);
