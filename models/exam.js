const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    candidateBulletin: {
        type: String
    },
    books: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book'
    }]
});

module.exports = mongoose.model('Exam', examSchema);