const { DataTypes } = require('sequelize');
const {sequelize} = require('../config/db.js'); // Adjust the path if your database configuration is elsewhere

// Define the User model
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'users',  // Adjust if your table name is different
  timestamps: true,     // Enable createdAt and updatedAt timestamps
});

module.exports = User;
