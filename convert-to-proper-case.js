require('dotenv').config({ path: './smp-cashbook-backend/.env' });
const { Pool } = require('pg');

// Parse the connection string
const connectionString = process.env.NILE_CONNECTION_STRING;

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

// Convert string to proper case (Title Case)
function toProperCase(str) {
  if (!str) return str;

  return str
    .toLowerCase()
    .split(' ')
    .map(word => {
      // Capitalize first letter of each word
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

async function convertHeadOfAccountsToProperCase() {
  const client = await pool.connect();

  try {
    console.log('Starting conversion to proper case...\n');

    // Get all distinct head_of_accounts values
    const distinctResult = await client.query(
      'SELECT DISTINCT head_of_accounts FROM cash_entries ORDER BY head_of_accounts'
    );

    console.log('Current head_of_accounts values:');
    console.log('================================');
    distinctResult.rows.forEach(row => {
      console.log(`"${row.head_of_accounts}"`);
    });
    console.log(`\nTotal distinct values: ${distinctResult.rows.length}\n`);

    // Update each distinct value to proper case
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const row of distinctResult.rows) {
      const original = row.head_of_accounts;
      const properCase = toProperCase(original);

      if (original !== properCase) {
        // Update all entries with this head_of_accounts
        const updateResult = await client.query(
          'UPDATE cash_entries SET head_of_accounts = $1 WHERE head_of_accounts = $2',
          [properCase, original]
        );

        console.log(`✓ Updated "${original}" → "${properCase}" (${updateResult.rowCount} entries)`);
        updatedCount += updateResult.rowCount;
      } else {
        unchangedCount++;
      }
    }

    console.log('\n================================');
    console.log('Conversion complete!');
    console.log(`Total entries updated: ${updatedCount}`);
    console.log(`Values already in proper case: ${unchangedCount}`);

    // Show the new distinct values
    const newDistinctResult = await client.query(
      'SELECT DISTINCT head_of_accounts FROM cash_entries ORDER BY head_of_accounts'
    );

    console.log('\nNew head_of_accounts values:');
    console.log('================================');
    newDistinctResult.rows.forEach(row => {
      console.log(`"${row.head_of_accounts}"`);
    });
    console.log(`\nTotal distinct values: ${newDistinctResult.rows.length}`);

  } catch (error) {
    console.error('Error during conversion:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the conversion
convertHeadOfAccountsToProperCase()
  .then(() => {
    console.log('\nScript completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
