const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Book = require('../models/book');
const uploadPath = path.join('public', Book.coverImageBasePath);
const imageMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
const upload = multer({
    dest: uploadPath,
    fileFilter: (req, file, callback) => {
        callback(null, imageMimeTypes.includes(file.mimetype));
    }
});

// All Books Route
router.get('/', async (req, res) => {
    let query = Book.find()
    if (req.query.title != null && req.query.title != '') {
        query = query.regex('title', new RegExp(req.query.title, 'i'))
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
            coverImage: fileName,
            isCarried: req.body.isCarried ? true : false
        });
        const newBook = await book.save();
        res.redirect(`books/${newBook.id}`);
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

router.get('/:id/edit', async (req, res) => {
    try {
    const book = await Book.findById(req.params.id)
     res.render('books/edit', { book: book })
    } catch {
        res.redirect('/books')
    }
})

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