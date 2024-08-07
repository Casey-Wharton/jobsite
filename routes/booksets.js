const express = require('express');
const router = express.Router();
const Bookset = require('../models/bookset');
const Exam = require('../models/exam');

// All Booksets Route
router.get('/', async (req, res) => {
    let query = Bookset.find().populate('exams');
    if (req.query.name != null && req.query.name != '') {
        query = query.regex('name', new RegExp(req.query.name, 'i'));
    }
    try {
        const booksets = await query.exec();
        res.render('booksets/index', {
            booksets: booksets,
            searchOptions: req.query
        });
    } catch {
        res.redirect('/');
    }
});

// New Bookset Route
router.get('/new', async (req, res) => {
    renderNewPage(res, new Bookset());
});

// Create Bookset Route
router.post('/', async (req, res) => {
    const bookset = new Bookset({
        name: req.body.name,
        exams: req.body.exams
    });
    try {
        const newBookset = await bookset.save();
        res.redirect('booksets');
    } catch {
        res.render('booksets/new', {
            bookset: bookset,
            errorMessage: 'Error creating new bookset...'
        });
    }
});

// View Individual Bookset Route
router.get('/:id', async (req, res) => {
    try {
        const bookset = await Bookset.findById(req.params.id).populate('exams')
        const examIds = bookset.exams.map(exam => exam.id);
        const exams = await Exam.find({ _id: { $in: examIds } }).populate('books');
        res.render('booksets/show', {
            bookset: bookset,
            exams: exams
        })
    } catch {
        res.redirect('/booksets')
    }
})

// Edit Individual Bookset Route
router.get('/:id/edit', async (req, res) => {
    try {
        const bookset = await Bookset.findById(req.params.id);
        const exams = await Exam.find({});
        res.render('booksets/edit', { 
            bookset: bookset,
            exams: exams 
        });
    } catch {
        res.redirect('/booksets');
    }
});

// Update Bookset Route
router.put('/:id', async (req, res) => {
    let bookset;

    try {
        bookset = await Bookset.findById(req.params.id);
        bookset.name = req.body.name;
        bookset.exams = req.body.exams;
        await bookset.save();
        res.redirect(`/booksets`);
    } catch {
        if (bookset == null) {
            res.redirect('/');
        } else {
            const exams = await Exam.find({});
            res.render('booksets/edit', {
                bookset: bookset,
                exams: exams,
                errorMessage: "Error updating Bookset"
            });
        }
    }
});


// Functions
async function renderNewPage(res, bookset, hasError = false) {
    try {
        const exams = await Exam.find({});
        const params = {
            bookset: bookset,
            exams: exams
        };
        if (hasError) params.errorMessage = 'Error Creating Bookset';
        res.render('booksets/new', params);
    } catch {
        res.redirect('/booksets');
    }
}

module.exports = router;