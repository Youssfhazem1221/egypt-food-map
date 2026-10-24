// /spot/<id>: one page per spot (see src/spot-page.js).
import { spotPage } from '../../src/spot-page.js';

export const onRequestGet = (context) => spotPage(context.request, context.env, context.params.id);
