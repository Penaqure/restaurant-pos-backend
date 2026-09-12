function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// A discount is eligible only while active, within its validity window, and
// at/above its minimum order amount -- checked against the order's own
// subtotal, not a post-discount figure.
function validateDiscount(discount, subtotal) {
  if (!discount || !discount.isActive) return "This discount code is not active";
  const now = new Date();
  if (discount.validFrom && now < new Date(discount.validFrom)) return "This discount is not yet valid";
  if (discount.validTo && now > new Date(discount.validTo)) return "This discount has expired";
  if (discount.usageLimit != null && discount.usageCount >= discount.usageLimit) {
    return "This discount has reached its usage limit";
  }
  if (subtotal < Number(discount.minOrderAmount)) {
    return `Order must be at least ₹${discount.minOrderAmount} to use this discount`;
  }
  return null;
}

// Computes subtotal -> discount -> tax -> round-off -> total for a bill,
// given an order with its items loaded (each item carries its own
// taxRatePercentSnapshot, frozen at order time). The discount is distributed
// proportionally across each tax-rate group so the tax breakdown stays
// accurate even when items sit at different rates.
function computeBill(order, discount) {
  const groups = new Map(); // ratePercent -> taxableAmount (pre-discount)
  for (const item of order.items) {
    const rate = Number(item.taxRatePercentSnapshot);
    const current = groups.get(rate) || 0;
    groups.set(rate, current + Number(item.lineTotal));
  }

  const subtotal = round2([...groups.values()].reduce((sum, v) => sum + v, 0));

  let discountAmount = 0;
  if (discount) {
    const error = validateDiscount(discount, subtotal);
    if (error) {
      const err = new Error(error);
      err.status = 400;
      throw err;
    }
    discountAmount =
      discount.type === "percentage"
        ? round2(subtotal * (Number(discount.value) / 100))
        : Math.min(round2(Number(discount.value)), subtotal);
  }

  const taxBreakdown = [];
  let taxAmount = 0;
  for (const [ratePercent, groupSubtotal] of groups.entries()) {
    const groupShare = subtotal > 0 ? groupSubtotal / subtotal : 0;
    const groupDiscount = round2(discountAmount * groupShare);
    const taxableAmount = round2(groupSubtotal - groupDiscount);
    const groupTax = round2(taxableAmount * (ratePercent / 100));
    taxAmount = round2(taxAmount + groupTax);
    taxBreakdown.push({ ratePercent, taxableAmount, taxAmount: groupTax });
  }

  const rawTotal = round2(subtotal - discountAmount + taxAmount);
  const roundedTotal = Math.round(rawTotal);
  const roundOffAmount = round2(roundedTotal - rawTotal);

  return {
    subtotal,
    discountAmount,
    taxBreakdown,
    taxAmount,
    roundOffAmount,
    totalAmount: roundedTotal,
  };
}

module.exports = { computeBill, validateDiscount, round2 };
