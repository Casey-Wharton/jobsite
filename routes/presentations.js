const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');
const path = require('path');
const os = require('os');
const fs = require('fs');
const mysql = require('mysql2/promise');
const generatePresentation = require('./utils/generatePresentation'); // adjust if you moved it
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const BUCKET_NAME = 'contractorcourses.com';
const PRESENTATION_FOLDER = '00_autopresentations';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Route: GET /presentations/
router.get('/', async (req, res) => {
  try {
    const data = await s3.listObjectsV2({
      Bucket: BUCKET_NAME,
      Prefix: `${PRESENTATION_FOLDER}/index_`,
    }).promise();

    const presentationFiles = data.Contents
      .filter(obj => obj.Key.endsWith('.html'))
      .map(obj => {
        const fileName = path.basename(obj.Key);
        const match = fileName.match(/^index_(\d+)\.html$/);
        const bookId = match ? match[1] : null;
        return {
          key: obj.Key,
          fileName,
          bookId,
          lastModified: obj.LastModified,
        };
      })
      .filter(item => item.bookId); // only include valid ones

    res.render('presentations/index', { presentationFiles });
  } catch (err) {
    console.error('Error listing presentation files:', err);
    res.status(500).send('Error loading presentations');
  }
});

// Route: POST /presentations/update/:bookId
router.post('/update/:bookId', async (req, res) => {
    const bookId = req.params.bookId;
    try {
      await generatePresentation(parseInt(bookId, 10));
      
      const referer = req.headers.referer || '';
      if (referer.includes(`/presentations/edit/${bookId}`)) {
        res.redirect(`/presentations/edit/${bookId}`);
      } else {
        res.redirect('/presentations');
      }
    } catch (err) {
      console.error(`Error updating book ${bookId}:`, err);
      res.status(500).send(`Failed to update book ${bookId}`);
    }
  });
  
  router.get('/edit/:bookId', async (req, res) => {
    const bookId = req.params.bookId;
    const s3Key = `${PRESENTATION_FOLDER}/index_${bookId}.html`;
    const jsonKey = `${PRESENTATION_FOLDER}/book_${bookId}_slides.json`;
    const presentationUrl = `https://s3.amazonaws.com/${BUCKET_NAME}/${s3Key}`;
  
    let productUrl = '';
    let titleImageUrl = `https://s3.amazonaws.com/${BUCKET_NAME}/${PRESENTATION_FOLDER}/3dbooks/title_${bookId}.png`;
  
    // Connect to MySQL
    const connection = await mysql.createConnection({
      host: '3.229.7.141',
      user: 'forge',
      password: 'qIJOndUTc6s6jtwIqXSQ',
      database: 'CONTRACTORS_DB_PRD'
    });
  
    let questionRows = [];
  
    try {
      // Load JSON metadata
      const data = await s3.getObject({
        Bucket: BUCKET_NAME,
        Key: jsonKey
      }).promise();
  
      const parsed = JSON.parse(data.Body.toString('utf-8'));
      const firstSlide = parsed.slides?.[0];
      if (firstSlide?.type === 'title' && firstSlide.productUrl) {
        productUrl = firstSlide.productUrl;
      }
    } catch (err) {
      console.warn(`Could not load JSON for book ${bookId}:`, err.message);
    }
  
    // Check if title image exists
    try {
      await s3.headObject({
        Bucket: BUCKET_NAME,
        Key: `${PRESENTATION_FOLDER}/3dbooks/title_${bookId}.png`
      }).promise();
    } catch (err) {
      console.warn(`No title image found for book ${bookId}`);
      titleImageUrl = '';
    }
  
    let hasPdf = false;
try {
  await s3.headObject({
    Bucket: BUCKET_NAME,
    Key: `${PRESENTATION_FOLDER}/bookpdfs/${bookId}.pdf`
  }).promise();
  hasPdf = true;
} catch (err) {
  console.warn(`No PDF found for book ${bookId}`);
}


    // ✅ NEW: Load question list
    try {
      const [rows] = await connection.execute(`
        SELECT 
          q.id AS questionId,
          q.question AS questionText,
          bq.hint,
          (
            SELECT a.answer 
            FROM answers a 
            WHERE a.question_id = q.id AND a.correct = 'True'
            LIMIT 1
          ) AS correctAnswer
        FROM book_question bq
        JOIN questions q ON bq.question_id = q.id
        WHERE bq.book_id = ? AND q.deleted_at IS NULL
        ORDER BY bq.sort ASC
      `, [bookId]);
  
      questionRows = rows;
    } catch (err) {
      console.error(`Failed to load questions for book ${bookId}:`, err);
    } finally {
      await connection.end();
    }
  
    res.render('presentations/edit', {
      bookId,
      presentationUrl,
      productUrl,
      titleImageUrl,
      questionRows,
      hasPdf
    });
  });
  

router.post('/upload-title/:bookId', upload.single('titleImage'), async (req, res) => {
    const bookId = req.params.bookId;
    const file = req.file;
  
    if (!file) {
      return res.status(400).send('No file uploaded.');
    }
  
    const fileName = `title_${bookId}.png`;
    const s3Key = `${PRESENTATION_FOLDER}/3dbooks/${fileName}`;
  
    try {
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: file.buffer,
        ContentType: 'image/png',
        ACL: 'public-read'
      }).promise();
  
      console.log(`Uploaded title image: ${s3Key}`);
      res.redirect(`/presentations/edit/${bookId}`);
    } catch (err) {
      console.error('Failed to upload title image:', err);
      res.status(500).send('Upload failed');
    }
});
  
router.post('/update-url/:bookId', upload.none(), async (req, res) => {
    const { bookId } = req.params;
    const { productUrl } = req.body;
    const jsonKey = `${PRESENTATION_FOLDER}/book_${bookId}_slides.json`;
  
    try {
      // Step 1: Download existing JSON
      const data = await s3.getObject({
        Bucket: BUCKET_NAME,
        Key: jsonKey,
      }).promise();
  
      const json = JSON.parse(data.Body.toString('utf-8'));
  
// Step 2: Store productUrl at the top level, not inside slides
json.productUrl = productUrl;

// Step 3: Upload updated JSON
await s3.putObject({
  Bucket: BUCKET_NAME,
  Key: jsonKey,
  Body: JSON.stringify(json, null, 2),
  ContentType: 'application/json'
}).promise();

  
      res.redirect(`/presentations/edit/${bookId}`);
    } catch (err) {
      console.error('Error updating product URL:', err);
      res.status(500).send('Failed to update product URL.');
    }
  });

  router.post('/upload-pdf/:bookId', upload.single('pdfFile'), async (req, res) => {
    const bookId = req.params.bookId;
    const file = req.file;
  
    if (!file || file.mimetype !== 'application/pdf') {
      return res.status(400).send('Invalid file uploaded. Only PDFs are allowed.');
    }
  
    const fileName = `${bookId}.pdf`;
    const s3Key = `${PRESENTATION_FOLDER}/bookpdfs/${fileName}`;
  
    try {
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: file.buffer,
        ContentType: 'application/pdf',
        ACL: 'public-read'
      }).promise();
  
      console.log(`Uploaded PDF: ${s3Key}`);
      res.redirect(`/presentations/edit/${bookId}`);
    } catch (err) {
      console.error('Failed to upload PDF:', err);
      res.status(500).send('PDF upload failed.');
    }
  });
  

  router.get('/edit-image/:questionId', async (req, res) => {
    const questionId = req.params.questionId;
const bookId = req.query.bookId;
  
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: '3.229.7.141',
      user: 'forge',
      password: 'qIJOndUTc6s6jtwIqXSQ',
      database: 'CONTRACTORS_DB_PRD'
    });
  
    try {
      const [rows] = await connection.execute(`
SELECT 
  q.id AS questionId,
  q.question AS questionText,
  bq.hint,
  bq.book_id AS bookId,
  (
    SELECT a.answer 
    FROM answers a 
    WHERE a.question_id = q.id AND a.correct = 1
    LIMIT 1
  ) AS correctAnswer
FROM book_question bq
JOIN questions q ON q.id = bq.question_id
WHERE q.id = ? AND bq.book_id = ?
      `, [questionId, bookId]);
  
      if (rows.length === 0) {
        return res.status(404).send('Question not found');
      }
  
      const question = rows[0];
      res.render('presentations/edit-image', { question });
  
    } catch (err) {
      console.error(`Failed to load question ${questionId}:`, err);
      res.status(500).send('Error loading question data.');
    } finally {
      await connection.end();
    }
  });
  
// POST /presentations/update-image-hint/:questionId
router.post('/update-image-hint/:questionId', async (req, res) => {
    const questionId = req.params.questionId;
    const { image, highlights, bookId, page } = req.body;
  
    if (!image || !highlights || !bookId) {
      return res.status(400).json({ error: "Missing required fields." });
    }
  
    try {
      // Decode base64 image
      const base64Data = image.replace(/^data:image\/png;base64,/, '');
      const filename = `${questionId}.png`;
  
      const connection = await mysql.createConnection({
        host: '3.229.7.141',
        user: 'forge',
        password: 'qIJOndUTc6s6jtwIqXSQ',
        database: 'CONTRACTORS_DB_PRD'
      });
  
      // Fetch folder_name from Books table
      const [bookRows] = await connection.execute(
        'SELECT folder_name FROM books WHERE id = ?',
        [bookId]
      );
  
      if (bookRows.length === 0) {
        await connection.end();
        return res.status(404).json({ error: 'Book not found' });
      }
  
      const folderName = bookRows[0].folder_name;
      const s3Key = `${folderName}/${filename}`;
  
      // Upload PNG to S3
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: Buffer.from(base64Data, 'base64'),
        ContentType: 'image/png',
        ACL: 'public-read'
      }).promise();
  
      // Update DB record
      await connection.execute(
        `UPDATE book_question SET hint_image = ? WHERE question_id = ? AND book_id = ?`,
        [filename, questionId, bookId]
      );
  
      // Update or create bookid.json highlight file
      const jsonKey = `00_autopresentations/bookpdfs/${bookId}.json`;
      let json = {};
  
      try {
        const existing = await s3.getObject({ Bucket: BUCKET_NAME, Key: jsonKey }).promise();
        json = JSON.parse(existing.Body.toString('utf-8'));
      } catch {
        console.log(`No existing highlight JSON for book ${bookId}.`);
      }
  
      json[questionId] = { page, highlights };
  
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: jsonKey,
        Body: JSON.stringify(json, null, 2),
        ContentType: 'application/json',
        ACL: 'public-read'
      }).promise();
  
      await connection.end();
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating image hint:', err);
      res.status(500).json({ error: 'Server error updating image hint' });
    }
  });
  

module.exports = router;