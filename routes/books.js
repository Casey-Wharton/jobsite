const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Book = require('../models/book');
const Publisher = require('../models/publisher');
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
    let query = Book.find().populate('publisher', 'name'); // Populate the publisher field with the name
    if (req.query.title != null && req.query.title != '') {
        query = query.regex('title', new RegExp(req.query.title, 'i'));
    }
    try {
        const books = await query.exec();
        res.render('books/index', {
            books: books,
            searchOptions: req.query
        });
    } catch {
        res.redirect('/');
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
        // Fetch the publisher by ID
        const publisher = await Publisher.findById(req.body.publisher);
        if (!publisher) {
            throw new Error('Publisher not found');
        }

        book = new Book({
            title: req.body.title,
            isbn13: req.body.isbn13,
            shelfLocation: req.body.shelfLocation,
            highlightTime: req.body.highlightTime,
            cost: req.body.cost,
            price: req.body.price,
            coverImage: fileName,
            publisher: publisher._id // Assign the publisher ObjectId
        });

        const newBook = await book.save();
        res.redirect('books');
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
        const publishers = await Publisher.find({});
        const params = {
            publishers: publishers,
            book: book
        };
        if (hasError) params.errorMessage = 'Error Creating Book';
        res.render('books/new', params);
    } catch {
        res.redirect('/books');
    }
}

module.exports = router;