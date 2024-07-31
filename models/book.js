const mongoose = require('mongoose');
const path = require('path')
const coverImageBasePath = 'uploads/bookCovers'
const bookPDFBasePath = 'uploads/bookPDFs'

const bookSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    isbn13: {
        type: Number
    },
    rackUnit: {
        type: String
    },
    rackShelf: {
        type: String
    },
    rackPosition: {
        type: String
    },
    coverImage: {
        type: String
    },
    bookPDF: {
        type: String
    },
    price: {
        type: Number
    },
    createdAt: {
        type: Date,
        required: true,
        default: Date.now
    },
    isCarried: {
        type: Boolean
    }
});

bookSchema.virtual('coverImagePath').get(function() {
    if (this.coverImage != null) {
        return path.join('/', coverImageBasePath, this.coverImage)
    }
})

bookSchema.virtual('bookPDFPath').get(function() {
    if (this.bookPDF != null) {
        return path.join('/', bookPDFBasePath, this.bookPDF)
    }
})

module.exports = mongoose.model('Book', bookSchema);
module.exports.coverImageBasePath = coverImageBasePath
module.exports.bookPDFBasePath = bookPDFBasePath