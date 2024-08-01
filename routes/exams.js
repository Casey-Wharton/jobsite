const express = require('express');
const router = express.Router();
const Book = require('../models/book');
const Exam = require('../models/exam');

// All Exams Route
router.get('/', async (req, res) => {
    let query = Exam.find()
    if (req.query.name != null && req.query.name != '') {
        query = query.regex('name', new RegExp(req.query.name, 'i'))
    }
    try {
        const exams = await query.exec()
        res.render('exams/index', {
            exams: exams,
            searchOptions: req.query
        })
    }  catch {
        res.redirect('/')
     }
});

// New Exam Route
router.get('/new', async (req, res) => {
    renderNewPage(res, new Exam());
});

// Create Exam Route
router.post('/', async (req, res) => {
    const exam = new Exam({
        name: req.body.name
    })
    try {
        const newExam = await exam.save()
        res.redirect('exams');
    } catch {
        res.render('exams/new', {
            exam: exam,
            errorMessage: 'Error creating new exam...'
        })
    }
})

// View Individual Exam Route
router.get('/:id', async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id).populate('books')
        res.render('exams/show', {
            exam: exam
        })
    } catch {
        res.redirect('/exams')
    }
})

// Edit Individual Exam Route
router.get('/:id/edit', async (req, res) => {
    try {
    const exam = await Exam.findById(req.params.id)
     res.render('exams/edit', { exam: exam })
    } catch {
        res.redirect('/exams')
    }
})

// Submit Edit Individual Exam Route
router.put('/:id', async (req, res) => {
    let exam;

    try {
        exam = await Exam.findById(req.params.id)
        exam.name = req.body.name
        await exam.save()
        res.redirect(`/exams`)
    } catch {
        if (book == null) {
            res.redirect('/')
        } else {
            res.render('exams/edit', {
                exam: exam,
                errorMessage: "Error updating Exam"
            })
        }
    }
})

// Functions
async function renderNewPage(res, exam, hasError = false) {
    try {
        const params = {
            exam: exam
        };
        if (hasError) params.errorMessage = 'Error Creating Exam';
        res.render('exams/new', params);
    } catch {
        res.redirect('/exams');
    }
}

module.exports = router;