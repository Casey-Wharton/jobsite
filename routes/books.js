const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const Book = require('../models/book')
const Publisher = require('../models/publisher')
const uploadPath = path.join('public', Book.coverImageBasePath)
const imageMimeTypes = ['image/jpeg', 'image/png', 'image/gif']
const upload = multer({
    dest: uploadPath,
    fileFilter: (req, file, callback) => {
        callback(null, imageMimeTypes.includes(file.mimetype))
    }
})

// All Books Route
router.get('/', async (req, res) => {
   res.render('books/index')
});

// New Book Route
router.get('/new', async (req, res) => {
    renderNewPage(res, new Book())
});

// Create Book Route
router.post('/', upload.single('twoDImage'), async (req, res) => {
    const fileName = req.file != null ? req.file.filename : null
    const book = new Book({
        title: req.body.title,
        isbn13: req.body.isbn13,
        shelfLocation: req.body.shelfLocation,
        highlightTime: req.body.highlightTime,
        cost: req.body.cost,
        price: req.body.price,
        coverImage: fileName,
        publisher: req.body.pushlisher
        
    })

    try {
        const newBook = await book.save()
        // res.redirect(`books/${newBook.id}`)
        res.redirect('books')
    } catch {
        renderNewPage(res, book, true)
    }

});

async function renderNewPage(res, book, hasError = false) {
    try {
        const publishers = await Publisher.find({})
        const params = {
            publishers: publishers,
            book: book
        }
        if (hasError) params.errorMessage = 'Error Creating Book'
        res.render('books/new', params)
    } catch {
        res.redirect('/books')
    }
}

module.exports = router;