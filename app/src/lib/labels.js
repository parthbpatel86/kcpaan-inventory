// Bilingual labels: English + Gujarati, shown side by side.
//
// Parth's rule: no language switcher. Rely on photos, icons and colour where
// possible; where a word is genuinely unavoidable, show the Gujarati word next
// to the English one so non-English-reading staff can still work the counter.
// Keep this list SHORT — every extra word is more to read during a rush.
export const L = {
  cash: { en: 'CASH', gu: 'રોકડ' },
  card: { en: 'CARD', gu: 'કાર્ડ' },
  shop: { en: 'SHOP', gu: 'દુકાન' },
  employee: { en: 'EMPLOYEE', gu: 'કર્મચારી' },
  total: { en: 'Total', gu: 'કુલ' },
  discount: { en: 'Discount', gu: 'ડિસ્કાઉન્ટ' },
  search: { en: 'Search', gu: 'શોધો' },
  cancel: { en: 'Cancel', gu: 'રદ કરો' },
  done: { en: 'Done', gu: 'થઈ ગયું' },
  review: { en: 'Review order', gu: 'ઓર્ડર તપાસો' },
  items: { en: 'items', gu: 'વસ્તુઓ' },
  outOfStock: { en: 'Out of stock', gu: 'સ્ટોક નથી' },
  punchIn: { en: 'IN', gu: 'અંદર' },
  punchOut: { en: 'OUT', gu: 'બહાર' },
  manager: { en: 'Manager', gu: 'મેનેજર' },
  scanFace: { en: 'Scan face', gu: 'ચહેરો સ્કેન' },
  usePin: { en: 'Use PIN', gu: 'પિન વાપરો' },
  lookAtCamera: { en: 'Look at the camera', gu: 'કેમેરા સામે જુઓ' },
  notYou: { en: 'Not you?', gu: 'તમે નથી?' },
  tryAgain: { en: 'Try again', gu: 'ફરી પ્રયત્ન' },
};

// "CASH / રોકડ" — one string, used where space allows.
export function both(key) {
  const e = L[key];
  return e ? `${e.en} / ${e.gu}` : key;
}
