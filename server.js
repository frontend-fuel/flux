const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt');

const connectDB = require('./server/config/db');
const User = require('./server/models/User');
const socketHandler = require('./server/socket/socketHandler');

const authRoutes = require('./server/routes/authRoutes');
const adminRoutes = require('./server/routes/adminRoutes');
const messageRoutes = require('./server/routes/messageRoutes');

// Load env vars
dotenv.config();

// Connect to DB
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Adjust for production
        methods: ['GET', 'POST']
    }
});

// Make io accessible in routes
app.set('io', io);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500 // Limit each IP to 500 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/me', messageRoutes);

// Seed Admin
// Seed Admin
const seedAdmin = async () => {
    try {
        let admin = await User.findOne({ username: 'admin' });
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash('admin123', salt);

        if (!admin) {
            await User.create({
                username: 'admin',
                passwordHash,
                role: 'ADMIN'
            });
            console.log('Admin user created: admin / admin123');
        } else {
            admin.passwordHash = passwordHash;
            admin.role = 'ADMIN'; // Ensure role is correct enum value
            await admin.save();
            console.log('Admin password reset to: admin123');
        }
    } catch (error) {
        console.error('Error seeding admin:', error);
    }
};
seedAdmin();

// Socket.io Handler
socketHandler(io);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// app.get('*', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
