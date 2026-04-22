const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CallDevice = sequelize.define(
  'CallDevice',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'user_id',
    },
    deviceId: {
      type: DataTypes.STRING(191),
      allowNull: false,
      field: 'device_id',
    },
    fcmToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'fcm_token',
    },
    voipToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'voip_token',
    },
    socketId: {
      type: DataTypes.STRING(191),
      allowNull: true,
      field: 'socket_id',
    },
    appName: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'app_name',
    },
    deviceModel: {
      type: DataTypes.STRING(191),
      allowNull: true,
      field: 'device_model',
    },
    devicePlatform: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'device_platform',
    },
    isLoggedIn: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_logged_in',
    },
    isOnline: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_online',
    },
    isPushEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_push_enabled',
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_seen_at',
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login_at',
    },
    lastLogoutAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_logout_at',
    },
    metadata: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
  },
  {
    tableName: 'call_devices',
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'device_id'],
      },
      {
        fields: ['user_id'],
      },
      {
        fields: ['socket_id'],
      },
    ],
  }
);

module.exports = CallDevice;
