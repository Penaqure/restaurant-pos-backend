// A small fixed map rather than Intl.NumberFormat: that needs a locale, not
// just an ISO 4217 code, and Vendor only stores the currency code -- not a
// locale. Falls back to the code itself (e.g. "AUD 10.00") for anything not
// explicitly mapped, so an unmapped currency still prints something
// unambiguous rather than silently defaulting to the wrong symbol.
const CURRENCY_SYMBOLS = {
  INR: "₹",
  USD: "$",
  GBP: "£",
  EUR: "€",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  AED: "د.إ",
  SAR: "﷼",
  NPR: "₨",
  LKR: "₨",
  BDT: "৳",
  PKR: "₨",
  JPY: "¥",
  CNY: "¥",
  ZAR: "R",
  MYR: "RM",
  THB: "฿",
  IDR: "Rp",
  PHP: "₱",
  NZD: "NZ$",
  CHF: "CHF ",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
};

function getCurrencySymbol(currencyCode) {
  const code = String(currencyCode || "INR").toUpperCase();
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

module.exports = { getCurrencySymbol };
