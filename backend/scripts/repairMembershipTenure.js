require('dotenv').config();
const mongoose = require('mongoose');
const { repairMembershipTenure } = require('../utils/repairMembershipTenure');

async function main() {
  const username = String(process.argv[2] || '').trim();

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing in environment.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const result = await repairMembershipTenure(username ? { username } : {});
    console.log(JSON.stringify(result, null, 2));
    if (result.repaired === 0) {
      console.log('No membership records needed repair.');
    } else {
      console.log(`Repaired ${result.repaired} membership record(s) out of ${result.scanned} paid payment(s).`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
