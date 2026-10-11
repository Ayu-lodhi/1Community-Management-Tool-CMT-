const express = require('express');
const router = express.Router();
const { getHealth } = require('./health.controller');

router.get('/', getHealth);

module.exports = router;
