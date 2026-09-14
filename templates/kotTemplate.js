function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// KOTs are always receipt-format (printed on the same thermal printer as
// bills) -- there's no A4/invoice mode like billTemplate.js has, so this
// preset only drives width-dependent sizing, not a layout switch.
const SIZE_PRESETS = {
  "thermal-80": { baseFont: 13, padding: "4mm 3mm" },
  "thermal-72": { baseFont: 12.5, padding: "3.5mm 2.5mm" },
  "thermal-58": { baseFont: 11, padding: "3mm 2mm" },
};

// A Kitchen Order Ticket is read fast, from a distance, mid-service -- item
// name/qty are set noticeably larger and bolder than a customer receipt
// would use. Unlike a bill, it never shows money: kitchen staff cook off
// the item list, not the price list.
function kotHtml({ order, vendor, branch, size = "thermal-80" }) {
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS["thermal-80"];

  const itemRows = order.items
    .map((item) => {
      const name =
        escapeHtml(item.itemNameSnapshot) +
        (item.variantNameSnapshot ? ` (${escapeHtml(item.variantNameSnapshot)})` : "");
      const addons = item.addons.length
        ? `<div class="addons">+ ${item.addons.map((a) => `${escapeHtml(a.nameSnapshot)} x${a.quantity}`).join(", ")}</div>`
        : "";
      const notes = item.notes ? `<div class="notes">Note: ${escapeHtml(item.notes)}</div>` : "";
      return `
        <div class="item">
          <div class="item-line"><span class="qty">${item.quantity}x</span> <span class="name">${name}</span></div>
          ${notes}
          ${addons}
        </div>`;
    })
    .join("");

  const customerLine =
    order.orderType !== "dine_in" && (order.customerName || order.customerPhone)
      ? `<div class="muted">${[order.customerName, order.customerPhone].filter(Boolean).map(escapeHtml).join(" · ")}</div>`
      : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Courier New', monospace;
    font-size: ${preset.baseFont}px;
    color: #14141f;
    margin: 0;
    padding: ${preset.padding};
    width: 100%;
    text-align: center;
  }
  .muted { color: #6b6f80; }
  .divider { border-top: 1px dashed #333; margin: 6px 0; }
  h1 { font-size: 1.2em; margin: 0; letter-spacing: 0.05em; }
  .subtitle { font-size: 0.95em; margin-top: 2px; }
  .meta { text-align: left; font-size: 0.95em; margin: 8px 0; }
  .meta .order-number { font-weight: bold; font-size: 1.1em; }

  .items { text-align: left; }
  .item { margin-bottom: 8px; }
  .item-line { display: flex; gap: 8px; align-items: baseline; }
  .qty { font-weight: bold; font-size: 1.15em; white-space: nowrap; }
  .name { font-weight: bold; font-size: 1.05em; flex: 1; }
  .notes { padding-left: 1.6em; font-size: 0.9em; font-style: italic; color: #444; }
  .addons { padding-left: 1.6em; font-size: 0.85em; color: #6b6f80; }

  .footer { margin-top: 10px; font-size: 0.8em; color: #9497a8; }
</style>
</head>
<body>
  <h1>KITCHEN ORDER TICKET</h1>
  <div class="subtitle">${escapeHtml(vendor.name)}${branch ? ` &middot; ${escapeHtml(branch.name)}` : ""}</div>
  <div class="divider"></div>
  <div class="meta">
    <div class="order-number">Order #${escapeHtml(order.orderNumber)}</div>
    <div class="muted">${order.orderType.replace("_", " ")}${order.table ? ` &middot; Table ${escapeHtml(order.table.name)}` : ""}</div>
    <div class="muted">${new Date(order.placedAt).toLocaleString()}</div>
    ${customerLine}
  </div>
  <div class="divider"></div>

  <div class="items">
    ${itemRows}
  </div>

  <div class="divider"></div>
  <div class="footer">Printed ${new Date().toLocaleString()}</div>
</body>
</html>`;
}

module.exports = { kotHtml, SIZE_PRESETS };
