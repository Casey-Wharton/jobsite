const mongoose = require('mongoose');

const booksetSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model('Bookset', booksetSchema);