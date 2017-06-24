var express = require('express');
var router = express.Router();

// Require controller modules
var fbRobotController = require('../controllers/FbRobotController');

// for Facebook verification
router.get('/', fbRobotController.getWebhookToken);

// Facebook robot start -------
// to post data
router.post('/', fbRobotController.chatting);


module.exports = router;