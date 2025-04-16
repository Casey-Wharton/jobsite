const express = require('express');
const router = express.Router();
const Airtable = require('airtable');
const puppeteer = require('puppeteer'); // add this at the top
const path = require('path');
const fs = require('fs');

Airtable.configure({
    endpointUrl: 'https://api.airtable.com',
    apiKey: process.env.AIRTABLE_IMAGES_API_KEY
});

const base = Airtable.base('appUyBbwNArIavA4T');

// Table/Field IDs
const BOOKSETS_TABLE = 'tblNDvlPEnameiN89';
const BOOKS_TABLE = 'tblNJJLPRs7ljU7sA';

// GET /images — show list of booksets
router.get('/', async (req, res) => {
    try {
        const booksets = [];
        await base(BOOKSETS_TABLE).select({
            sort: [{ field: 'Book Set', direction: 'asc' }]
        }).eachPage((records, fetchNextPage) => {
        
            records.forEach(record => {
                booksets.push({
                    id: record.id,
                    name: record.fields['Book Set'] || 'Untitled'
                });
            });
            fetchNextPage();
        });
        res.render('images/index', { booksets });
    } catch (err) {
        console.error('Error fetching booksets:', err);
        res.status(500).send('Error loading booksets');
    }
});


// GET /images/:id — show book grid with background
router.get('/:id', async (req, res) => {
    try {
        const booksetId = req.params.id;
        const booksetRecord = await base(BOOKSETS_TABLE).find(booksetId);

        const bookRefs = booksetRecord.fields['Books'] || [];

        const books = [];

        for (const bookId of bookRefs) {
            const bookRecord = await base(BOOKS_TABLE).find(bookId);
            const image = (bookRecord.fields['2D Book Image'] || [])[0];
            if (image && image.url) {
                books.push({ coverImage: image.url });
            }
        }

        const totalBooks = books.length;
        const columns = Math.ceil(Math.sqrt(totalBooks));
        const rows = Math.ceil(totalBooks / columns);
        const completeRow = ((columns * rows) !== totalBooks) ? (columns * rows) - columns : 0;

        res.render('images/show', {
            isScreenshot: req.query.screenshot === 'true',     
            bookset: { name: booksetRecord.fields['Book Set'] },
            books,
            totalBooks,
            completeRow,
            columns
        });
    } catch (err) {
        console.error('Error loading bookset image view:', err);
        res.status(500).send('Error loading bookset image view');
    }
});

// GET /images/:id/snapshot — create image and respond with filename
router.get('/:id/snapshot', async (req, res) => {
    const booksetId = req.params.id;
    const url = `http://localhost:3000/images/${booksetId}?screenshot=true`;

    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });

        await page.waitForSelector('.background-div', { visible: true });

        const element = await page.$('.background-div');
        const imagePath = path.join(__dirname, '../public/generated-images', `${booksetId}.png`);
        await element.screenshot({ path: imagePath });

        await browser.close();
        res.json({ success: true, path: `/generated-images/${booksetId}.png` });
    } catch (err) {
        console.error('Screenshot error:', err);
        res.status(500).json({ success: false });
    }
});

module.exports = router;