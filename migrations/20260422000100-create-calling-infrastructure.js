'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('call_devices', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      device_id: {
        type: Sequelize.STRING(191),
        allowNull: false,
      },
      fcm_token: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      voip_token: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      socket_id: {
        type: Sequelize.STRING(191),
        allowNull: true,
      },
      app_name: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      device_model: {
        type: Sequelize.STRING(191),
        allowNull: true,
      },
      device_platform: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      is_logged_in: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      is_online: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_push_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      last_seen_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_login_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_logout_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('call_devices', ['user_id', 'device_id'], {
      unique: true,
      name: 'call_devices_user_device_unique',
    });
    await queryInterface.addIndex('call_devices', ['user_id']);
    await queryInterface.addIndex('call_devices', ['socket_id']);

    await queryInterface.createTable('user_presences', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      display_name: {
        type: Sequelize.STRING(191),
        allowNull: true,
      },
      avatar: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'offline',
      },
      is_available: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      socket_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      active_device_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      push_device_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      current_call_room_id: {
        type: Sequelize.STRING(191),
        allowNull: true,
      },
      last_seen_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_socket_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('user_presences', ['status']);
    await queryInterface.addIndex('user_presences', ['is_available']);

    await queryInterface.createTable('call_histories', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      room_id: {
        type: Sequelize.STRING(191),
        allowNull: false,
        unique: true,
      },
      caller_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      callee_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      caller_name: {
        type: Sequelize.STRING(191),
        allowNull: true,
      },
      callee_name: {
        type: Sequelize.STRING(191),
        allowNull: true,
      },
      call_type: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'video',
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'ringing',
      },
      ended_by: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      disconnect_reason: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      ringing_started_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      answered_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      ended_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      duration_seconds: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      metadata: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('call_histories', ['caller_id']);
    await queryInterface.addIndex('call_histories', ['callee_id']);
    await queryInterface.addIndex('call_histories', ['status']);
    await queryInterface.addIndex('call_histories', ['ringing_started_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('call_histories');
    await queryInterface.dropTable('user_presences');
    await queryInterface.dropTable('call_devices');
  },
};
