const Payment = require('../models/Payment');
const User = require('../models/User');
const {
  ALL_MODULES,
  getModulePricingDoc,
  getPlanDurationMonths,
  normalizeBatchName,
  normalizeModuleName
} = require('./courseAccess');

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

async function repairMembershipTenure({ username } = {}) {
  const filter = { status: 'paid', paidAt: { $ne: null } };
  if (username) filter.username = String(username).trim();
  const payments = await Payment.find(filter).lean();
  let repaired = 0;
  const details = [];

  for (const payment of payments) {
    const pricing = await getModulePricingDoc(
      payment.course,
      normalizeModuleName(payment.moduleName) || ALL_MODULES,
      normalizeBatchName(payment.batch || 'General')
    );
    const expectedMonths = getPlanDurationMonths(pricing, payment.planType);
    const storedMonths = Math.max(1, Number(payment.durationMonths || 1));
    const paidAt = new Date(payment.paidAt);
    if (!Number.isFinite(paidAt.getTime())) continue;

    const correctExpiresAt = addMonths(paidAt, expectedMonths);
    const currentExpiresAt = payment.expiresAt ? new Date(payment.expiresAt) : null;
    const needsRepair = expectedMonths > storedMonths
      || (currentExpiresAt && correctExpiresAt.getTime() > currentExpiresAt.getTime() + 60000);
    if (!needsRepair) continue;

    await Payment.updateOne(
      { _id: payment._id },
      { $set: { durationMonths: expectedMonths, expiresAt: correctExpiresAt } }
    );

    const paymentId = String(payment._id);
    const byPaymentId = await User.updateOne(
      { username: payment.username, 'purchasedCourses.paymentId': paymentId },
      { $set: { 'purchasedCourses.$.expiresAt': correctExpiresAt } }
    );
    if (byPaymentId.modifiedCount === 0) {
      await User.updateOne(
        {
          username: payment.username,
          purchasedCourses: {
            $elemMatch: {
              course: payment.course,
              batch: normalizeBatchName(payment.batch || 'General'),
              moduleName: normalizeModuleName(payment.moduleName) || ALL_MODULES,
              planType: payment.planType
            }
          }
        },
        { $set: { 'purchasedCourses.$.expiresAt': correctExpiresAt } }
      );
    }

    repaired += 1;
    details.push({
      username: payment.username,
      course: payment.course,
      planType: payment.planType,
      storedMonths,
      expectedMonths,
      previousExpiresAt: currentExpiresAt ? currentExpiresAt.toISOString() : null,
      correctedExpiresAt: correctExpiresAt.toISOString()
    });
  }

  return { scanned: payments.length, repaired, details };
}

module.exports = { repairMembershipTenure };
