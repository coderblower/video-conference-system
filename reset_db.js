const { sequelize } = require('./config/db');

async function resetDb() {
  try {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
    await sequelize.query('TRUNCATE TABLE call_devices;');
    console.log('Cleared call_devices table.');
    await sequelize.query('TRUNCATE TABLE call_histories;');
    console.log('Cleared call_histories table.');
    await sequelize.query('TRUNCATE TABLE user_presences;');
    console.log('Cleared user_presences table.');
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('Successfully reset video call related tables!');
  } catch (err) {
    console.error('Failed to reset tables:', err);
  } finally {
    process.exit();
  }
}

resetDb();
