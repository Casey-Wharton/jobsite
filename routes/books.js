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
        const results = await s3Uploadv2(req.files);
        let pdfLink = '';
        let imageLink = '';

        results.forEach(item => {
            if (item === undefined) {
                throw new Error('File upload returned undefined item');
            }
            const location = item.Location;
            if (location.endsWith('.pdf')) {
                pdfLink = location;
            } else {
                imageLink = location;
            }
        });

        let tabsArray = [];
        if (Array.isArray(req.body.tabs)) {
            tabsArray = req.body.tabs.map(tab => ({
                chapter: tab.chapter,
                page: tab.page
            }));
        } else {
            for (let key in req.body.tabs) {
                tabsArray.push({
                    chapter: req.body.tabs[key].chapter,
                    page: req.body.tabs[key].page
                });
            }
        }

        book = new Book({
            title: req.body.title,
            isbn13: req.body.isbn13,
            rackUnit: req.body.rackUnit,
            rackShelf: req.body.rackShelf,
            rackPosition: req.body.rackPosition,
            coverImage: imageLink,
            bookPDF: pdfLink,
            isCarried: req.body.isCarried ? true : false,
            tabs: tabsArray
        });

        await book.save();
        res.redirect('books/');
    } catch (err) {
        console.error('Error creating book:', err);
        renderNewPage(res, book, true);
    }
});


async function renderNewPage(res, book, hasError = false) {
    try {
        const params = {
            book: book || new Book({
                title: '',
                isbn13: '',
                rackUnit: '',
                rackShelf: '',
                rackPosition: '',
                isCarried: false,
                tabs: []
            }),
            errorMessage: hasError ? 'Error Creating Book' : null
        };
        res.render('books/new', params);
    } catch (err) {
        console.error('Error rendering new page:', err);
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
    let book;

    try {
        const results = await s3Uploadv2(req.files);
        let pdfLink = '';
        let imageLink = '';

        results.forEach(item => {
            if (item === undefined) {
                return;
            }
            const location = item.Location;
            if (location.endsWith('.pdf')) {
                pdfLink = location;
            } else {
                imageLink = location;
            }
        });

        book = await Book.findById(req.params.id);
        book.title = req.body.title;
        book.isbn13 = req.body.isbn13;
        book.rackUnit = req.body.rackUnit;
        book.rackShelf = req.body.rackShelf;
        book.rackPosition = req.body.rackPosition;
        book.isCarried = req.body.isCarried ? true : false;

        if (imageLink !== '') {
            book.coverImage = imageLink;
        }
        if (pdfLink !== '') {
            book.bookPDF = pdfLink;
        }

        // Process the tabs data
        let tabsArray = [];
        if (Array.isArray(req.body.tabs)) {
            tabsArray = req.body.tabs.map(tab => ({
                chapter: tab.chapter,
                page: tab.page
            }));
        } else {
            for (let key in req.body.tabs) {
                tabsArray.push({
                    chapter: req.body.tabs[key].chapter,
                    page: req.body.tabs[key].page
                });
            }
        }

        // Update tabs
        book.tabs = tabsArray;

        await book.save();
        res.redirect(`/books/${book.id}`);
    } catch (err) {
        console.error(err);
        if (book == null) {
            res.redirect('/');
        } else {
            res.render('books/edit', {
                book: book,
                errorMessage: 'Error updating Book'
            });
        }
    }
});


module.exports = router;