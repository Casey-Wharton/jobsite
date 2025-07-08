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

      // Fetch all unique states from Licenses table
// Step 1: Get all license records
const allLicenses = await base('Licenses').select({
  view: 'Grid view',
  filterByFormula: `NOT({State} = BLANK())`
}).all();

// Step 2: Extract all linked State record IDs from license records
const stateRecordIds = [...new Set(
  allLicenses.flatMap(l => l.fields.State || [])
)];

// Step 3: Fetch actual State names from States table
const stateRecords = await base('States').select({
  filterByFormula: `OR(${stateRecordIds.map(id => `RECORD_ID() = '${id}'`).join(',')})`,
  view: 'Grid view'
}).all();

// Step 4: Build a sorted unique array of state names
const uniqueStates = [...new Set(
  stateRecords.map(s => s.fields.State).filter(Boolean)
)].sort();


      // Fetch licenses using the IDs
      const licenses = await base('Licenses').select({
          filterByFormula: `OR(${licenseIds.map(id => `RECORD_ID() = '${id}'`).join(", ")})`,
          view: 'Grid view'
      }).all();

      // Process licenses
const processedLicenses = licenses.map(license => {
    const type = license.fields['License Type'] || 'Other';
    return {
        name: license.fields.License || 'Untitled License',
        permittedWork: license.fields['Permitted Work'] || 'No information available.',
        experience: license.fields['Experience Requirement'] || 'Not specified.',
        type,
        financial: license.fields['Financial Requirement'] || 'Not listed.',
        insurance: license.fields['Insurance Requirement'] || 'Not listed.',
        fee: license.fields['Application Fee'] || 'Not listed.'
    };
});

// Group licenses by license type
const groupedByType = {};
processedLicenses.forEach(license => {
    if (!groupedByType[license.type]) {
        groupedByType[license.type] = [];
    }
    groupedByType[license.type].push(license);
});

// Separate out builder vs direct categories
const directTypes = ['Electrical', 'Plumbing', 'Mechanical'];
const builderTypes = Object.keys(groupedByType).filter(type => !directTypes.includes(type));


      processedLicenses.sort((a, b) => a.name.localeCompare(b.name));

      const generalStateInfoHtml = marked(records[0].fields['General State Information'] || '');
      const stateSalesPage = records[0].fields['State Sales Page'] || null; // Fetch the State Sales Page URL

const params = {
    state: records[0].fields.State,
    licenseData: groupedByType,         // Keyed by License Type
    builderTypes,                       // Types to show in Builder accordion
    directTypes: directTypes.filter(t => groupedByType[t]), // Only those present
    generalStateInfo: generalStateInfoHtml,
    stateSalesPage,
    allStates: uniqueStates,
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
      { table: 'Licenses', field: 'When is a license required' },
      { table: 'Licenses', field: 'Reciprocity' },
      { table: 'Licenses', field: 'How often you need to renew' },
      { table: 'Licenses', field: 'Renewal Fee' },
      { table: 'Licenses', field: 'Continuing Education' },
      { table: 'Licenses', field: 'Steps to Get a License' }
    ],
    applicationInfo: [
      { table: 'Licenses', field: 'Application Instructions' },
      { table: 'Licenses', field: 'Application Link' },
      { table: 'Licenses', field: 'Application Fee' },
      { table: 'Licenses', field: 'Experience Requirement' },
      { table: 'Licenses', field: 'Insurance Requirement' },
      { table: 'Licenses', field: 'Financial Requirement' }
    ],
    examInfo: [
      { table: 'Exams', field: 'Candidate Bulletin Link' },
      { table: 'Exams', field: 'Testing Fee' },
      { table: 'Exams', field: 'Link to Schedule' },
      { table: 'Exams', field: 'Time Allotted' },
      { table: 'Exams', field: 'Amount of Questions' },
      { table: 'Exams', field: 'Pre-Approval Required' },
      { table: 'Exams', field: 'Passing Score' },
      { table: 'Exams', field: 'Number of Attempts' },
      { table: 'Exams', field: 'Books' },
      { table: 'Exams', field: 'Allowed Into the Exam'}
    ],
    courseInfo: [
        { table: 'Exams', field: 'Average Course Length' },
        { table: 'Exams', field: 'Questions in the Course' }
    ],
    productInfo: [
      { table: 'Licenses', field: 'Combo Link' },
      { table: 'Licenses', field: 'Prehighlighted Combo Link' },
      { table: 'Licenses', field: 'Bookset Link' },
      { table: 'Licenses', field: 'Course Link' },
      { table: 'Licenses', field: 'Tabset Link' }
    ]
  };
  
  router.get('/:state/:license', async (req, res) => {
    const { state, license: licenseName } = req.params;
  
    try {
      // Fetch state record
      const stateRecords = await base('States').select({
        filterByFormula: `{State} = "${state}"`,
        maxRecords: 1,
        view: 'Grid view',
      }).firstPage();
  
      if (!stateRecords.length) {
        return res.status(404).send('State not found');
      }
  
      const stateRecord = stateRecords[0];
  
      // Fetch license record
      const licenseRecords = await base('Licenses').select({
        filterByFormula: `{License} = "${licenseName}"`,
        maxRecords: 1,
        view: 'Grid view',
      }).firstPage();
  
      if (!licenseRecords.length) {
        return res.status(404).send('License not found');
      }
  
      const license = licenseRecords[0].fields;
  
      // Fetch linked exams from both "Exams" and "Exams 2"
      const linkedExamIds1 = license.Exams || [];
      const linkedExamIds2 = license['Exams 2'] || [];
      const allLinkedExamIds = [...linkedExamIds1, ...linkedExamIds2];
  
      const exams = await base('Exams').select({
        filterByFormula: `OR(${allLinkedExamIds.map(id => `RECORD_ID() = '${id}'`).join(', ')})`,
        view: 'Grid view',
      }).all();
  
      const examsFromField1 = linkedExamIds1
        .map(id => exams.find(exam => exam.id === id))
        .filter(Boolean);
  
      const examsFromField2 = linkedExamIds2
        .map(id => exams.find(exam => exam.id === id))
        .filter(Boolean);
  
      // Prepare dropdown options
      const dropdownOptions = [];
      if (examsFromField1.length) {
        dropdownOptions.push({
          name: examsFromField1.some(exam => exam.fields['Exam Name']?.includes("NASCLA"))
            ? examsFromField1.find(exam => exam.fields['Exam Name']?.includes("NASCLA")).fields['Exam Name']
            : "State Test 1",
          exams: examsFromField1.map(exam => ({
            name: exam.fields['Exam Name'] || 'Unnamed Exam',
            fields: exam.fields,
          })),
        });
      }
      if (examsFromField2.length) {
        dropdownOptions.push({
          name: examsFromField2.some(exam => exam.fields['Exam Name']?.includes("NASCLA"))
            ? examsFromField2.find(exam => exam.fields['Exam Name']?.includes("NASCLA")).fields['Exam Name']
            : "State Test 2",
          exams: examsFromField2.map(exam => ({
            name: exam.fields['Exam Name'] || 'Unnamed Exam',
            fields: exam.fields,
          })),
        });
      }
  
      // Ensure dropdownOptions has at least one entry to avoid empty dropdown
      if (!dropdownOptions.length) {
        dropdownOptions.push({
          name: "No Exams",
          exams: [],
        });
      }
  
      // Determine the test center location field
      let testCenterLocation = null;
      let testCenter = null;
      if (exams.length > 0) {
        const currentExam = exams[0]; // Default to the first exam in the dropdown
        const testingCompanyUsed = currentExam.fields['Testing Company Used'];
        switch (testingCompanyUsed) {
          case 'PSI':
            testCenterLocation = stateRecord.fields['PSI Test Center Locations'];
            testCenter = 'PSI';
            break;
          case 'ProV':
            testCenterLocation = stateRecord.fields['ProV Test Center Locations'];
            testCenter = 'ProV';
            break;
          case 'PearsonVue':
            testCenterLocation = stateRecord.fields['PearsonVue Test Center Locations'];
            testCenter = 'PearsonVue';
            break;
          default:
            testCenterLocation = null;
        }
      }
  
      // Prepare sectionData with non-empty fields only
      const filterFields = (fields, source, appendSuffix = "") =>
        fields
          .map(({ field }) => ({
            field: `${field}${appendSuffix}`,
            value: source[`${field}${appendSuffix}`],
          }))
          .filter(({ value }) => value); // Include only fields with values
  
      const sectionData = {
        licenseInfo: filterFields(sectionFields.licenseInfo, license),
        applicationInfo: filterFields(sectionFields.applicationInfo, license),
        dropdownOptions,
        productInfo: dropdownOptions.map((option, index) => ({
          name: option.name,
          fields: index === 0
            ? filterFields(sectionFields.productInfo, license) // Use original field names for "Exams"
            : filterFields(sectionFields.productInfo, license, " 2"), // Append " 2" for "Exams 2"
        })),
      };
  
      // Render the page
      res.render('phone-script/license-page', {
        state: stateRecord.fields.State,
        license,
        sectionData,
        sectionFields,
        testCenter,
        testCenterLocation, // Pass the test center location to the template
      });
    } catch (err) {
      console.error('Error retrieving data:', err);
      res.status(500).send('An error occurred while retrieving data');
    }
  });
  

module.exports = router;