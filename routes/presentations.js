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
      Prefix: `${PRESENTATION_FOLDER}/`,
    }).promise();

    const presentationFiles = data.Contents
    .filter(obj => obj.Key.match(/\/index(_\d+)?\.html$/) || obj.Key.endsWith('/index.html'))
    .map(obj => {
      const parts = obj.Key.split('/');
      const fileName = parts[parts.length - 1];
      const folder = parts[parts.length - 2];
      const bookId = folder.match(/^\d+$/) ? folder : null;
  
      return {
        key: obj.Key,
        fileName,
        bookId,
        lastModified: obj.LastModified
      };
    })
    .filter(item => item.bookId);
  // Load book names from DB
const connection = await mysql.createConnection({
  host: '3.229.7.141',
  user: 'forge',
  password: 'qIJOndUTc6s6jtwIqXSQ',
  database: 'CONTRACTORS_DB_PRD'
});

const [bookRows] = await connection.execute(
  `SELECT id, name FROM books WHERE id IN (${presentationFiles.map(p => '?').join(',')})`,
  presentationFiles.map(p => p.bookId)
);

const bookMap = {};
bookRows.forEach(row => {
  bookMap[row.id.toString()] = row.name;
});

// Attach book names
presentationFiles.forEach(file => {
  file.bookName = bookMap[file.bookId] || `Book ${file.bookId}`;
});
const [bookList] = await connection.execute(`
  SELECT id, name FROM books 
  WHERE deleted_at IS NULL 
  ORDER BY name
`);
await connection.end();

    res.render('presentations/index', { presentationFiles, allBooks: bookList });
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
    const s3Key = `${PRESENTATION_FOLDER}/${bookId}/index.html`;
    const jsonKey = `${PRESENTATION_FOLDER}/${bookId}/${bookId}_slide_info.json`;    
    const presentationUrl = `https://s3.amazonaws.com/${BUCKET_NAME}/${s3Key}`;
  
    let productUrl = '';
    let bookName = `Book ${bookId}`;
    let titleImageUrl = `https://s3.amazonaws.com/${BUCKET_NAME}/${PRESENTATION_FOLDER}/${bookId}/${bookId}_book_cover.png`;
    
    // Connect to MySQL
    const connection = await mysql.createConnection({
        host: '3.229.7.141',
        user: 'forge',
        password: 'qIJOndUTc6s6jtwIqXSQ',
        database: 'CONTRACTORS_DB_PRD'
    });
    
    let questionRows = [];
    let highlightJson = {};

try {
  const data = await s3.getObject({
    Bucket: BUCKET_NAME,
    Key: `${PRESENTATION_FOLDER}/${bookId}/${bookId}_highlights.json`
  }).promise();
  highlightJson = JSON.parse(data.Body.toString('utf-8'));
} catch (err) {
  console.warn(`No custom highlight JSON for book ${bookId}:`, err.message);
}


    try {
      // Load JSON metadata
      const data = await s3.getObject({
        Bucket: BUCKET_NAME,
        Key: jsonKey
      }).promise();
  
      const parsed = JSON.parse(data.Body.toString('utf-8'));
      if (parsed.productUrl) {
        productUrl = parsed.productUrl;
      }
      
    } catch (err) {
      console.warn(`Could not load JSON for book ${bookId}:`, err.message);
    }
  
    // Check if title image exists
    try {
      await s3.headObject({
        Bucket: BUCKET_NAME,
        Key: `${PRESENTATION_FOLDER}/${bookId}/${bookId}_book_cover.png`
      }).promise();
    } catch (err) {
      console.warn(`No title image found for book ${bookId}`);
      titleImageUrl = '';
    }
  
    let hasPdf = false;
try {
  await s3.headObject({
    Bucket: BUCKET_NAME,
    Key: `${PRESENTATION_FOLDER}/${bookId}/${bookId}_book_scan.pdf`
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
  q.statement_text AS statementText,
  q.statement_audio AS statementAudio,
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

try {
  const [bookMeta] = await connection.execute(
    'SELECT name FROM books WHERE id = ?',
    [bookId]
  );
  if (bookMeta.length > 0) {
    bookName = bookMeta[0].name;
  }
} catch (err) {
  console.warn(`Could not load book name for ${bookId}`, err.message);
}
      await connection.end();
    }
  
    const infoSlidesKey = `${PRESENTATION_FOLDER}/${bookId}/info_slide_resources/${bookId}_info_slides.json`;
    let infoSlidesJson;

    try {
      const data = await s3.getObject({
        Bucket: BUCKET_NAME,
        Key: infoSlidesKey
      }).promise();
    
      infoSlidesJson = JSON.parse(data.Body.toString('utf-8'));
    
      // Ensure structure is valid even if the file is malformed
      if (!infoSlidesJson.beginning || !Array.isArray(infoSlidesJson.beginning)) {
        infoSlidesJson.beginning = [];
      }
      if (!infoSlidesJson.ending || !Array.isArray(infoSlidesJson.ending)) {
        infoSlidesJson.ending = [];
      }
    } catch (err) {
      console.warn(`No info slide JSON for book ${bookId}:`, err.message);
      infoSlidesJson = { beginning: [], ending: [] }; // <- fallback
    }

    res.render('presentations/edit', {
      bookId,
      bookName,
      presentationUrl,
      productUrl,
      titleImageUrl,
      questionRows,
      hasPdf,
      highlightJson,
      infoSlidesJson
    });
  });
  
router.post('/upload-title/:bookId', upload.single('titleImage'), async (req, res) => {
    const bookId = req.params.bookId;
    const file = req.file;
  
    if (!file) {
      return res.status(400).send('No file uploaded.');
    }
  
    const fileName = `${bookId}_book_cover.png`;
    const s3Key = `${PRESENTATION_FOLDER}/${bookId}/${fileName}`;
  
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
    const jsonKey = `${PRESENTATION_FOLDER}/${bookId}/${bookId}_slide_info.json`;
  
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
  
    const fileName = `${bookId}_book_scan.pdf`;
    const s3Key = `${PRESENTATION_FOLDER}/${bookId}/${fileName}`;
  
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
      // Get main question info
      const [rows] = await connection.execute(`
        SELECT 
          q.id AS questionId,
          q.question AS questionText,
          q.statement_text AS statementText,
          bq.hint,
          bq.complex_sort,
          bq.book_id AS bookId,
          bq.hint_image,
          b.folder_name,
          (
            SELECT a.answer 
            FROM answers a 
            WHERE a.question_id = q.id AND a.correct = 1
            LIMIT 1
          ) AS correctAnswer
        FROM book_question bq
        JOIN questions q ON bq.question_id = q.id
        JOIN books b ON b.id = bq.book_id
        WHERE q.id = ? AND bq.book_id = ?
      `, [questionId, bookId]);
  
      if (rows.length === 0) {
        return res.status(404).send('Question not found');
      }
  
      const question = rows[0];
  
      // Get incorrect answers (and their IDs)
      const [incorrectRows] = await connection.execute(`
        SELECT id, answer
        FROM answers
        WHERE question_id = ? AND correct = 0
        ORDER BY id
        LIMIT 3
      `, [questionId]);
  
      question.incorrectAnswers = incorrectRows.map(r => r.answer);
      question.incorrectAnswerIds = incorrectRows.map(r => r.id);
  
      // Safe and robust parse of complex_sort
      try {
        const raw = question.complex_sort;
        question.complexSort = raw && typeof raw === 'string'
          ? JSON.parse(raw)
          : Array.isArray(raw)
            ? raw
            : [];
      } catch (e) {
        console.error('Failed to parse complex_sort:', question.complex_sort);
        question.complexSort = [];
      }
  
      // Generate hint image URL if applicable
      let hintImageUrl = '';
      if (question.hint_image && question.folder_name) {
        hintImageUrl = `https://s3.amazonaws.com/contractorcourses.com/${question.folder_name}/${question.hint_image}?v=${Date.now()}`;
      }
  
      res.render('presentations/edit-image', { question, hintImageUrl });
  
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
  
    if (!bookId || !questionId) {
      return res.status(400).json({ error: "Missing required fields." });
    }
  
    const connection = await mysql.createConnection({
      host: '3.229.7.141',
      user: 'forge',
      password: 'qIJOndUTc6s6jtwIqXSQ',
      database: 'CONTRACTORS_DB_PRD'
    });
  
    try {
      const [bookRows] = await connection.execute(
        'SELECT folder_name FROM books WHERE id = ?',
        [bookId]
      );
  
      if (bookRows.length === 0) {
        await connection.end();
        return res.status(404).json({ error: 'Book not found' });
      }
  
      const folderName = bookRows[0].folder_name;
      const filename = `${questionId}.png`;
      const s3ImageKey = `${folderName}/${filename}`;
      const jsonKey = `00_autopresentations/${bookId}/${bookId}_highlights.json`;
      let json = {};
  
      try {
        const existing = await s3.getObject({ Bucket: BUCKET_NAME, Key: jsonKey }).promise();
        json = JSON.parse(existing.Body.toString('utf-8'));
      } catch {
        console.log(`No existing highlight JSON for book ${bookId}.`);
      }
  
      // ✅ If clearing highlights, delete entry and stop here
      if (image === null && highlights === null) {
        delete json[questionId];
  
        await s3.putObject({
          Bucket: BUCKET_NAME,
          Key: jsonKey,
          Body: JSON.stringify(json, null, 2),
          ContentType: 'application/json',
          ACL: 'public-read'
        }).promise();
  
        await connection.end();
        return res.json({ success: true });
      }
  
      // ✅ Otherwise, continue with uploading image and saving highlight info
      const base64Data = image.replace(/^data:image\/png;base64,/, '');
  
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: s3ImageKey,
        Body: Buffer.from(base64Data, 'base64'),
        ContentType: 'image/png',
        ACL: 'public-read'
      }).promise();
  
      await connection.execute(
        `UPDATE book_question SET hint_image = ? WHERE question_id = ? AND book_id = ?`,
        [filename, questionId, bookId]
      );
  
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

  router.post('/save-info-slide/:bookId', upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 }
  ]), async (req, res) => {
    const { bookId } = req.params;
    const { text, position, slideId } = req.body;
  
    if (!bookId || !text || !position) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
  
    const audioFile = req.files?.audio?.[0];
    const imageFile = req.files?.image?.[0];
    const basePath = `${PRESENTATION_FOLDER}/${bookId}/info_slide_resources`;
    const jsonKey = `${basePath}/${bookId}_info_slides.json`;
  
    const slideEntry = {
      id: slideId || Date.now().toString(36) + Math.random().toString(36).substring(2),
      text,
      position,
      imageUrl: '',
      audioUrl: '',
      imageKey: '',
      audioKey: ''
    };

    try {
      // Upload audio
      if (audioFile) {
        const audioExt = path.extname(audioFile.originalname).toLowerCase();
        const audioKey = `${basePath}/${Date.now()}_${Math.random().toString(36).slice(2)}${audioExt}`;
      
        await s3.putObject({
          Bucket: BUCKET_NAME,
          Key: audioKey,
          Body: audioFile.buffer,
          ContentType: audioFile.mimetype,
          ACL: 'public-read'
        }).promise();
      
        slideEntry.audioUrl = `https://s3.amazonaws.com/${BUCKET_NAME}/${audioKey}`;
        slideEntry.audioKey = audioKey;
      }      
  
      // Upload image
      if (imageFile) {
        const imageExt = path.extname(imageFile.originalname).toLowerCase();
        const imageKey = `${basePath}/${Date.now()}_${Math.random().toString(36).slice(2)}${imageExt}`;
      
        await s3.putObject({
          Bucket: BUCKET_NAME,
          Key: imageKey,
          Body: imageFile.buffer,
          ContentType: imageFile.mimetype,
          ACL: 'public-read'
        }).promise();
      
        slideEntry.imageUrl = `https://s3.amazonaws.com/${BUCKET_NAME}/${imageKey}`;
        slideEntry.imageKey = imageKey;
      }      
  
      // Load existing JSON or initialize new structure
      let jsonData = { beginning: [], ending: [] };
  
      try {
        const data = await s3.getObject({ Bucket: BUCKET_NAME, Key: jsonKey }).promise();
        jsonData = JSON.parse(data.Body.toString('utf-8'));
      } catch (err) {
        console.warn('No existing info slides JSON found. Initializing new.');
      }
  
      if (!Array.isArray(jsonData.beginning)) jsonData.beginning = [];
      if (!Array.isArray(jsonData.ending)) jsonData.ending = [];
  
      let updated = false;

// Try to update existing slide if slideId provided
if (slideId) {
  const list = position === 'beginning' ? jsonData.beginning : jsonData.ending;
  const index = list.findIndex(s => s.id === slideId);
  if (index !== -1) {
    const existing = list[index];
  
    // Delete old audio if a new one is uploaded
    if (audioFile && existing.audioKey) {
      await s3.deleteObject({
        Bucket: BUCKET_NAME,
        Key: existing.audioKey
      }).promise();
    }
  
    // Delete old image if a new one is uploaded
    if (imageFile && existing.imageKey) {
      await s3.deleteObject({
        Bucket: BUCKET_NAME,
        Key: existing.imageKey
      }).promise();
    }
  
    // Preserve old media if no new upload
    if (!audioFile) {
      slideEntry.audioUrl = existing.audioUrl;
      slideEntry.audioKey = existing.audioKey;
    }
  
    if (!imageFile) {
      slideEntry.imageUrl = existing.imageUrl;
      slideEntry.imageKey = existing.imageKey;
    }
  
    list[index] = slideEntry;
    updated = true;
  }
  
}

// If not updated, add new
if (!updated) {
  if (position === 'beginning') {
    jsonData.beginning.push(slideEntry);
  } else if (position === 'ending') {
    jsonData.ending.push(slideEntry);
  } else {
    return res.status(400).json({ error: 'Invalid position' });
  }
}

      // Upload updated JSON
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: jsonKey,
        Body: JSON.stringify(jsonData, null, 2),
        ContentType: 'application/json',
        ACL: 'public-read'
      }).promise();
  
      res.json({ success: true });
    } catch (err) {
      console.error('Error saving info slide:', err);
      res.status(500).json({ error: 'Failed to save slide.' });
    }
  });

// Add this route in presentations.js below your other POST routes
router.post('/save-slide-order/:bookId', async (req, res) => {
  const { bookId } = req.params;
  const { section, slideIds } = req.body;

  const jsonKey = `00_autopresentations/${bookId}/info_slide_resources/${bookId}_info_slides.json`;

  try {
    const data = await s3.getObject({ Bucket: BUCKET_NAME, Key: jsonKey }).promise();
    const json = JSON.parse(data.Body.toString('utf-8'));

    if (!Array.isArray(json[section])) {
      return res.status(400).json({ success: false, error: 'Invalid section.' });
    }

    const reordered = [];
    slideIds.forEach(id => {
      const slide = json[section].find(s => s.id === id);
      if (slide) reordered.push(slide);
    });

    json[section] = reordered;

    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: jsonKey,
      Body: JSON.stringify(json, null, 2),
      ContentType: 'application/json',
      ACL: 'public-read'
    }).promise();

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save reordered slides:', err);
    res.status(500).json({ success: false, error: 'Server error while saving slide order.' });
  }
});

  router.delete('/delete-info-slide/:bookId/:slideId', async (req, res) => {
    const { bookId, slideId } = req.params;
    const jsonKey = `00_autopresentations/${bookId}/info_slide_resources/${bookId}_info_slides.json`;
  
    try {
      const data = await s3.getObject({
        Bucket: BUCKET_NAME,
        Key: jsonKey
      }).promise();
  
      const json = JSON.parse(data.Body.toString('utf-8'));
      let deletedSlide = null;
  
      // Find and remove the slide in beginning or ending
      json.beginning = (json.beginning || []).filter(slide => {
        if (slide.id === slideId) {
          deletedSlide = slide;
          return false;
        }
        return true;
      });
  
      if (!deletedSlide) {
        json.ending = (json.ending || []).filter(slide => {
          if (slide.id === slideId) {
            deletedSlide = slide;
            return false;
          }
          return true;
        });
      }
  
      if (!deletedSlide) {
        return res.status(404).json({ error: 'Slide not found.' });
      }
  
      // Delete associated audio/image if keys exist
      const keysToDelete = [];
      if (deletedSlide.audioKey) keysToDelete.push({ Key: deletedSlide.audioKey });
      if (deletedSlide.imageKey) keysToDelete.push({ Key: deletedSlide.imageKey });
  
      if (keysToDelete.length > 0) {
        await s3.deleteObjects({
          Bucket: BUCKET_NAME,
          Delete: { Objects: keysToDelete }
        }).promise();
      }
  
      // Upload updated JSON
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: jsonKey,
        Body: JSON.stringify(json, null, 2),
        ContentType: 'application/json',
        ACL: 'public-read'
      }).promise();
  
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting info slide:', err);
      res.status(500).json({ error: 'Failed to delete slide.' });
    }
  });
  
  router.post('/update-text/:questionId', async (req, res) => {
    const { questionId } = req.params;
    const { bookId } = req.query;
    const { questionText } = req.body;
  
    if (!questionText || !bookId) return res.status(400).send('Missing fields.');
  
    const connection = await mysql.createConnection({
      host: '3.229.7.141',
      user: 'forge',
      password: 'qIJOndUTc6s6jtwIqXSQ',
      database: 'CONTRACTORS_DB_PRD'
    });
  
    try {
      await connection.execute(
        `UPDATE questions SET question = ? WHERE id = ?`,
        [questionText, questionId]
      );
      res.redirect(`/presentations/edit-image/${questionId}?bookId=${bookId}`);
    } catch (err) {
      console.error('Error updating question text:', err);
      res.status(500).send('Failed to update.');
    } finally {
      await connection.end();
    }
  });
  
  router.post('/update-statement/:questionId', async (req, res) => {
    const { questionId } = req.params;
    const { bookId } = req.query;
    const { statementText } = req.body;
  
    if (!statementText || !bookId) return res.status(400).send('Missing fields.');
  
    const connection = await mysql.createConnection({
      host: '3.229.7.141',
      user: 'forge',
      password: 'qIJOndUTc6s6jtwIqXSQ',
      database: 'CONTRACTORS_DB_PRD'
    });
  
    try {
      await connection.execute(
        `UPDATE questions SET statement_text = ? WHERE id = ?`,
        [statementText, questionId]
      );
      res.redirect(`/presentations/edit-image/${questionId}?bookId=${bookId}`);
    } catch (err) {
      console.error('Error updating statement text:', err);
      res.status(500).send('Failed to update.');
    } finally {
      await connection.end();
    }
  });
  
  router.post('/update-answer/:questionId', async (req, res) => {
    const { questionId } = req.params;
    const { bookId, type, id } = req.query;
    const { answerText } = req.body;
  
    const connection = await mysql.createConnection({
      host: '3.229.7.141',
      user: 'forge',
      password: 'qIJOndUTc6s6jtwIqXSQ',
      database: 'CONTRACTORS_DB_PRD'
    });
  
    try {
      if (type === 'correct') {
        await connection.execute(
          'UPDATE answers SET answer = ? WHERE question_id = ? AND correct = 1',
          [answerText, questionId]
        );
      } else if (type === 'incorrect' && id) {
        await connection.execute(
          'UPDATE answers SET answer = ? WHERE id = ?',
          [answerText, id]
        );
      }      
  
      res.redirect(`/presentations/edit-image/${questionId}?bookId=${bookId}`);
    } catch (err) {
      console.error('Error updating answer:', err);
      res.status(500).send('Failed to update answer');
    } finally {
      await connection.end();
    }
  });
  
  router.post('/update-hint/:questionId', async (req, res) => {
    const { questionId } = req.params;
    const { bookId } = req.query;
    const { hintText } = req.body;
  
    const connection = await mysql.createConnection({
      host: '3.229.7.141',
      user: 'forge',
      password: 'qIJOndUTc6s6jtwIqXSQ',
      database: 'CONTRACTORS_DB_PRD'
    });
  
    try {
      await connection.execute(
        'UPDATE book_question SET hint = ? WHERE question_id = ? AND book_id = ?',
        [hintText, questionId, bookId]
      );
  
      res.redirect(`/presentations/edit-image/${questionId}?bookId=${bookId}`);
    } catch (err) {
      console.error('Error updating hint:', err);
      res.status(500).send('Failed to update hint');
    } finally {
      await connection.end();
    }
  });

  router.post('/update-sort/:questionId', async (req, res) => {
    const { questionId } = req.params;
    const { bookId } = req.query;
    const sortArray = req.body['sort[]'] || req.body.sort || [];
  
    // Ensure it's always an array of exactly 6 strings
    const cleanArray = Array.isArray(sortArray)
      ? sortArray.map(s => s || '')
      : ['', '', '', '', '', ''];
  
    while (cleanArray.length < 6) {
      cleanArray.push('');
    }
  
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: '3.229.7.141',
      user: 'forge',
      password: 'qIJOndUTc6s6jtwIqXSQ',
      database: 'CONTRACTORS_DB_PRD'
    });
  
    try {
      await connection.execute(
        'UPDATE book_question SET complex_sort = ? WHERE question_id = ? AND book_id = ?',
        [JSON.stringify(cleanArray), questionId, bookId]
      );
      console.log(cleanArray);
      res.redirect(`/presentations/edit-image/${questionId}?bookId=${bookId}`);
    } catch (err) {
      console.error('Error updating complex_sort:', err);
      res.status(500).send('Failed to update complex_sort');
    } finally {
      await connection.end();
    }
  });  

  router.post('/create-new-book/:bookId', async (req, res) => {
    const { bookId } = req.params;
    const { mode } = req.query;
  
    const folder = `00_autopresentations/${bookId}`;
    const infoSlideFolder = `${folder}/info_slide_resources`;
  
    const s3Put = async (Key, Body) => {
      return s3.putObject({
        Bucket: BUCKET_NAME,
        Key,
        Body: JSON.stringify(Body),
        ContentType: 'application/json',
        ACL: 'public-read'
      }).promise();
    };
  
    try {
      // 1. Create empty files
      await s3Put(`${folder}/${bookId}_slide_info.json`, {});
      await s3Put(`${folder}/${bookId}_highlights.json`, {});
      await s3Put(`${infoSlideFolder}/${bookId}_info_slides.json`, {});
  
      // 2. Copy template index file
      const templateKey = mode === 'code'
        ? '00_autopresentations/index_templates/index_code_books.html'
        : '00_autopresentations/index_templates/index_noncode_books.html';
  
      const { Body } = await s3.getObject({
        Bucket: BUCKET_NAME,
        Key: templateKey
      }).promise();
  
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: `${folder}/index.html`,
        Body,
        ContentType: 'text/html',
        ACL: 'public-read'
      }).promise();
  
      res.status(200).send('Created');
    } catch (err) {
      console.error("Error creating new presentation:", err);
      res.status(500).send('Error creating new book folder.');
    }
  });  

module.exports = router;