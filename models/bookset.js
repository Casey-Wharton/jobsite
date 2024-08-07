const mongoose = require('mongoose');

const booksetSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    exams: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exam'
    }]
});

module.exports = mongoose.model('Bookset', booksetSchema);