const express = require('express')
const router = express.Router();
const Publisher = require('../models/publisher')

// All Publishers Route
router.get('/', async (req, res) => {
    let searchOptions = {}
    if (req.query.name != null && req.query.name != '') {
        searchOptions.name = new RegExp(req.query.name, 'i')
    }
    try {
        const publishers = await Publisher.find(searchOptions)
        res.render('publishers/index', { 
            publishers: publishers, 
            searchOptions: req.query 
        })
    } catch {
        res.redirect('/')
    }

});

// New Publisher Route
router.get('/new', (req, res) => {
    res.render('publishers/new', { publisher: new Publisher() })
   })
// Create Publisher Route
router.post('/', async (req, res) => {
    const publisher = new Publisher({
        name: req.body.name
    })
    try {
        const newPublisher = await publisher.save()
        // res.redirect(`publishers/${newPublisher.id}`)
        res.redirect('publishers');
    } catch {
        res.render('publishers/new', {
            publisher: publisher,
            errorMessage: 'Error creating new publisher...'
        })
    }
})


module.exports = router;