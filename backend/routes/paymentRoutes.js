const crypto = require('crypto');
const express = require('express');
const Razorpay = require('razorpay');
const { authenticateToken } = require('../middleware/auth');
const ModulePricing = require('../models/ModulePricing');
const Voucher = require('../models/Voucher');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Module = require('../models/Module');
const { logAdminAction } = require('../utils/auditLog');
const {
  ALL_MODULES,
  getActiveCourseMembership,
  getActiveModuleMembership,
  normalizeCourseName,
  normalizeModuleName,
  getCoursePricingDocs,
  getModulePricingDoc,
  getMembershipPlan,
  getPlanPriceInPaise,
  MEMBERSHIP_PLANS
} = require('../utils/courseAccess');

const router = express.Router();

const SUPPORTED_COURSES = [
  '11th',
  '12th',
  'NEET',
  'IIT-JAM',
  'CSIR-NET Life Science',
  'GATE'
];

const razorpayKeyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
const razorpayKeySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
const hasRazorpayConfig = Boolean(razorpayKeyId && razorpayKeySecret);

const razorpay = hasRazorpayConfig
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

function isSupportedCourse(course) {
  return SUPPORTED_COURSES.includes(normalizeCourseName(course));
}

function buildPlanPricing(pricing) {
  return Object.values(MEMBERSHIP_PLANS).map((plan) => ({
    type: plan.type,
    label: plan.label,
    durationMonths: plan.durationMonths,
    amountInPaise: getPlanPriceInPaise(pricing, plan.type)
  }));
}

function hasPaidPlans(pricing) {
  return Boolean(pricing && buildPlanPricing(pricing).some((plan) => plan.amountInPaise > 0));
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function sanitizeReceiptPart(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 12);
}

function buildRazorpayReceipt(course, moduleName) {
  // Razorpay receipt must be <= 40 chars and should avoid special chars/spaces.
  const c = sanitizeReceiptPart(course) || 'course';
  const m = sanitizeReceiptPart(moduleName) || 'module';
  return `bh_${c}_${m}_${Date.now()}`.slice(0, 40);
}

function computeDiscountInPaise(baseAmountInPaise, voucher) {
  if (!voucher) return 0;
  const base = Math.max(0, Number(baseAmountInPaise || 0));
  if (base <= 0) return 0;

  let discount = 0;
  if (voucher.discountType === 'percent') {
    const percent = Math.max(0, Number(voucher.discountValue || 0));
    discount = Math.floor((base * percent) / 100);
  } else {
    discount = Math.floor(Math.max(0, Number(voucher.discountValue || 0)));
  }

  if (Number.isFinite(voucher.maxDiscountInPaise) && voucher.maxDiscountInPaise > 0) {
    discount = Math.min(discount, Math.floor(voucher.maxDiscountInPaise));
  }

  return Math.max(0, Math.min(base, discount));
}

function isVoucherApplicable(voucher, course) {
  if (!voucher || !voucher.active) return false;
  const now = Date.now();
  if (voucher.validFrom && new Date(voucher.validFrom).getTime() > now) return false;
  if (voucher.validUntil && new Date(voucher.validUntil).getTime() < now) return false;
  if (Number.isFinite(voucher.usageLimit) && voucher.usageLimit > 0 && voucher.usedCount >= voucher.usageLimit) {
    return false;
  }

  if (!Array.isArray(voucher.applicableCourses) || voucher.applicableCourses.length === 0) {
    return true;
  }

  return voucher.applicableCourses.some((entry) => normalizeCourseName(entry) === normalizeCourseName(course));
}

async function ensureUserAndCourse(username) {
  const user = await User.findOne({ username }).lean();
  if (!user?.class) return { user: null, course: '' };
  return { user, course: normalizeCourseName(user.class) };
}

async function buildStudentPricingSnapshot(user, course) {
  const [pricingDocs, modules] = await Promise.all([
    getCoursePricingDocs(course),
    Module.find({ category: course }).sort({ name: 1 }).lean()
  ]);

  const pricingByModule = new Map(
    pricingDocs.map((doc) => [normalizeModuleName(doc.moduleName), doc])
  );

  const bundlePricing = pricingByModule.get(ALL_MODULES) || null;
  const moduleNames = Array.from(new Set([
    ...modules.map((entry) => normalizeModuleName(entry.name)),
    ...pricingDocs
      .map((entry) => normalizeModuleName(entry.moduleName))
      .filter((moduleName) => moduleName !== ALL_MODULES)
  ])).sort((left, right) => left.localeCompare(right));

  const moduleAccess = {};
  moduleNames.forEach((moduleName) => {
    const pricing = pricingByModule.get(moduleName) || null;
    const activeMembership = getActiveModuleMembership(user, course, moduleName);
    const purchaseRequired = hasPaidPlans(pricing);
    moduleAccess[moduleName] = {
      unlocked: !purchaseRequired || Boolean(activeMembership),
      purchaseRequired,
      pricing: {
        currency: String(pricing?.currency || bundlePricing?.currency || 'INR'),
        plans: buildPlanPricing(pricing)
      },
      activeMembership: activeMembership
        ? {
            moduleName: normalizeModuleName(activeMembership.moduleName) || moduleName,
            planType: activeMembership.planType || 'pro',
            expiresAt: activeMembership.expiresAt || null,
            unlockedAt: activeMembership.unlockedAt || null
          }
        : null
    };
  });

  const activeMemberships = (Array.isArray(user?.purchasedCourses) ? user.purchasedCourses : [])
    .filter((entry) => normalizeCourseName(entry?.course) === course)
    .filter((entry) => {
      if (!entry?.expiresAt) return true;
      const expiresAt = new Date(entry.expiresAt).getTime();
      return Number.isFinite(expiresAt) && expiresAt > Date.now();
    })
    .map((entry) => ({
      moduleName: normalizeModuleName(entry.moduleName) || ALL_MODULES,
      planType: entry.planType || 'pro',
      expiresAt: entry.expiresAt || null,
      unlockedAt: entry.unlockedAt || null
    }));

  const allModulesUnlocked = Boolean(getActiveModuleMembership(user, course, ALL_MODULES));
  const unlockedModules = allModulesUnlocked
    ? moduleNames
    : moduleNames.filter((moduleName) => moduleAccess[moduleName]?.unlocked);
  const purchaseRequired = hasPaidPlans(bundlePricing) || Object.values(moduleAccess).some((entry) => entry.purchaseRequired);

  return {
    course,
    unlocked: allModulesUnlocked,
    purchaseRequired,
    allModulesUnlocked,
    unlockedModules,
    bundlePricing: {
      currency: String(bundlePricing?.currency || 'INR'),
      plans: buildPlanPricing(bundlePricing)
    },
    moduleAccess,
    activeMemberships,
    activeMembership: activeMemberships.find((entry) => entry.moduleName === ALL_MODULES) || activeMemberships[0] || null
  };
}

router.get('/my-course', authenticateToken('user'), async (req, res) => {
  try {
    const { user, course } = await ensureUserAndCourse(req.user.username);
    if (!user || !course) return res.status(404).json({ error: 'Student profile not found.' });

    const access = await buildStudentPricingSnapshot(user, course);
    return res.json({
      ...access,
      razorpayKeyId: access.purchaseRequired ? razorpayKeyId : '',
      hasRazorpayConfig
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load course payment info.' });
  }
});

router.post('/create-order', authenticateToken('user'), async (req, res) => {
  try {
    const { user, course } = await ensureUserAndCourse(req.user.username);
    if (!user || !course) return res.status(404).json({ error: 'Student profile not found.' });

    const targetModuleName = normalizeModuleName(req.body?.moduleName || ALL_MODULES);
    const pricing = await getModulePricingDoc(course, targetModuleName);
    const planType = String(req.body?.planType || '').trim().toLowerCase();
    const selectedPlan = getMembershipPlan(planType);
    if (!selectedPlan) {
      return res.status(400).json({ error: 'Please choose a valid membership plan.' });
    }
    const originalAmountInPaise = getPlanPriceInPaise(pricing, selectedPlan.type);

    if (!pricing || originalAmountInPaise <= 0) {
      return res.json({
        unlocked: true,
        purchaseRequired: false,
        message: 'This course is currently free.'
      });
    }

    const activeMembership = getActiveModuleMembership(user, course, targetModuleName);
    const alreadyUnlocked = Boolean(activeMembership);

    if (alreadyUnlocked) {
      return res.json({
        unlocked: true,
        purchaseRequired: true,
        message: 'Course already unlocked for this account.',
        activeMembership: {
          planType: activeMembership.planType || 'pro',
          expiresAt: activeMembership.expiresAt || null
        }
      });
    }

    if (!hasRazorpayConfig || !razorpay) {
      return res.status(500).json({ error: 'Razorpay is not configured on the server.' });
    }

    const voucherCode = String(req.body?.voucherCode || '').trim().toUpperCase();
    let voucher = null;
    let discountInPaise = 0;

    if (voucherCode) {
      voucher = await Voucher.findOne({ code: voucherCode }).lean();
      if (!isVoucherApplicable(voucher, course)) {
        return res.status(400).json({ error: 'Voucher is invalid, expired, or not applicable for this course.' });
      }
      discountInPaise = computeDiscountInPaise(originalAmountInPaise, voucher);
    }

    const amountInPaise = Math.max(0, originalAmountInPaise - discountInPaise);

    if (amountInPaise <= 0) {
      const now = new Date();
      const expiresAt = addMonths(now, selectedPlan.durationMonths);
      const payment = await Payment.create({
        username: req.user.username,
        course,
        moduleName: targetModuleName,
        planType: selectedPlan.type,
        durationMonths: selectedPlan.durationMonths,
        status: 'paid',
        amountInPaise: 0,
        originalAmountInPaise,
        discountInPaise,
        currency: String(pricing.currency || 'INR'),
        voucherCode: voucherCode || '',
        voucherSnapshot: {
          discountType: voucher?.discountType || '',
          discountValue: Number(voucher?.discountValue || 0)
        },
        paidAt: now,
        expiresAt
      });

      await User.updateOne(
        { username: req.user.username },
        {
          $pull: { purchasedCourses: { course, moduleName: targetModuleName } }
        }
      );
      await User.updateOne(
        { username: req.user.username },
        {
          $push: {
            purchasedCourses: {
              course,
              moduleName: targetModuleName,
              planType: selectedPlan.type,
              unlockedAt: now,
              expiresAt,
              paymentId: String(payment._id)
            }
          }
        }
      );

      if (voucherCode) {
        await Voucher.updateOne({ code: voucherCode }, { $inc: { usedCount: 1 } });
      }

      return res.json({
        unlocked: true,
        purchaseRequired: true,
        message: `${targetModuleName === ALL_MODULES ? course : targetModuleName} unlocked successfully.`,
        activeMembership: {
          moduleName: targetModuleName,
          planType: selectedPlan.type,
          expiresAt
        }
      });
    }

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: String(pricing.currency || 'INR'),
      receipt: buildRazorpayReceipt(course, targetModuleName),
      notes: {
        username: req.user.username,
        course,
        moduleName: targetModuleName,
        planType: selectedPlan.type,
        voucherCode: voucherCode || ''
      }
    });

    await Payment.create({
      username: req.user.username,
      course,
      moduleName: targetModuleName,
      planType: selectedPlan.type,
      durationMonths: selectedPlan.durationMonths,
      status: 'created',
      amountInPaise,
      originalAmountInPaise,
      discountInPaise,
      currency: String(pricing.currency || 'INR'),
      voucherCode: voucherCode || '',
      voucherSnapshot: {
        discountType: voucher?.discountType || '',
        discountValue: Number(voucher?.discountValue || 0)
      },
      razorpayOrderId: String(order.id)
    });

    return res.json({
      unlocked: false,
      purchaseRequired: true,
      order: {
        id: order.id,
        amount: amountInPaise,
        currency: String(pricing.currency || 'INR')
      },
      pricing: {
        moduleName: targetModuleName,
        planType: selectedPlan.type,
        durationMonths: selectedPlan.durationMonths,
        originalAmountInPaise,
        discountInPaise,
        finalAmountInPaise: amountInPaise,
        voucherCode: voucherCode || ''
      },
      razorpayKeyId
    });
  } catch (err) {
    const razorpayDescription = err?.error?.description || err?.description || err?.message || '';
    if (razorpayDescription) {
      console.error('[payments/create-order]', razorpayDescription);
    } else {
      console.error('[payments/create-order] unknown error');
    }

    // Return actionable provider error to help diagnose deployment env issues.
    return res.status(500).json({
      error: razorpayDescription
        ? `Failed to create payment order: ${razorpayDescription}`
        : 'Failed to create payment order.'
    });
  }
});

router.post('/verify', authenticateToken('user'), async (req, res) => {
  try {
    const razorpayOrderId = String(req.body?.razorpay_order_id || '').trim();
    const razorpayPaymentId = String(req.body?.razorpay_payment_id || '').trim();
    const razorpaySignature = String(req.body?.razorpay_signature || '').trim();

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: 'Missing payment verification fields.' });
    }

    if (!hasRazorpayConfig) {
      return res.status(500).json({ error: 'Razorpay is not configured on the server.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({ error: 'Invalid payment signature.' });
    }

    const payment = await Payment.findOne({
      razorpayOrderId,
      username: req.user.username
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment order not found.' });
    }

    if (payment.status === 'paid') {
      return res.json({
        unlocked: true,
        message: 'Membership already unlocked.',
        activeMembership: {
          moduleName: normalizeModuleName(payment.moduleName) || ALL_MODULES,
          planType: payment.planType,
          expiresAt: payment.expiresAt || null
        }
      });
    }

    const now = new Date();
    const expiresAt = addMonths(now, Number(payment.durationMonths || 1));
    payment.status = 'paid';
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.paidAt = now;
    payment.expiresAt = expiresAt;
    await payment.save();

    await User.updateOne(
      { username: req.user.username },
      { $pull: { purchasedCourses: { course: payment.course, moduleName: normalizeModuleName(payment.moduleName) || ALL_MODULES } } }
    );

    await User.updateOne(
      { username: req.user.username },
      {
        $push: {
          purchasedCourses: {
            course: payment.course,
            moduleName: normalizeModuleName(payment.moduleName) || ALL_MODULES,
            planType: payment.planType,
            unlockedAt: now,
            expiresAt,
            paymentId: String(payment._id)
          }
        }
      }
    );

    if (payment.voucherCode) {
      await Voucher.updateOne({ code: payment.voucherCode }, { $inc: { usedCount: 1 } });
    }

    return res.json({
      unlocked: true,
      message: `${normalizeModuleName(payment.moduleName) === ALL_MODULES ? payment.course : normalizeModuleName(payment.moduleName)} unlocked successfully.`,
      activeMembership: {
        moduleName: normalizeModuleName(payment.moduleName) || ALL_MODULES,
        planType: payment.planType,
        expiresAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify payment.' });
  }
});

router.get('/admin/pricing', authenticateToken('admin'), async (req, res) => {
  try {
    const pricingDocs = await ModulePricing.find({}).sort({ category: 1, moduleName: 1 }).lean();
    // Group docs by course for easy consumption by admin UI
    const pricingByCourse = {};
    SUPPORTED_COURSES.forEach((cat) => { pricingByCourse[cat] = []; });
    pricingDocs.forEach((doc) => {
      const cat = normalizeCourseName(doc.category);
      if (!pricingByCourse[cat]) pricingByCourse[cat] = [];
      pricingByCourse[cat].push(doc);
    });
    return res.json({ supportedCourses: SUPPORTED_COURSES, pricingByCourse, pricing: pricingDocs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch pricing.' });
  }
});

router.put('/admin/pricing/:course', authenticateToken('admin'), async (req, res) => {
  try {
    const category = normalizeCourseName(req.params.course);
    const proPriceInPaise = Math.floor(Number(req.body?.proPriceInPaise || 0));
    const elitePriceInPaise = Math.floor(Number(req.body?.elitePriceInPaise || 0));
    const currency = String(req.body?.currency || 'INR').trim().toUpperCase();
    const active = req.body?.active !== false;

    if (!isSupportedCourse(category)) {
      return res.status(400).json({ error: 'Unsupported course category.' });
    }
    if (!Number.isFinite(proPriceInPaise) || proPriceInPaise < 0 || !Number.isFinite(elitePriceInPaise) || elitePriceInPaise < 0) {
      return res.status(400).json({ error: 'Plan prices must be non-negative numbers.' });
    }

    const pricing = await ModulePricing.findOneAndUpdate(
      { category, moduleName: ALL_MODULES },
      {
        $set: {
          category,
          moduleName: ALL_MODULES,
          proPriceInPaise,
          elitePriceInPaise,
          currency,
          active,
          updatedBy: req.user.username
        }
      },
      { upsert: true, new: true }
    ).lean();

    return res.json({ pricing });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save pricing.' });
  }
});

router.get('/admin/pricing/:course/modules', authenticateToken('admin'), async (req, res) => {
  try {
    const category = normalizeCourseName(decodeURIComponent(req.params.course));
    if (!isSupportedCourse(category)) {
      return res.status(400).json({ error: 'Unsupported course category.' });
    }

    const [modules, pricingDocs] = await Promise.all([
      Module.find({ category }).sort({ name: 1 }).lean(),
      ModulePricing.find({ category }).sort({ moduleName: 1 }).lean()
    ]);

    const pricingMap = new Map(
      pricingDocs.map((entry) => [normalizeModuleName(entry.moduleName), entry])
    );
    const moduleNames = Array.from(new Set([
      ALL_MODULES,
      ...modules.map((entry) => normalizeModuleName(entry.name)),
      ...pricingDocs.map((entry) => normalizeModuleName(entry.moduleName))
    ]));

    return res.json({
      category,
      modules: moduleNames.map((moduleName) => {
        const pricing = pricingMap.get(moduleName);
        return {
          moduleName,
          label: moduleName === ALL_MODULES ? 'All Modules Bundle' : moduleName,
          isBundle: moduleName === ALL_MODULES,
          proPriceInPaise: Number(pricing?.proPriceInPaise || 0),
          elitePriceInPaise: Number(pricing?.elitePriceInPaise || 0),
          active: pricing ? pricing.active !== false : true
        };
      })
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch module pricing.' });
  }
});

router.put('/admin/pricing/:course/:module', authenticateToken('admin'), async (req, res) => {
  try {
    const category = normalizeCourseName(decodeURIComponent(req.params.course));
    const moduleName = normalizeModuleName(decodeURIComponent(req.params.module));
    const proPriceInPaise = Math.floor(Number(req.body?.proPriceInPaise || 0));
    const elitePriceInPaise = Math.floor(Number(req.body?.elitePriceInPaise || 0));
    const currency = String(req.body?.currency || 'INR').trim().toUpperCase();
    const active = req.body?.active !== false;

    if (!isSupportedCourse(category)) {
      return res.status(400).json({ error: 'Unsupported course category.' });
    }
    if (!Number.isFinite(proPriceInPaise) || proPriceInPaise < 0 || !Number.isFinite(elitePriceInPaise) || elitePriceInPaise < 0) {
      return res.status(400).json({ error: 'Plan prices must be non-negative numbers.' });
    }

    const pricing = await ModulePricing.findOneAndUpdate(
      { category, moduleName },
      {
        $set: {
          category,
          moduleName,
          proPriceInPaise,
          elitePriceInPaise,
          currency,
          active,
          updatedBy: req.user.username
        }
      },
      { upsert: true, new: true }
    ).lean();

    return res.json({ pricing });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save module pricing.' });
  }
});

router.get('/admin/vouchers', authenticateToken('admin'), async (req, res) => {
  try {
    const vouchers = await Voucher.find({}).sort({ createdAt: -1 }).lean();
    return res.json({ vouchers });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch vouchers.' });
  }
});

// Admin: paginated payment history
router.get('/admin/history', authenticateToken('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.course) filter.course = String(req.query.course).trim();
    if (req.query.status) filter.status = String(req.query.status).trim();
    if (req.query.username) filter.username = new RegExp(String(req.query.username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(filter)
    ]);

    return res.json({
      payments: payments.map((p) => ({
        _id: p._id,
        username: p.username,
        course: p.course,
        moduleName: p.moduleName || null,
        planType: p.planType || null,
        status: p.status,
        amountInPaise: p.amountInPaise || 0,
        voucherCode: p.voucherCode || null,
        razorpayOrderId: p.razorpayOrderId || null,
        createdAt: p.createdAt
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch payment history.' });
  }
});

router.post('/admin/vouchers', authenticateToken('admin'), async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const discountType = String(req.body?.discountType || '').trim().toLowerCase();
    const discountValue = Number(req.body?.discountValue || 0);

    if (!code || !/^[A-Z0-9_-]{4,20}$/.test(code)) {
      return res.status(400).json({ error: 'Voucher code must be 4-20 chars (A-Z, 0-9, _, -).' });
    }
    if (!['percent', 'fixed'].includes(discountType)) {
      return res.status(400).json({ error: 'discountType must be percent or fixed.' });
    }
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return res.status(400).json({ error: 'discountValue must be greater than zero.' });
    }

    const applicableCourses = Array.isArray(req.body?.applicableCourses)
      ? req.body.applicableCourses.map((entry) => normalizeCourseName(entry)).filter(Boolean)
      : [];

    if (applicableCourses.some((course) => !isSupportedCourse(course))) {
      return res.status(400).json({ error: 'One or more applicableCourses are unsupported.' });
    }

    const voucher = await Voucher.create({
      code,
      description: String(req.body?.description || '').trim(),
      discountType,
      discountValue,
      maxDiscountInPaise: Number.isFinite(Number(req.body?.maxDiscountInPaise))
        ? Math.max(0, Number(req.body.maxDiscountInPaise))
        : null,
      active: req.body?.active !== false,
      validFrom: req.body?.validFrom ? new Date(req.body.validFrom) : null,
      validUntil: req.body?.validUntil ? new Date(req.body.validUntil) : null,
      usageLimit: Number.isFinite(Number(req.body?.usageLimit)) && Number(req.body.usageLimit) > 0
        ? Math.floor(Number(req.body.usageLimit))
        : null,
      applicableCourses,
      createdBy: req.user.username
    });

    await logAdminAction(req, { action: 'CREATE_VOUCHER', targetType: 'Voucher', targetId: voucher._id.toString(), details: { code: voucher.code } });
    return res.status(201).json({ voucher });
  } catch (err) {
    if (String(err?.message || '').includes('duplicate key')) {
      return res.status(400).json({ error: 'Voucher code already exists.' });
    }
    return res.status(500).json({ error: 'Failed to create voucher.' });
  }
});

router.patch('/admin/vouchers/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const updates = {};
    if (req.body?.description != null) updates.description = String(req.body.description).trim();
    if (req.body?.active != null) updates.active = Boolean(req.body.active);
    if (req.body?.validFrom !== undefined) updates.validFrom = req.body.validFrom ? new Date(req.body.validFrom) : null;
    if (req.body?.validUntil !== undefined) updates.validUntil = req.body.validUntil ? new Date(req.body.validUntil) : null;
    if (req.body?.usageLimit !== undefined) {
      updates.usageLimit = Number.isFinite(Number(req.body.usageLimit)) && Number(req.body.usageLimit) > 0
        ? Math.floor(Number(req.body.usageLimit))
        : null;
    }

    if (req.body?.applicableCourses !== undefined) {
      const applicableCourses = Array.isArray(req.body.applicableCourses)
        ? req.body.applicableCourses.map((entry) => normalizeCourseName(entry)).filter(Boolean)
        : [];
      if (applicableCourses.some((course) => !isSupportedCourse(course))) {
        return res.status(400).json({ error: 'One or more applicableCourses are unsupported.' });
      }
      updates.applicableCourses = applicableCourses;
    }

    const voucher = await Voucher.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).lean();
    if (!voucher) return res.status(404).json({ error: 'Voucher not found.' });
    await logAdminAction(req, { action: 'UPDATE_VOUCHER', targetType: 'Voucher', targetId: String(req.params.id), details: { updates } });
    return res.json({ voucher });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update voucher.' });
  }
});

router.delete('/admin/vouchers/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const voucher = await Voucher.findByIdAndDelete(req.params.id).lean();
    if (!voucher) return res.status(404).json({ error: 'Voucher not found.' });
    await logAdminAction(req, {
      action: 'DELETE_VOUCHER',
      targetType: 'Voucher',
      targetId: String(req.params.id),
      details: {
        code: voucher.code,
        snapshot: {
          _id: String(voucher._id),
          code: voucher.code,
          description: voucher.description,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          maxDiscountInPaise: voucher.maxDiscountInPaise,
          active: voucher.active,
          validFrom: voucher.validFrom,
          validUntil: voucher.validUntil,
          usageLimit: voucher.usageLimit,
          usedCount: voucher.usedCount,
          applicableCourses: Array.isArray(voucher.applicableCourses) ? voucher.applicableCourses : [],
          createdBy: voucher.createdBy
        }
      }
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete voucher.' });
  }
});

module.exports = router;
