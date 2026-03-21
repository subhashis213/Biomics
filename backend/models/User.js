const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
	phone: { type: String, required: true, unique: true },
	username: { type: String, required: true, unique: true },
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
	password: { type: String, required: true },
	favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
	completedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
});

userSchema.pre('save', async function(next) {
	if (!this.isModified('password')) return next();
	// Avoid double-hashing when password was already hashed in route handlers.
	if (/^\$2[aby]\$\d{2}\$.{53}$/.test(this.password)) return next();
	this.password = await bcrypt.hash(this.password, 10);
	next();
});

module.exports = mongoose.model('User', userSchema);