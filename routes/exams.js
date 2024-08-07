const express = require('express');
const router = express.Router();
const Book = require('../models/book');
const Exam = require('../models/exam');

// All Exams Route
router.get('/', async (req, res) => {
    let query = Exam.find().populate('books');
    if (req.query.name != null && req.query.name != '') {
        query = query.regex('name', new RegExp(req.query.name, 'i'));
    }
    try {
        const exams = await query.exec();
        
        // Calculate the number of carried books for each exam
        exams.forEach(exam => {
            exam.totalBooks = exam.books.length;
            exam.carriedBooks = exam.books.filter(book => book.isCarried).length;
        });

        res.render('exams/index', {
            exams: exams,
            searchOptions: req.query
        });
    } catch {
        res.redirect('/');
    }
});

// New Exam Route
router.get('/new', async (req, res) => {
    renderNewPage(res, new Exam());
});

// Create Exam Route
router.post('/', async (req, res) => {
    const exam = new Exam({
        name: req.body.name,
        books: req.body.books,
        candidateBulletin: req.body.candidateBulletin
    });
    try {
        const newExam = await exam.save();
        res.redirect('exams');
    } catch {
        res.render('exams/new', {
            exam: exam,
            errorMessage: 'Error creating new exam...'
        });
    }
});

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
        const exam = await Exam.findById(req.params.id);
        const books = await Book.find({});
        res.render('exams/edit', { 
            exam: exam,
            books: books 
        });
    } catch {
        res.redirect('/exams');
    }
});

// Update Exam Route
router.put('/:id', async (req, res) => {
    let exam;

    try {
        exam = await Exam.findById(req.params.id);
        exam.name = req.body.name;
        exam.books = req.body.books;
        exam.candidateBulletin = req.body.candidateBulletin;
        await exam.save();
        res.redirect(`/exams`);
    } catch {
        if (exam == null) {
            res.redirect('/');
        } else {
            const books = await Book.find({});
            res.render('exams/edit', {
                exam: exam,
                books: books,
                errorMessage: "Error updating Exam"
            });
        }
    }
});


// Functions
async function renderNewPage(res, exam, hasError = false) {
    try {
        const books = await Book.find({});
        const params = {
            exam: exam,
            books: books
        };
        if (hasError) params.errorMessage = 'Error Creating Exam';
        res.render('exams/new', params);
    } catch {
        res.redirect('/exams');
    }
}

module.exports = router;