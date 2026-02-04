const express = require('express');
const router = express.Router();
const { createUser, getUsers, updateUser, getUserMessages, sendMessageToUser } = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.use(protect);
router.use(adminOnly);

router.route('/users').post(createUser).get(getUsers);
router.route('/users/:id').patch(updateUser);
router.get('/conversations/:userId/messages', getUserMessages);
router.post('/messages/:userId', sendMessageToUser);

module.exports = router;
