if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

const express = require('express');
const app = express();
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');

const indexRouter = require('./routes/index');
const phoneRouter = require('./routes/phone-script');
const bookRouter = require('./routes/books');
const examRouter = require('./routes/exams');
const booksetRouter = require('./routes/booksets');
const logRouter = require('./routes/logRoutes');  // Added daily log route
const imagesRouter = require('./routes/images');
const presentationsRouter = require('./routes/presentations');

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.set('layout', 'layouts/layout');
app.use('/imgs', express.static(path.join(__dirname, 'imgs')));
app.use(expressLayouts);
app.use(methodOverride('_method'))
app.use(express.static('public'));
// No idea what this does
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.json({ limit: '10mb' }));
app.use('/tinymce', express.static(path.join(__dirname, 'node_modules', 'tinymce')));

const mongoose = require('mongoose')
mongoose.connect(process.env.DATABASE_URL)
const db = mongoose.connection
db.on('error', error => console.error(error))
db.once('open', () => console.log('Connected to Mongoose'))

app.use('/', indexRouter);
app.use('/phone-script', phoneRouter);
app.use('/books', bookRouter);
app.use('/exams', examRouter);
app.use('/booksets', booksetRouter);
app.use('/logs', logRouter);
app.use('/images', imagesRouter);
app.use('/presentations', presentationsRouter);

app.listen(process.env.PORT || 3000);