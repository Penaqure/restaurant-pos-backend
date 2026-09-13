const ROLES = {
  SUPER_ADMIN: "super_admin",
  OWNER: "owner",
  MANAGER: "manager",
  CASHIER: "cashier",
  WAITER: "waiter",
  KITCHEN: "kitchen",
};

// Default permission set seeded for every new vendor.
const VENDOR_ROLE_DEFAULTS = [
  { name: ROLES.OWNER, permissions: ["*"] },
  {
    name: ROLES.MANAGER,
    permissions: [
      "menu:manage",
      "orders:manage",
      "bills:manage",
      "payments:manage",
      "reports:view",
    ],
  },
  {
    name: ROLES.CASHIER,
    permissions: ["orders:manage", "bills:manage", "payments:manage"],
  },
  { name: ROLES.WAITER, permissions: ["orders:manage"] },
  // Kitchen staff only need to see incoming orders (table-wise) and move
  // them through the prep pipeline -- no billing, menu, or table management.
  { name: ROLES.KITCHEN, permissions: ["orders:view", "orders:status"] },
];

const ORDER_STATUSES = [
  "placed",
  "preparing",
  "ready",
  "served",
  "completed",
  "cancelled",
];

const ORDER_STATUS_TRANSITIONS = {
  placed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served", "cancelled"],
  served: ["completed"],
  completed: [],
  cancelled: [],
};

const ORDER_TYPES = ["dine_in", "takeaway", "delivery"];

const PAYMENT_METHODS = ["cash", "card", "upi", "wallet", "other"];

// A table carrying an order in any of these statuses still has "an order on
// it" -- served included, since the table isn't free again until the bill is
// settled. Shared by orderController (table occupancy) and tableController
// (blocking manual status changes while an order is in progress).
const ACTIVE_ORDER_STATUSES = ["placed", "preparing", "ready", "served"];

module.exports = {
  ROLES,
  VENDOR_ROLE_DEFAULTS,
  ORDER_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  ORDER_TYPES,
  PAYMENT_METHODS,
  ACTIVE_ORDER_STATUSES,
};
