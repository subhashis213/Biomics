const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
	phone: { type: String, required: true, unique: true },
	username: { type: String, required: true, unique: true },
	email: { type: String, default: '', trim: true },
	class: { type: String, required: true },
	city: { type: String, required: true },
	security: {
		question: { type: String, default: 'What is your birth date?' },
		birthDate: { type: Date }
	},
	avatar: {
		url: { type: String, default: '' },
		publicId: { type: String, default: '' },
		filename: { type: String, default: '' },
		originalName: { type: String, default: '' }
	},
	googleAuth: {
		sub: { type: String, trim: true, default: '' },
		email: { type: String, trim: true, default: '' },
		picture: { type: String, trim: true, default: '' },
		linkedAt: { type: Date, default: null }
	},
	password: { type: String, required: true },
	favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
	completedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
	purchasedCourses: [{
		course: { type: String, required: true, trim: true },
		batch: { type: String, trim: true, default: 'General' },
		moduleName: { type: String, trim: true, default: 'ALL_MODULES' },
		planType: { type: String, enum: ['pro', 'elite'], default: 'pro' },
		unlockedAt: { type: Date, default: Date.now },
		expiresAt: { type: Date, default: null },
		paymentId: { type: String, default: '' }
	}],
	liveClassAccess: {
		premiumEnabled: { type: Boolean, default: false },
		premiumLabel: { type: String, trim: true, default: 'Premium Access' },
		premiumExpiresAt: { type: Date, default: null },
		notes: { type: String, trim: true, default: '' }
	},
	liveClassCalendarBlocks: [{
		title: { type: String, required: true, trim: true },
		description: { type: String, trim: true, default: '' },
		startsAt: { type: Date, required: true },
		endsAt: { type: Date, required: true },
		kind: { type: String, enum: ['live-class', 'blocked-slot'], default: 'blocked-slot' },
		liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', default: null },
		createdBy: { type: String, trim: true, default: '' },
		createdAt: { type: Date, default: Date.now }
	}]
});

userSchema.pre('save', async function(next) {
	if (!this.isModified('password')) return next();
	// Avoid double-hashing when password was already hashed in route handlers.
	if (/^\$2[aby]\$\d{2}\$.{53}$/.test(this.password)) return next();
	this.password = await bcrypt.hash(this.password, 10);
	next();
});

// ── Performance indexes ──────────────────────────────────────────────────────
// username is the primary lookup key on every authenticated request.
userSchema.index({ username: 1 });
// email: used for Google OAuth login and password-reset flows.
userSchema.index({ email: 1 }, { sparse: true });
// phone: used for OTP login flow.
userSchema.index({ phone: 1 }, { sparse: true });
// googleAuth.sub: used for Google OAuth token matching.
userSchema.index({ 'googleAuth.sub': 1 }, { sparse: true });
// createdAt: used for admin student list sort.
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);