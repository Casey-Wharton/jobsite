const express = require('express');
const router = express.Router();

// All Booksets Route
router.get('/', async (req, res) => {
    res.render('booksets/index')
});

module.exports = router;