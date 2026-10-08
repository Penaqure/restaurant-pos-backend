const { AuditLog } = require("../models");

// Thin wrapper so call sites read as one line and never have to remember
// the model/field names. Pass the same `transaction` the triggering action
// is already running in, so the audit row commits (or rolls back) atomically
// with it -- a voided payment and its audit entry are never out of sync.
async function record({ vendorId, userId, action, entityType, entityId, metadata }, transaction) {
  await AuditLog.create(
    { vendorId, userId: userId || null, action, entityType, entityId: entityId || null, metadata: metadata || null },
    { transaction }
  );
}

module.exports = { record };
