require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

async function main() {
  const usernameArg = String(process.argv[2] || '').trim();
  const passwordArg = String(process.argv[3] || '').trim();

  if (!usernameArg || !passwordArg) {
    console.error('Usage: node resetUserPassword.js <username> <newPassword>');
    process.exit(1);
  }

  if (passwordArg.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing in environment.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const user = await User.findOne({ username: new RegExp(`^${usernameArg.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') });
    if (!user) {
      console.error(`User not found: ${usernameArg}`);
      process.exitCode = 1;
      return;
    }

    user.password = await bcrypt.hash(passwordArg, 10);
    await user.save();

    const reloaded = await User.findById(user._id).select('username password').lean();
    const ok = await bcrypt.compare(passwordArg, String(reloaded.password || ''));

    console.log(JSON.stringify({
      username: reloaded.username,
      resetApplied: true,
      verifyLoginPassword: ok
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
