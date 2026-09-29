const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    'video_conference',
    'root',
    'VG@db_@996633',
    {
        host: '127.0.0.1',
        dialect: 'mysql',
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
