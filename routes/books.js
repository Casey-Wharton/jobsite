const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Book = require('../models/book');
const uploadPath = path.join('public', Book.coverImageBasePath);
// const imageMimeTypes = ['image/jpeg', 'image/png', 'image/gif']; NOT CURRENTLY USED

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadPath)
    },
    filename: function (req, file, cb) {
        cb(null, Math.floor(100000 + Math.random() * 900000) + file.originalname)
    }
})
const upload = multer({
storage
});

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
router.post('/', upload.single('twoDImage'), async (req, res) => {
    const fileName = req.file != null ? req.file.filename : null;
    let book;

    try {
        book = new Book({
            title: req.body.title,
            isbn13: req.body.isbn13,
            rackUnit: req.body.rackUnit,
            rackShelf: req.body.rackShelf,
            rackPosition: req.body.rackPosition,
            coverImage: fileName,
            isCarried: req.body.isCarried ? true : false
        });
        const newBook = await book.save();
        res.redirect('books/');
    } catch (err) {
        console.error(err); // Log the error to the console
        if (fileName != null) {
            removeBookCover(fileName);
        }
        renderNewPage(res, book || new Book(), true);
    }
});

function removeBookCover(fileName) {
    fs.unlink(path.join(uploadPath, fileName), err => {
        if (err) console.error(err);
    });
}

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
router.put('/:id', upload.single('twoDImage'), async (req, res) => {
    const fileName = (req.file === undefined) ? null : req.file.filename;
    let book;

    try {
        book = await Book.findById(req.params.id)
        book.title = req.body.title
        if (fileName !== null) {
            book.coverImage = fileName;
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