const express = require('express');
const router = express.Router();
const Airtable = require('airtable');
const { marked } = require('marked');

Airtable.configure({
    endpointUrl: 'https://api.airtable.com',
    apiKey: process.env.AIRTABLE_API_KEY
});
const base = Airtable.base('appP3aHsYWZZz3pGC');

// Route to render the main page with the list of states
router.get('/', async (req, res) => {
    try {
        // Fetch all states with linked licenses
        const records = await base('States').select({
            view: 'Grid view',
            filterByFormula: `NOT({Licenses} = BLANK())`
        }).all();

        const statesWithFlags = await Promise.all(
            records.map(async (state) => {
                const licenseIds = state.fields.Licenses || [];
                
                // Fetch licenses linked to the state
                const licenses = await base('Licenses').select({
                    filterByFormula: `OR(${licenseIds.map(id => `RECORD_ID() = '${id}'`).join(", ")})`,
                    view: 'Grid view'
                }).all();

                // Gather all linked Exam IDs from the licenses
                const examIds = licenses.flatMap(license => license.fields.Exams || []);
                
                // Fetch the linked Exam records
                const exams = await base('Exams').select({
                    filterByFormula: `OR(${examIds.map(id => `RECORD_ID() = '${id}'`).join(", ")})`,
                    view: 'Grid view'
                }).all();

                // Extract the exam names from the "Exam Name" field
                const examNames = exams.map(exam => exam.fields['Exam Name'] || '');
                
                // Check if any exam names contain the specified symbols
                const hasBuilder = examNames.some(name => name.includes("🔨"));
                const hasElectrical = examNames.some(name => name.includes("🗲"));

                return {
                    state: state.fields.State,
                    hasBuilder,
                    hasElectrical
                };
            })
        );

        res.render('phone-script/phone-script', { records: statesWithFlags });
    } catch (err) {
        console.error("Error retrieving filtered records:", err);
        res.status(500).send("Error retrieving data");
    }
});

// Route to handle dynamic state pages
router.get('/:state', async (req, res) => {
    const state = req.params.state;
    try {
        const records = await base('States').select({
            filterByFormula: `{State} = "${state}"`,
            maxRecords: 1,
            view: 'Grid view'
        }).firstPage();

        if (records.length === 0) {
            return res.status(404).send("State not found");
        }

        const licenseIds = records[0].fields.Licenses;

        // Fetch licenses using the IDs
        const licenses = await base('Licenses').select({
            filterByFormula: `OR(${licenseIds.map(id => `RECORD_ID() = '${id}'`).join(", ")})`,
            view: 'Grid view'
        }).all();

        // Process licenses
        const processedLicenses = await Promise.all(
            licenses.map(async (license) => {
                const examIds = license.fields.Exams || [];
                const exams = await base('Exams').select({
                    filterByFormula: `OR(${examIds.map(id => `RECORD_ID() = '${id}'`).join(", ")})`,
                    view: 'Grid view'
                }).all();

                const examNames = exams.map(exam => exam.fields['Exam Name'] || '');
                const hasBuilder = examNames.some(name => name.includes("🔨"));
                const hasElectrical = examNames.some(name => name.includes("🗲"));

                return {
                    name: license.fields.License, // License name
                    permittedWork: license.fields['Permitted Work'] || 'No information available.', // Permitted Work
                    licenseTypes: license.fields['License Type'] || [], // License Types
                    hasBuilder,
                    hasElectrical,
                };
            })
        );

        // Sort licenses alphabetically
        processedLicenses.sort((a, b) => a.name.localeCompare(b.name));

        // Convert the General State Information from Markdown to HTML
        const generalStateInfoHtml = marked(records[0].fields['General State Information'] || '');

        const params = {
            state: records[0].fields.State,
            licenses: processedLicenses, // Alphabetically sorted licenses
            generalStateInfo: generalStateInfoHtml, // Pass the HTML version
        };

        res.render('phone-script/state-page', params);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error retrieving data");
    }
});

router.get('/:state/:license', async (req, res) => {
    const { state, license: licenseName } = req.params; // Destructuring for cleaner code

    try {
        // Fetch the state record
        const stateRecords = await base('States').select({
            filterByFormula: `{State} = "${state}"`,
            maxRecords: 1,
            view: 'Grid view'
        }).firstPage();

        if (!stateRecords.length) {
            return res.status(404).send("State not found");
        }

        // Fetch the license record
        const licenseRecords = await base('Licenses').select({
            filterByFormula: `{License} = "${licenseName}"`,
            maxRecords: 1,
            view: 'Grid view'
        }).firstPage();

        if (!licenseRecords.length) {
            return res.status(404).send("License not found");
        }

        // Render the page with state and license data
        res.render('phone-script/license-page', {
            state: stateRecords[0].fields.State,
            license: licenseRecords[0].fields
        });
    } catch (err) {
        console.error("Error retrieving data:", err);
        res.status(500).send("An error occurred while retrieving data");
    }
});

module.exports = router;