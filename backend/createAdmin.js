require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/Admin');

const USERNAME = 'admin';      // change this
const PASSWORD = 'Admin@1234'; // change this

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const existing = await Admin.findOne({ username: USERNAME });
    if (existing) {
      console.log('Admin already exists:', USERNAME);
      process.exit(0);
    }
    const admin = new Admin({ username: USERNAME, password: PASSWORD });
    await admin.save();
    console.log(`Admin created — username: "${USERNAME}"  password: "${PASSWORD}"`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
