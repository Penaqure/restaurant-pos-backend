const ROLES = {
  SUPER_ADMIN: "super_admin",
  OWNER: "owner",
  MANAGER: "manager",
  CASHIER: "cashier",
  WAITER: "waiter",
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

module.exports = {
  ROLES,
  VENDOR_ROLE_DEFAULTS,
  ORDER_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  ORDER_TYPES,
  PAYMENT_METHODS,
};
