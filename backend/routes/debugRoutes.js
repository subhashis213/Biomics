const express = require('express');
const Course = require('../models/Course');
const BatchPricing = require('../models/BatchPricing');
const ModulePricing = require('../models/ModulePricing');
const { normalizeCourseName } = require('../utils/courseAccess');

const router = express.Router();

// WARNING: Debug routes are unauthenticated and intended for local development only.
// They should NOT be exposed in production.

router.get('/courses', async (req, res) => {
  try {
    const courses = await Course.find({}).lean();
    return res.json({ courses });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to list courses.' });
  }
});

router.get('/pricing/:course/batches', async (req, res) => {
  try {
    const courseName = String(req.params.course || '').trim();
    const normalized = normalizeCourseName(courseName);
    const courseDoc = await Course.findOne({}).or([{ name: courseName }, { name: normalized }]).lean();
    const pricingDocs = await BatchPricing.find({ category: normalized }).lean();
    const pricingMap = new Map(pricingDocs.map((p) => [String(p.batchName || '').trim(), p]));
    const batches = (Array.isArray(courseDoc?.batches) ? courseDoc.batches.filter((b) => b?.active !== false).map((b) => String(b.name || '').trim()).filter(Boolean) : []);
    return res.json({ courseName: normalized, batches: batches.map((name) => {
      const pricing = pricingMap.get(name) || {};
      return {
        batchName: name,
        proPriceInPaise: Number(pricing.proPriceInPaise || 0),
        elitePriceInPaise: Number(pricing.elitePriceInPaise || 0),
        proMrpInPaise: Number(pricing.proMrpInPaise || 0),
        eliteMrpInPaise: Number(pricing.eliteMrpInPaise || 0),
        active: pricing ? pricing.active !== false : true
      };
    })});
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch debug batch list.' });
  }
});

module.exports = router;
