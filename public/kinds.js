// Food types. The site's chips, the forms, the API and the review tool all use this list.
export const KINDS = [
  ['koshary', 'كشري'],
  ['ful', 'فول وطعمية'],
  ['liver', 'كبدة وسجق'],
  ['shawarma', 'شاورما'],
  ['hawawshi', 'حواوشي'],
  ['feteer', 'فطير'],
  ['fish', 'سمك'],
  ['sweets', 'حلويات'],
  ['other', 'تاني'],
];

export const KIND_LABEL = Object.fromEntries(KINDS);

export function isKind(value) {
  return typeof value === 'string' && Object.hasOwn(KIND_LABEL, value);
}
