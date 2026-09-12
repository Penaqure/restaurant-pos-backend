const { Counter } = require("../models");

// Returns the next number in a per-(vendor, branch, counterType) sequence,
// row-locked inside the caller's transaction so two concurrent requests
// never hand out the same order/bill number.
async function getNextNumber({ vendorId, branchId, counterType }, transaction) {
  let counter = await Counter.findOne({
    where: { vendorId, branchId: branchId || null, counterType },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!counter) {
    counter = await Counter.create(
      { vendorId, branchId: branchId || null, counterType, currentNumber: 0 },
      { transaction }
    );
  }

  counter.currentNumber += 1;
  await counter.save({ transaction });
  return counter.currentNumber;
}

function formatNumber(prefix, sequence) {
  return `${prefix}-${String(sequence).padStart(6, "0")}`;
}

module.exports = { getNextNumber, formatNumber };
