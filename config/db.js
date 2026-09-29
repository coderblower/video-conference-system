const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    'video_conference',
    'mges_call',
    'VG@db_@996633',
    {
        host: 'localhost',
        port: 3306,
        dialect: 'mysql',
        logging: false,
    }
);

function dbConnect() {
    sequelize.authenticate()
        .then(() => {
            console.log('Database connected');
        })
        .catch((err) => {
            console.error('Unable to connect to the database:', err);
        });
}

module.exports = { dbConnect, sequelize };