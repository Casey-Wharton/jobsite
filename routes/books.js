const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Book = require('../models/book');
const s3Uploadv2 = require('./s3BookUploads');

const storage = multer.memoryStorage()

const upload = multer({
    storage: storage
}).fields([
    { name: 'twoDImage', maxCount: 1 },
    { name: 'bookPDF', maxCount: 1 }
]);

// All Books Route
router.get('/', async (req, res) => {
    let query = Book.find()
    if (req.query.title != null && req.query.title != '') {
        query = query.regex('title', new RegExp(req.query.title, 'i'))
    }
    if (req.query.isCarried === 'true') {
        query = query.where('isCarried').equals(true);
    }
    try {
        const books = await query.exec()
        res.render('books/index', {
            books: books,
            searchOptions: req.query
        })
    }  catch {
        res.redirect('/')
     }
});

// New Book Route
router.get('/new', async (req, res) => {
    renderNewPage(res, new Book());
});

// Create Book Route
router.post('/', upload, async (req, res) => {
    let book;

    try {
        const results = await s3Uploadv2(req.files)
        let pdfLink = '';
        let imageLink = '';
        results.forEach(item => {
            const location = item.Location;
            if (location.endsWith('.pdf')) {
              pdfLink = location;
            } else {
              imageLink = location;
            }
          });

          console.log(imageLink)

        book = new Book({
            title: req.body.title,
            isbn13: req.body.isbn13,
            rackUnit: req.body.rackUnit,
            rackShelf: req.body.rackShelf,
            rackPosition: req.body.rackPosition,
            coverImage: imageLink,
            bookPDF: pdfLink,
            isCarried: req.body.isCarried ? true : false
        });
        const newBook = await book.save();
        res.redirect('books/');
    } catch (err) {
        console.error(err);
    }
});

async function renderNewPage(res, book, hasError = false) {
    try {
        const params = {
            book: book
        };
        if (hasError) params.errorMessage = 'Error Creating Book';
        res.render('books/new', params);
    } catch {
        res.redirect('/books');
    }
}


// View Individual Book Route
router.get('/:id', async (req, res) => {
    try {
        const book = await Book.findById(req.params.id)
        res.render('books/show', {
            book: book
        })
    } catch {
        res.redirect('/books')
    }
})

// Edit Individual Book Route
router.get('/:id/edit', async (req, res) => {
    try {
    const book = await Book.findById(req.params.id)
     res.render('books/edit', { book: book })
    } catch {
        res.redirect('/books')
    }
})

// Submit Edit Individual Book Route
router.put('/:id', upload, async (req, res) => {
    const fileNameCover = req.files['twoDImage'] != null ? req.files['twoDImage'][0].filename : null;
    const fileNamePDF = req.files['bookPDF'] != null ? req.files['bookPDF'][0].filename : null;
    let book;

    try {
        book = await Book.findById(req.params.id)
        book.title = req.body.title
        if (fileNameCover !== null) {
            book.coverImage = fileNameCover;
        }
        if (fileNamePDF !== null) {
            book.bookPDF = fileNamePDF;
        }
        book.isCarried = req.body.isCarried ? true : false
        book.isbn13 = req.body.isbn13
        book.rackUnit = req.body.rackUnit
        book.rackShelf = req.body.rackShelf
        book.rackPosition = req.body.rackPosition
        await book.save()
        res.redirect(`/books`)
    } catch {
        if (book == null) {
            res.redirect('/')
        } else {
            res.render('books/edit', {
                book: book,
                errorMessage: "Error updating Book"
            })
        }
    }
})

router.delete('/:id', (req, res) => {
    res.send('Delete Book ' + req.params.id)
})

module.exports = router;