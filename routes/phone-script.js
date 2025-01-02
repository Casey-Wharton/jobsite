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

                // Gather all linked Exam IDs from both "Exams" and "Exams 2" fields
                const examIds = licenses.flatMap(license => [
                    ...(license.fields.Exams || []),
                    ...(license.fields['Exams 2'] || [])
                ]);

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
                // Combine Exam IDs from "Exams" and "Exams 2" fields
                const examIds = [
                    ...(license.fields.Exams || []),
                    ...(license.fields['Exams 2'] || [])
                ];

                // Fetch exams linked to the license
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


// THIS IS WHERE YOU DEFINE WHICH FIELDS GO IN WHICH SECTION. Tables are "Licenses", "States", and "Exams"
const sectionFields = {
    licenseInfo: [
      { table: 'Licenses', field: 'Permitted Work' },
      { table: 'Licenses', field: 'Reciprocity' },
      { table: 'Licenses', field: 'When is a license required' },
      { table: 'Licenses', field: 'Renewal Fee' },
      { table: 'Licenses', field: 'Continuing Education' },
      { table: 'Licenses', field: 'How often you need to renew' },
      { table: 'Licenses', field: 'Steps to Get a License' }
    ],
    applicationInfo: [
      { table: 'Licenses', field: 'Application Fee' },
      { table: 'Licenses', field: 'Application Link' },
      { table: 'Licenses', field: 'Experience Requirement' },
      { table: 'Licenses', field: 'Insurance Requirement' },
      { table: 'Licenses', field: 'Financial Requirement' }
    ],
    examInfo: [
      { table: 'Exams', field: 'Exam Name' },
      { table: 'Exams', field: 'Testing Fee' },
      { table: 'Exams', field: 'Link to Schedule' },
      { table: 'Exams', field: 'Time Allotted' },
      { table: 'Exams', field: 'Amount of Questions' },
      { table: 'Exams', field: 'Pre-Approval Required' },
      { table: 'Exams', field: 'Passing Score' },
      { table: 'Exams', field: 'Number of Attempts' },
      { table: 'Exams', field: 'Books' },
      { table: 'Exams', field: 'Candidate Bulletin Link' }
    ],
    courseInfo: [
        { table: 'Exams', field: 'Course Length (in hours)' },
        { table: 'Exams', field: 'Course Length (in weeks at our pace)' }
    ],
    productInfo: [
      { table: 'Licenses', field: 'License' },
      { table: 'Licenses', field: 'License Type' }
    ]
  };
  
  router.get('/:state/:license', async (req, res) => {
    const { state, license: licenseName } = req.params;
  
    try {
      // Fetch state record
      const stateRecords = await base('States').select({
        filterByFormula: `{State} = "${state}"`,
        maxRecords: 1,
        view: 'Grid view'
      }).firstPage();
  
      if (!stateRecords.length) {
        return res.status(404).send("State not found");
      }
  
      // Fetch license record
      const licenseRecords = await base('Licenses').select({
        filterByFormula: `{License} = "${licenseName}"`,
        maxRecords: 1,
        view: 'Grid view'
      }).firstPage();
  
      if (!licenseRecords.length) {
        return res.status(404).send("License not found");
      }
  
      const license = licenseRecords[0].fields;
  
      // Fetch linked exams
      const linkedExamIds = license.Exams || [];
      const exams = await base('Exams').select({
        filterByFormula: `OR(${linkedExamIds.map(id => `RECORD_ID() = '${id}'`).join(", ")})`,
        view: 'Grid view'
      }).all();
  
      // Prepare examOptions
      const examOptions = exams.map(exam => ({
        name: exam.fields['Exam Name'] || 'Unnamed Exam',
        fields: exam.fields
      }));
  
      // Prepare sectionData
      const sectionData = {
        licenseInfo: sectionFields.licenseInfo.map(({ field }) => ({
          field,
          value: license[field] || 'N/A'
        })),
        applicationInfo: sectionFields.applicationInfo.map(({ field }) => ({
          field,
          value: license[field] || 'N/A'
        })),
        examOptions,
        productInfo: sectionFields.productInfo.map(({ field }) => ({
          field,
          value: license[field] || 'N/A'
        }))
      };
  
      // Render the page
      res.render('phone-script/license-page', {
        state: stateRecords[0].fields.State,
        license,
        sectionData,
        sectionFields
      });
    } catch (err) {
      console.error("Error retrieving data:", err);
      res.status(500).send("An error occurred while retrieving data");
    }
  });
    
module.exports = router;