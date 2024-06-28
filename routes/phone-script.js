const express = require('express')
const router = express.Router();

router.get('/', (req, res) => {
    res.render('phone-script/phone-script')
});

module.exports = router;