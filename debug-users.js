const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./server/models/User');

dotenv.config();

const debugUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const namesToDelete = ['sasi', 'pavan', 'testuser'];
        const result = await User.deleteMany({ username: { $in: namesToDelete } });
        console.log(`Deleted ${result.deletedCount} invalid users: ${namesToDelete.join(', ')}`);

        console.log('--- REMAINING USERS ---');
        const remaining = await User.find({});
        remaining.forEach(u => console.log(`${u.username} (${u.role})`));
        console.log('-----------------------');

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

debugUsers();
