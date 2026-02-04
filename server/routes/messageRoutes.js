const express = require('express');
const router = express.Router();
const { getMyMessages, sendMessageToAdmin } = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/messages', getMyMessages);
router.post('/messages', sendMessageToAdmin);

module.exports = router;
