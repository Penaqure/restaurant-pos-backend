const { QueryTypes } = require("sequelize");
const { sequelize, Vendor } = require("../models");
const { getCurrencySymbol } = require("../utils/currency");
const { ACTIVE_ORDER_STATUSES } = require("../config/constants");

// A fixed, keyword-matched Q&A engine -- not an LLM. Every answer comes
// straight from this vendor's own data via a scoped SQL query; there is
// nothing here that calls out to the internet or guesses at an answer.
// Matching is deliberately simple (first intent, in priority order, whose
// keyword list appears as a substring of the question) rather than true
// NLU -- it's tuned to always resolve the preset buttons correctly, and is
// a best-effort match for typed free text. Unmatched text returns the list
// of things it can answer instead of guessing wrong.
//
// Owner/manager only -- enforced one level up, at the route (see
// chatbotRoutes.js), the same way reportRoutes.js gates /reports. Every
// question here surfaces business figures (sales, refunds, outstanding
// balances) an owner wouldn't want front-of-house staff pulling up, so
// there's no per-question role split the way the report page doesn't have
// one either.

function rangeClause(column, range) {
  switch (range) {
    case "yesterday":
      return `DATE(${column} AT TIME ZONE :timeZone) = DATE(NOW() AT TIME ZONE :timeZone) - INTERVAL '1 day'`;
    case "week":
      return `${column} AT TIME ZONE :timeZone >= date_trunc('week', NOW() AT TIME ZONE :timeZone)`;
    case "month":
      return `${column} AT TIME ZONE :timeZone >= date_trunc('month', NOW() AT TIME ZONE :timeZone)`;
    case "today":
    default:
      return `DATE(${column} AT TIME ZONE :timeZone) = DATE(NOW() AT TIME ZONE :timeZone)`;
  }
}

const RANGE_LABELS = { today: "today", yesterday: "yesterday", week: "this week", month: "this month" };

function parseRange(text) {
  if (/\byesterday\b/.test(text)) return "yesterday";
  if (/\bweek\b/.test(text)) return "week";
  if (/\bmonth\b/.test(text)) return "month";
  return "today";
}

async function salesHandler({ vendorId, branchId, timeZone, currency, text }) {
  const range = parseRange(text);
  const [row] = await sequelize.query(
    `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0) AS sales
     FROM bills
     WHERE vendor_id = :vendorId
       AND status != 'void'
       AND (:branchId::uuid IS NULL OR branch_id = :branchId::uuid)
       AND ${rangeClause("generated_at", range)}`,
    { replacements: { vendorId, branchId, timeZone }, type: QueryTypes.SELECT }
  );
  const symbol = getCurrencySymbol(currency);
  const label = RANGE_LABELS[range];
  if (Number(row.orders) === 0) {
    return `No bills have been generated ${label} yet.`;
  }
  return `${label[0].toUpperCase()}${label.slice(1)}: ${row.orders} bill(s) totaling ${symbol}${Number(row.sales).toFixed(2)}.`;
}

async function ordersStatusHandler({ vendorId, branchId }) {
  const rows = await sequelize.query(
    `SELECT status, COUNT(*)::int AS count
     FROM orders
     WHERE vendor_id = :vendorId
       AND status IN (:statuses)
       AND (:branchId::uuid IS NULL OR branch_id = :branchId::uuid)
     GROUP BY status`,
    { replacements: { vendorId, branchId, statuses: ACTIVE_ORDER_STATUSES }, type: QueryTypes.SELECT }
  );
  const counts = Object.fromEntries(ACTIVE_ORDER_STATUSES.map((s) => [s, 0]));
  rows.forEach((r) => (counts[r.status] = Number(r.count)));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return "No orders are currently in progress.";
  const parts = ACTIVE_ORDER_STATUSES.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${s}`);
  return `${total} order(s) in progress right now: ${parts.join(", ")}.`;
}

async function pendingBillsHandler({ vendorId, branchId, currency }) {
  const [row] = await sequelize.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(balance_due), 0) AS total
     FROM bills
     WHERE vendor_id = :vendorId
       AND status != 'void'
       AND payment_status IN ('unpaid', 'partial')
       AND (:branchId::uuid IS NULL OR branch_id = :branchId::uuid)`,
    { replacements: { vendorId, branchId }, type: QueryTypes.SELECT }
  );
  if (Number(row.count) === 0) return "There are no unpaid or partially paid bills right now.";
  const symbol = getCurrencySymbol(currency);
  return `${row.count} bill(s) are unpaid or partially paid, totaling ${symbol}${Number(row.total).toFixed(2)} outstanding.`;
}

async function tableStatusHandler({ vendorId, branchId }) {
  const rows = await sequelize.query(
    `SELECT status, COUNT(*)::int AS count
     FROM restaurant_tables
     WHERE vendor_id = :vendorId
       AND (:branchId::uuid IS NULL OR branch_id = :branchId::uuid)
     GROUP BY status`,
    { replacements: { vendorId, branchId }, type: QueryTypes.SELECT }
  );
  if (rows.length === 0) return "No tables have been set up yet.";
  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
  const parts = rows.map((r) => `${r.count} ${r.status}`);
  return `${total} table(s) total: ${parts.join(", ")}.`;
}

async function topItemHandler({ vendorId, branchId, timeZone, text }) {
  const range = parseRange(text);
  const rows = await sequelize.query(
    `SELECT oi.item_name_snapshot AS name, SUM(oi.quantity)::int AS qty
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.vendor_id = :vendorId
       AND o.status != 'cancelled'
       AND (:branchId::uuid IS NULL OR o.branch_id = :branchId::uuid)
       AND ${rangeClause("o.placed_at", range)}
     GROUP BY oi.item_name_snapshot
     ORDER BY qty DESC
     LIMIT 5`,
    { replacements: { vendorId, branchId, timeZone }, type: QueryTypes.SELECT }
  );
  const label = RANGE_LABELS[range];
  if (rows.length === 0) return `No items have been ordered ${label} yet.`;
  const list = rows.map((r, i) => `${i + 1}. ${r.name} — ${r.qty} sold`).join("\n");
  return `Top sellers ${label}:\n${list}`;
}

async function refundsHandler({ vendorId, timeZone, currency, text }) {
  const range = parseRange(text);
  // payments has no branch_id column (see reportController) -- vendor-wide.
  const [row] = await sequelize.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
     FROM payments
     WHERE vendor_id = :vendorId
       AND type = 'refund'
       AND status = 'recorded'
       AND ${rangeClause("paid_at", range)}`,
    { replacements: { vendorId, timeZone }, type: QueryTypes.SELECT }
  );
  const label = RANGE_LABELS[range];
  if (Number(row.count) === 0) return `No refunds were issued ${label}.`;
  const symbol = getCurrencySymbol(currency);
  return `${row.count} refund(s) issued ${label}, totaling ${symbol}${Number(row.total).toFixed(2)}.`;
}

// Priority order matters: checked top-to-bottom, first keyword hit wins.
// More specific phrasing (e.g. "top seller") is listed before the more
// generic intents it could otherwise be swallowed by (e.g. "sales").
const INTENTS = [
  {
    id: "top_item",
    label: "Top seller today",
    category: "Menu",
    keywords: ["top seller", "top sellers", "best seller", "best selling", "most ordered", "popular item", "top item"],
    handler: topItemHandler,
  },
  {
    id: "refunds",
    label: "Refunds today",
    category: "Payments",
    keywords: ["refund"],
    handler: refundsHandler,
  },
  {
    id: "pending_bills",
    label: "Pending bills",
    category: "Bills",
    keywords: ["bill", "unpaid", "outstanding", "balance due"],
    handler: pendingBillsHandler,
  },
  {
    id: "table_status",
    label: "Table status",
    category: "Tables",
    keywords: ["table"],
    handler: tableStatusHandler,
  },
  {
    id: "sales",
    label: "Today's sales",
    category: "Sales",
    keywords: ["sale", "sales", "revenue", "earning", "income", "collection", "turnover", "sold", "sell"],
    handler: salesHandler,
  },
  {
    id: "sales_week",
    label: "This week's sales",
    category: "Sales",
    // Not matched directly (shares "sales"'s keywords/handler) -- this entry
    // only exists to give the preset-question list a second button; its
    // own label text ("this week's sales") already matches the `sales`
    // intent's keywords above when sent as free text.
    presetOnly: true,
    keywords: [],
    handler: salesHandler,
  },
  {
    id: "orders_status",
    label: "Orders in progress",
    category: "Orders",
    keywords: ["order"],
    handler: ordersStatusHandler,
  },
];

function listQuestions() {
  return INTENTS.map((i) => ({ label: i.label, category: i.category }));
}

function matchIntent(text) {
  const normalized = text.toLowerCase();
  return INTENTS.find((intent) => !intent.presetOnly && intent.keywords.some((k) => normalized.includes(k)));
}

async function answerQuestion({ text, vendorId, branchId }) {
  const intent = matchIntent(text);
  if (!intent) {
    const options = listQuestions()
      .map((q) => q.label)
      .join(", ");
    return `I can only answer a fixed set of questions about this restaurant's data. Try one of: ${options}.`;
  }

  const vendor = await Vendor.findByPk(vendorId);
  const timeZone = vendor?.timezone || "UTC";
  return intent.handler({ vendorId, branchId, timeZone, currency: vendor?.currency, text });
}

module.exports = { listQuestions, answerQuestion };
