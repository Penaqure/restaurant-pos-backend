const { printer: ThermalPrinter, types: PrinterTypes } = require("node-thermal-printer");
const logger = require("../utils/logger");

// Opt-in: most installs have no networked kitchen printer at all, and this
// must never become a hard dependency for placing an order. KITCHEN_PRINTER_IP
// is a single printer for the whole install, matching this app's existing
// "one Docker install = one shop" model (see README) -- a shop with
// multiple branches each needing their own printer is a real but separate
// follow-up (a per-branch printer IP on the Branch model), not built here.
const ENABLED = process.env.KITCHEN_PRINTER_ENABLED === "true";
const IP = process.env.KITCHEN_PRINTER_IP;
const PORT = process.env.KITCHEN_PRINTER_PORT || "9100";

function buildPrinter() {
  return new ThermalPrinter({
    // EPSON selects the ESC/POS command set -- the de facto standard
    // virtually every thermal kitchen/receipt printer speaks (Epson-badged
    // or not), unlike STAR/TANCA/DARUMA/BROTHER which are reserved for
    // those specific product lines.
    type: PrinterTypes.EPSON,
    interface: `tcp://${IP}:${PORT}`,
    removeSpecialCharacters: false,
    options: { timeout: 5000 },
  });
}

// Builds and sends one ticket. Never throws -- this is a side effect of
// placing/adding to an order, not a critical path, so a slow or offline
// printer must never fail (or even slow down) the request that triggered
// it. Call this after the triggering transaction has committed, without
// awaiting it from the request handler.
//
// `lineData` is the same shape orderPricingService.computeOrderLines()
// returns (itemNameSnapshot, variantNameSnapshot, quantity, notes,
// addonRows) -- whatever's being newly printed, not necessarily the
// order's full item list. For addItemsToOrder specifically, that's
// deliberate: the kitchen needs a ticket for what's freshly added, not a
// reprint of everything already in prep.
async function printKot({ order, vendor, branch, table, lineData, isAddition = false }) {
  if (!ENABLED) return;
  if (!IP) {
    logger.warn("kot_printer.not_configured");
    return;
  }

  let printer;
  try {
    printer = buildPrinter();
    const connected = await printer.isPrinterConnected();
    if (!connected) {
      logger.error("kot_printer.unreachable", { ip: IP, port: PORT, orderNumber: order.orderNumber });
      return;
    }

    printer.alignCenter();
    printer.setTextDoubleHeight();
    printer.bold(true);
    printer.println(isAddition ? "KOT - ADDED ITEMS" : "KITCHEN ORDER TICKET");
    printer.setTextNormal();
    printer.bold(false);
    printer.println(`${vendor.name}${branch ? ` - ${branch.name}` : ""}`);
    printer.drawLine();

    printer.alignLeft();
    printer.bold(true);
    printer.println(`Order #${order.orderNumber}`);
    printer.bold(false);
    printer.println(`${order.orderType.replace("_", " ")}${table ? ` - Table ${table.name}` : ""}`);
    printer.println(new Date().toLocaleString());
    if (order.orderType !== "dine_in" && (order.customerName || order.customerPhone)) {
      printer.println([order.customerName, order.customerPhone].filter(Boolean).join(" - "));
    }
    printer.drawLine();

    for (const line of lineData) {
      printer.bold(true);
      printer.setTextDoubleHeight();
      printer.println(
        `${line.quantity}x ${line.itemNameSnapshot}${line.variantNameSnapshot ? ` (${line.variantNameSnapshot})` : ""}`
      );
      printer.setTextNormal();
      printer.bold(false);
      if (line.notes) printer.println(`  Note: ${line.notes}`);
      if (line.addonRows?.length > 0) {
        printer.println(`  + ${line.addonRows.map((a) => `${a.nameSnapshot} x${a.quantity}`).join(", ")}`);
      }
    }

    printer.drawLine();
    printer.alignCenter();
    printer.println(`Printed ${new Date().toLocaleString()}`);
    printer.cut();

    await printer.execute();
    logger.info("kot_printer.printed", { orderId: order.id, orderNumber: order.orderNumber, isAddition });
  } catch (err) {
    logger.error("kot_printer.failed", { error: err.message, orderId: order.id, orderNumber: order.orderNumber });
  }
}

module.exports = { printKot };
