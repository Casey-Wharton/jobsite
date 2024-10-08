const mongoose = require('mongoose');

const tabSchema = new mongoose.Schema({
    chapter: { type: String },
    page: { type: String }
});

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
    },
    tabs: [tabSchema]
});

module.exports = mongoose.model('Book', bookSchema);