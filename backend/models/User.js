const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
	phone: { type: String, required: true, unique: true },
	username: { type: String, required: true, unique: true },
	class: { type: String, required: true },
	city: { type: String, required: true },
	password: { type: String, required: true },
	favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
	completedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
});

userSchema.pre('save', async function(next) {
	if (!this.isModified('password')) return next();
	this.password = await bcrypt.hash(this.password, 10);
	next();
});

module.exports = mongoose.model('User', userSchema);