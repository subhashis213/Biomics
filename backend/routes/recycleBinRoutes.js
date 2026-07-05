const express = require('express');
const router = express.Router();
const RecycleBin = require('../models/RecycleBin');
const { restoreFromRecycleBin } = require('../utils/recycleBin');
const { authenticateToken } = require('../middleware/auth');
const { logAdminAction } = require('../utils/auditLog');

// GET /api/admin/recycle-bin - List archived items with pagination and filters
router.get('/', authenticateToken('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '30', 10)));
    const skip = (page - 1) * limit;

    const collectionFilter = req.query.collection && req.query.collection !== 'All' 
      ? { originalCollection: req.query.collection } 
      : {};

    const search = (req.query.search || '').trim();
    const searchFilter = search ? {
      $or: [
        { summary: { $regex: search, $options: 'i' } },
        { deletedBy: { $regex: search, $options: 'i' } },
        { originalCollection: { $regex: search, $options: 'i' } }
      ]
    } : {};

    const queryFilter = { ...collectionFilter, ...searchFilter };

    const [items, total] = await Promise.all([
      RecycleBin.find(queryFilter)
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RecycleBin.countDocuments(queryFilter)
    ]);

    return res.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (err) {
    console.error('[recycleBinRoutes] GET / error:', err);
    return res.status(500).json({ error: 'Failed to fetch recycle bin items.' });
  }
});

// POST /api/admin/recycle-bin/:id/restore - Restore an archived item
router.post('/:id/restore', authenticateToken('admin'), async (req, res) => {
  try {
    const restored = await restoreFromRecycleBin(req.params.id, req);
    return res.json({ message: 'Item restored successfully.', restored });
  } catch (err) {
    console.error('[recycleBinRoutes] POST /:id/restore error:', err);
    return res.status(400).json({ error: err?.message || 'Failed to restore item.' });
  }
});

// DELETE /api/admin/recycle-bin/:id/permanent - Permanently delete an item
router.delete('/:id/permanent', authenticateToken('admin'), async (req, res) => {
  try {
    const item = await RecycleBin.findByIdAndDelete(req.params.id).lean();
    if (!item) {
      return res.status(404).json({ error: 'Item not found in recycle bin.' });
    }

    await logAdminAction(req, {
      action: 'RECYCLE_BIN_PERMANENT_DELETE',
      targetType: item.originalCollection,
      targetId: String(item.originalId),
      details: { summary: item.summary }
    });

    return res.json({ message: 'Item permanently deleted.' });
  } catch (err) {
    console.error('[recycleBinRoutes] DELETE /:id/permanent error:', err);
    return res.status(500).json({ error: 'Failed to permanently delete item.' });
  }
});

// DELETE /api/admin/recycle-bin/empty - Empty all or filtered items in recycle bin
router.delete('/empty', authenticateToken('admin'), async (req, res) => {
  try {
    const collectionFilter = req.query.collection && req.query.collection !== 'All'
      ? { originalCollection: req.query.collection }
      : {};

    const result = await RecycleBin.deleteMany(collectionFilter);

    await logAdminAction(req, {
      action: 'RECYCLE_BIN_EMPTY',
      targetType: 'RecycleBin',
      targetId: req.query.collection || 'All',
      details: { deletedCount: result?.deletedCount || 0 }
    });

    return res.json({ message: 'Recycle bin emptied.', deletedCount: result?.deletedCount || 0 });
  } catch (err) {
    console.error('[recycleBinRoutes] DELETE /empty error:', err);
    return res.status(500).json({ error: 'Failed to empty recycle bin.' });
  }
});

module.exports = router;
