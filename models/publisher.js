const mongoose = require('mongoose');

const publisherSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
    },
    email: {
        type: String,
    },
    website: {
        type: String,
    },
    publisherLogo: {
        type: String,
    },
    howToOrder: {
        type: String,
    },
    createdAt: {
        type: Date,
        required: true,
        default: Date.now
    }
});

module.exports = mongoose.model('Publisher', publisherSchema);