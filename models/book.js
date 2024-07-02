const mongoose = require('mongoose');
const coverImageBasePath = 'uploads/bookCovers'

const bookSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    isbn13: {
        type: Number
    },
    shelfLocation: {
        type: String
    },
    coverImage: {
        type: String
    },
    highlightTime: {
        type: Number
    },
    cost: {
        type: Number
    },
    price: {
        type: Number
    },
    createdAt: {
        type: Date,
        required: true,
        default: Date.now
    },
    publisher: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Publisher'
    }
});

module.exports = mongoose.model('Book', bookSchema);
module.exports.coverImageBasePath = coverImageBasePath