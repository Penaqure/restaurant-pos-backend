function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function money(n) {
  return Number(n).toFixed(2);
}

// Page sizing itself (format for A4/A5, an explicit measured width+height
// for the thermal sizes) is handled by pdfService/billController, which
// call puppeteer's own width/height options -- Chromium's print-to-PDF
// engine does not honor `@page { size: <width> auto }` despite it being
// valid Paged Media CSS, so a content-driven receipt height has to be
// measured in the browser and passed to page.pdf() explicitly instead.
// This preset only drives which layout mode and padding to render.
const SIZE_PRESETS = {
  a4: { mode: "invoice", baseFont: 13, padding: "16mm" },
  a5: { mode: "invoice", baseFont: 12, padding: "10mm" },
  letter: { mode: "invoice", baseFont: 13, padding: "16mm" },
  "thermal-80": { mode: "receipt", baseFont: 11, padding: "4mm 3mm" },
  "thermal-72": { mode: "receipt", baseFont: 10.5, padding: "3.5mm 2.5mm" },
  "thermal-58": { mode: "receipt", baseFont: 9.5, padding: "3mm 2mm" },
};

function billHtml({ bill, order, vendor, branch, logoDataUri, size = "a4", showGst = true, showLogo = true, footerNote }) {
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.a4;
  const isReceipt = preset.mode === "receipt";
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(vendor.brandColor) ? vendor.brandColor : "#5a3ff0";

  const itemRows = order.items
    .map((item) => {
      const name =
        escapeHtml(item.itemNameSnapshot) +
        (item.variantNameSnapshot ? ` (${escapeHtml(item.variantNameSnapshot)})` : "");
      const addons = item.addons.length
        ? `<div class="addons">+ ${item.addons.map((a) => `${escapeHtml(a.nameSnapshot)} x${a.quantity}`).join(", ")}</div>`
        : "";
      return isReceipt
        ? `
        <tr>
          <td colspan="2">${item.quantity} x ${name} @ ${money(item.unitPriceSnapshot)}${addons}</td>
        </tr>
        <tr class="line-total">
          <td></td>
          <td class="num">${money(item.lineTotal)}</td>
        </tr>`
        : `
        <tr>
          <td>${name}${addons}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${money(item.unitPriceSnapshot)}</td>
          <td class="num">${money(item.lineTotal)}</td>
        </tr>`;
    })
    .join("");

  // India's GST is conventionally shown split into CGST + SGST (each half
  // the combined rate) rather than one "GST" line; other countries just get
  // a plain tax line at the full rate.
  const taxRows = showGst
    ? bill.taxBreakdown
        .flatMap((t) => {
          if (vendor.country === "IN") {
            const halfRate = t.ratePercent / 2;
            const halfTax = t.taxAmount / 2;
            return [
              { label: `CGST ${halfRate}% on ${money(t.taxableAmount)}`, amount: halfTax },
              { label: `SGST ${halfRate}% on ${money(t.taxableAmount)}`, amount: halfTax },
            ];
          }
          return [{ label: `Tax ${t.ratePercent}% on ${money(t.taxableAmount)}`, amount: t.taxAmount }];
        })
        .map(
          (row) => `
        <tr>
          <td colspan="${isReceipt ? 1 : 3}">${row.label}</td>
          <td class="num">${money(row.amount)}</td>
        </tr>`
        )
        .join("")
    : "";

  const customerLine =
    order.orderType !== "dine_in" && (order.customerName || order.customerPhone)
      ? `<div class="muted">${[order.customerName, order.customerPhone].filter(Boolean).map(escapeHtml).join(" · ")}</div>`
      : "";

  const paymentBadge = {
    paid: "Paid",
    partial: `Partially paid · Balance ₹${money(bill.balanceDue)}`,
    unpaid: `Unpaid · ₹${money(bill.balanceDue)} due`,
    refunded: "Refunded",
  }[bill.paymentStatus];

  const logo = showLogo && logoDataUri ? `<img src="${logoDataUri}" class="logo" alt="" />` : "";
  const footer = escapeHtml(footerNote?.trim() || "Thank you for dining with us!");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: ${isReceipt ? "'Courier New', monospace" : "Helvetica, Arial, sans-serif"};
    font-size: ${preset.baseFont}px;
    color: #14141f;
    margin: 0;
    padding: ${preset.padding};
    ${isReceipt ? "width: 100%;" : ""}
  }
  .muted { color: #6b6f80; }
  table { width: 100%; border-collapse: collapse; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .addons { font-size: 0.85em; color: #6b6f80; }

  /* -- Invoice mode (A4 / A5) -- */
  .invoice .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 2px solid ${brandColor};
    padding-bottom: 12px;
    margin-bottom: 14px;
  }
  .invoice .brand { display: flex; align-items: center; gap: 12px; }
  .invoice .logo { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; }
  .invoice h1 { font-size: 1.4em; margin: 0; }
  .invoice .doc-title {
    text-align: right;
    color: ${brandColor};
    font-weight: bold;
    font-size: 1.1em;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .invoice .meta-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
    font-size: 0.95em;
  }
  .invoice thead th {
    text-align: left;
    border-bottom: 1px solid #d8dae3;
    padding: 6px 4px;
    font-size: 0.85em;
    color: #6b6f80;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .invoice tbody td { padding: 7px 4px; vertical-align: top; border-bottom: 1px solid #f0f1f5; }
  .invoice .totals { margin-top: 10px; max-width: 260px; margin-left: auto; }
  .invoice .totals td { padding: 3px 4px; border: none; }
  .invoice .totals .label { color: #6b6f80; }
  .invoice .grand { font-weight: bold; font-size: 1.2em; border-top: 2px solid ${brandColor}; padding-top: 6px !important; }
  .invoice .payment-status {
    display: inline-block;
    margin-top: 14px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.85em;
    font-weight: bold;
    background: ${bill.paymentStatus === "paid" ? "#dcfce7" : "#fef3c7"};
    color: ${bill.paymentStatus === "paid" ? "#166534" : "#92400e"};
  }
  .invoice .footer { margin-top: 24px; text-align: center; color: #9497a8; font-size: 0.85em; }

  /* -- Receipt mode (thermal 80mm / 58mm) -- */
  .receipt { text-align: center; }
  .receipt .logo { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; margin: 0 auto 4px; display: block; }
  .receipt h1 { font-size: 1.15em; margin: 0; }
  .receipt .divider { border-top: 1px dashed #999; margin: 6px 0; }
  .receipt .meta { text-align: left; font-size: 0.9em; margin: 6px 0; }
  .receipt table { margin-top: 4px; }
  .receipt thead { display: none; }
  .receipt tbody td { padding: 2px 0; text-align: left; }
  .receipt tr.line-total td { padding-top: 0; padding-bottom: 4px; border-bottom: 1px dotted #ccc; }
  .receipt .totals { margin-top: 6px; text-align: left; }
  .receipt .totals td { padding: 2px 0; border: none; }
  .receipt .totals .label { color: #444; }
  .receipt .grand { font-weight: bold; font-size: 1.1em; border-top: 1px dashed #333; padding-top: 4px !important; }
  .receipt .footer { margin-top: 12px; font-size: 0.85em; }
</style>
</head>
<body class="${preset.mode}">

  ${
    isReceipt
      ? `
  ${logo}
  <h1>${escapeHtml(vendor.name)}</h1>
  <div class="muted">${escapeHtml(branch.name)}</div>
  ${vendor.gstin ? `<div class="muted">GSTIN: ${escapeHtml(vendor.gstin)}</div>` : ""}
  <div class="divider"></div>
  <div class="meta">
    <div><strong>Bill #${escapeHtml(bill.billNumber)}</strong></div>
    <div class="muted">${new Date(bill.generatedAt).toLocaleString()}</div>
    <div class="muted">Order ${escapeHtml(order.orderNumber)} &middot; ${order.orderType.replace("_", " ")}${order.table ? ` &middot; Table ${escapeHtml(order.table.name)}` : ""}</div>
    ${customerLine}
  </div>
  <div class="divider"></div>`
      : `
  <div class="header">
    <div class="brand">
      ${logo}
      <div>
        <h1>${escapeHtml(vendor.name)}</h1>
        <div class="muted">${escapeHtml(branch.name)}${branch.address ? ` &middot; ${escapeHtml(branch.address)}` : ""}</div>
        ${vendor.gstin ? `<div class="muted">GSTIN: ${escapeHtml(vendor.gstin)}</div>` : ""}
      </div>
    </div>
    <div class="doc-title">Tax Invoice</div>
  </div>
  <div class="meta-row">
    <div>
      <div><strong>Bill #${escapeHtml(bill.billNumber)}</strong></div>
      <div class="muted">Order ${escapeHtml(order.orderNumber)} &middot; ${order.orderType.replace("_", " ")}${order.table ? ` &middot; Table ${escapeHtml(order.table.name)}` : ""}</div>
      ${customerLine}
    </div>
    <div class="muted" style="text-align:right">${new Date(bill.generatedAt).toLocaleString()}</div>
  </div>`
  }

  <table>
    ${isReceipt ? "" : `<thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>`}
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  ${isReceipt ? '<div class="divider"></div>' : ""}

  <table class="totals">
    <tr><td class="label">Subtotal</td>${isReceipt ? "" : "<td></td><td></td>"}<td class="num">${money(bill.subtotal)}</td></tr>
    ${
      Number(bill.discountAmount) > 0
        ? `<tr><td class="label">Discount${bill.discount ? ` (${escapeHtml(bill.discount.code)})` : ""}</td>${isReceipt ? "" : "<td></td><td></td>"}<td class="num">-${money(bill.discountAmount)}</td></tr>`
        : ""
    }
    ${taxRows}
    ${
      Number(bill.roundOffAmount) !== 0
        ? `<tr><td class="label">Round off</td>${isReceipt ? "" : "<td></td><td></td>"}<td class="num">${money(bill.roundOffAmount)}</td></tr>`
        : ""
    }
    <tr class="grand"><td>Total</td>${isReceipt ? "" : "<td></td><td></td>"}<td class="num">${money(bill.totalAmount)}</td></tr>
  </table>

  ${isReceipt ? `<div class="divider"></div><div>${paymentBadge}</div>` : `<div class="payment-status">${paymentBadge}</div>`}

  <div class="footer">${footer}</div>
</body>
</html>`;
}

module.exports = { billHtml, SIZE_PRESETS };
