const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const logFilePath = path.join(__dirname, '../views/daily_log/log.json');

// Function to read log file safely
const readLogFile = () => {
  try {
    const data = fs.readFileSync(logFilePath, 'utf8');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading log file:', error);
    return [];
  }
};

// Function to write log file
const writeLogFile = (data) => {
  try {
    fs.writeFileSync(logFilePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing log file:', error);
  }
};

// Route to render the log page
router.get('/', async (req, res) => {
  try {
    const logs = readLogFile();
    res.render('daily_log/index', { logs });
  } catch (err) {
    console.error("Error retrieving logs:", err);
    res.status(500).send("Error retrieving data");
  }
});

// Route to add a new task
router.post('/', async (req, res) => {
  try {
    const { task } = req.body;
    if (!task) {
      return res.status(400).json({ error: 'Task cannot be empty' });
    }

    const logs = readLogFile();
    const today = new Date().toISOString().split('T')[0];

    let dayLog = logs.find(log => log.date === today);
    if (!dayLog) {
      dayLog = { date: today, tasks: [] };
      logs.push(dayLog);
    }

    dayLog.tasks.push(task);
    writeLogFile(logs);

    res.redirect('/logs');
  } catch (err) {
    console.error("Error adding task:", err);
    res.status(500).send("Error adding task");
  }
});

// Route to delete a task
router.post('/delete', (req, res) => {
  try {
    const { date, taskIndex } = req.body;
    let logs = readLogFile();

    const dayLog = logs.find(log => log.date === date);
    if (dayLog) {
      dayLog.tasks.splice(taskIndex, 1); // Remove task by index
      if (dayLog.tasks.length === 0) {
        logs = logs.filter(log => log.date !== date); // Remove empty date entries
      }
    }

    writeLogFile(logs);
    res.redirect('/logs');
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).send("Error deleting task");
  }
});

// Route to filter logs by date or keyword
router.get('/filter', async (req, res) => {
  try {
    const { date, keyword } = req.query;
    let logs = readLogFile();

    if (date) {
      logs = logs.filter(log => log.date === date);
    }

    if (keyword) {
      logs = logs.filter(log =>
        log.tasks.some(task => task.toLowerCase().includes(keyword.toLowerCase()))
      );
    }

    res.render('daily_log/index', { logs });
  } catch (err) {
    console.error("Error filtering logs:", err);
    res.status(500).send("Error filtering data");
  }
});

module.exports = router;
