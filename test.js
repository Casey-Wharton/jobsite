require('dotenv').config();
const Airtable = require('airtable');

Airtable.configure({
  endpointUrl: 'https://api.airtable.com',
  apiKey: process.env.AIRTABLE_IMAGES_API_KEY
});

const base = Airtable.base('appUyBbwNArIavA4T');
const COMBOS_TABLE = 'tblkLV7zuKdazLo5y';

async function updateFirstComboWithImage() {
  try {
    const records = await base(COMBOS_TABLE).select({
      filterByFormula: `SEARCH('${booksetId}', ARRAYJOIN({Book Sets}, ','))`,
      maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
      console.log('No combos with Book Sets found');
      return;
    }

    const testImageUrl = 'https://via.placeholder.com/300x200.png?text=Test+Image';

    const combo = records[0];
    console.log(`Updating combo: ${combo.fields['Combo Name']} (${combo.id})`);

    await base(COMBOS_TABLE).update([
      {
        id: combo.id,
        fields: {
          'Combo Image': [{ url: testImageUrl }],
          'Highlighted Combo Image': [{ url: testImageUrl }]
        }
      }
    ]);

    console.log('✅ Combo image fields updated successfully');
  } catch (err) {
    console.error('❌ Failed to update image fields');
    console.dir(err, { depth: null });
  }
}

updateFirstComboWithImage();