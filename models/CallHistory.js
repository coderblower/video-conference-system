const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CallHistory = sequelize.define(
  'CallHistory',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    roomId: {
      type: DataTypes.STRING(191),
      allowNull: false,
      unique: true,
      field: 'room_id',
    },
    callerId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'caller_id',
    },
    calleeId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'callee_id',
    },
    callerName: {
      type: DataTypes.STRING(191),
      allowNull: true,
      field: 'caller_name',
    },
    calleeName: {
      type: DataTypes.STRING(191),
      allowNull: true,
      field: 'callee_name',
    },
    callType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'video',
      field: 'call_type',
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'ringing',
    },
    endedBy: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'ended_by',
    },
    disconnectReason: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'disconnect_reason',
    },
    ringingStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ringing_started_at',
    },
    answeredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'answered_at',
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ended_at',
    },
    durationSeconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'duration_seconds',
    },
    metadata: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
  },
  {
    tableName: 'call_histories',
    indexes: [
      {
        fields: ['caller_id'],
      },
      {
        fields: ['callee_id'],
      },
      {
        fields: ['status'],
      },
      {
        fields: ['ringing_started_at'],
      },
    ],
  }
);

module.exports = CallHistory;
