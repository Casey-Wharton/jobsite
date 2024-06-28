const express = require('express')
const router = express.Router();

router.get('/', (req, res) => {
    res.render('index')
});

router.get('/phone-script', (req, res) => {
    res.render('phone-script')
});

module.exports = router;