const express = require('express');
const router = express.Router();
const Bookset = require('../models/bookset');
const Exam = require('../models/exam');
const Book = require('../models/book');
const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const ejs = require('ejs');
const pdfStore = {}; // In-memory store for PDF buffers

// PDF Print route
router.get('/pdf/:pdfId', async (req, res) => {
    try {
    const pdfId = req.params.pdfId;
    const pdfBuffer = pdfStore[pdfId];
    if (pdfBuffer) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="mypdf.pdf"');
        res.send(Buffer.from(pdfBuffer));
        
        // Optionally, you can remove the buffer from the store after serving it
        delete pdfStore[pdfId];
    }
    } catch {
        res.status(404).send('PDF not found');
    }
});

// Create Tabs Route
router.get('/:id/tabs', async (req, res) => {
    try {
        const bookset = await Bookset.findById(req.params.id).populate('exams')
        const examIds = bookset.exams.map(exam => exam.id);
        const exams = await Exam.find({ _id: { $in: examIds } }).populate('books');
        // console.log(exams[0].books[0].tabs)
        const pdfBuffer = await tabCompile('tabTemplate', { someKey: 'test text test text test text test text' });
        const pdfId = Date.now().toString();
        pdfStore[pdfId] = pdfBuffer;

        // Create a download URL
        const downloadUrl = `/booksets/pdf/${pdfId}`;
        // Respond with a link to the download URL
        res.redirect(downloadUrl);
    } catch {
        res.redirect('/booksets') 
    }
});

// All Booksets Route
router.get('/', async (req, res) => {
    let query = Bookset.find().populate('exams');
    if (req.query.name != null && req.query.name != '') {
        query = query.regex('name', new RegExp(req.query.name, 'i'));
    }
    try {
        const booksets = await query.exec();
        res.render('booksets/index', {
            booksets: booksets,
            searchOptions: req.query
        });
    } catch {
        res.redirect('/');
    }
});

// New Bookset Route
router.get('/new', async (req, res) => {
    renderNewPage(res, new Bookset());
});

// Create Bookset Route
router.post('/', async (req, res) => {
    const bookset = new Bookset({
        name: req.body.name,
        exams: req.body.exams
    });
    try {
        const newBookset = await bookset.save();
        res.redirect('booksets');
    } catch {
        res.render('booksets/new', {
            bookset: bookset,
            errorMessage: 'Error creating new bookset...'
        });
    }
});

// View Individual Bookset Route
router.get('/:id', async (req, res) => {
    try {
        const bookset = await Bookset.findById(req.params.id).populate('exams')
        const examIds = bookset.exams.map(exam => exam.id);
        const exams = await Exam.find({ _id: { $in: examIds } }).populate('books');
        res.render('booksets/show', {
            bookset: bookset,
            exams: exams
        })
    } catch {
        res.redirect('/booksets')
    }
})

// Edit Individual Bookset Route
router.get('/:id/edit', async (req, res) => {
    try {
        const bookset = await Bookset.findById(req.params.id);
        const exams = await Exam.find({});
        res.render('booksets/edit', { 
            bookset: bookset,
            exams: exams 
        });
    } catch {
        res.redirect('/booksets');
    }
});

// Update Bookset Route
router.put('/:id', async (req, res) => {
    let bookset;

    try {
        bookset = await Bookset.findById(req.params.id);
        bookset.name = req.body.name;
        bookset.exams = req.body.exams;
        await bookset.save();
        res.redirect(`/booksets`);
    } catch {
        if (bookset == null) {
            res.redirect('/');
        } else {
            const exams = await Exam.find({});
            res.render('booksets/edit', {
                bookset: bookset,
                exams: exams,
                errorMessage: "Error updating Bookset"
            });
        }
    }
});


// Functions
async function renderNewPage(res, bookset, hasError = false) {
    try {
        const exams = await Exam.find({});
        const params = {
            bookset: bookset,
            exams: exams
        };
        if (hasError) params.errorMessage = 'Error Creating Bookset';
        res.render('booksets/new', params);
    } catch {
        res.redirect('/booksets');
    }
}

// Formula to generate tab sets
const tabCompile = async (templateName, data) => {
    const filePath = path.join('views/partials', `${templateName}.ejs`);
    const html = await fs.readFile(filePath, 'utf-8')
    const compiledData = data
    let template = await ejs.compile(html)

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(template(compiledData));

    const pdfBuffer = await page.pdf({
        width: '12.6cm',
        height: '14.94cm'
    })
    await browser.close();
    return pdfBuffer;
};

module.exports = router;