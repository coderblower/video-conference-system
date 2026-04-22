const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const UserPresence = sequelize.define(
  'UserPresence',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'user_id',
    },
    displayName: {
      type: DataTypes.STRING(191),
      allowNull: true,
      field: 'display_name',
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'offline',
    },
    isAvailable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_available',
    },
    socketCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'socket_count',
    },
    activeDeviceCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'active_device_count',
    },
    pushDeviceCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'push_device_count',
    },
    currentCallRoomId: {
      type: DataTypes.STRING(191),
      allowNull: true,
      field: 'current_call_room_id',
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_seen_at',
    },
    lastSocketAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_socket_at',
    },
    metadata: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
  },
  {
    tableName: 'user_presences',
    indexes: [
      {
        fields: ['status'],
      },
      {
        fields: ['is_available'],
      },
    ],
  }
);

module.exports = UserPresence;
