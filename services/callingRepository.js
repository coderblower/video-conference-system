const { Op } = require('sequelize');
const CallDevice = require('../models/CallDevice');
const UserPresence = require('../models/UserPresence');
const CallHistory = require('../models/CallHistory');

function stringifyMetadata(metadata) {
  if (!metadata) {
    return null;
  }

  try {
    return JSON.stringify(metadata);
  } catch (error) {
    return null;
  }
}

function parseMetadata(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function normalizeUserId(userId) {
  if (userId === undefined || userId === null || userId === '') {
    return null;
  }

  return String(userId);
}

function normalizeOptionalToken(value, fallback = null) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : fallback;
}

function buildDisplayName(userInfo = {}, fallback = null) {
  const firstName = userInfo.firstName || userInfo.firstname || '';
  const lastName = userInfo.lastName || userInfo.lastname || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || userInfo.name || fallback || null;
}

async function syncPresence(userId, userInfo = {}) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return null;
  }

  const devices = await CallDevice.findAll({
    where: {
      userId: normalizedUserId,
      isLoggedIn: true,
    },
  });

  const socketCount = devices.filter((device) => Boolean(device.socketId)).length;
  const pushDeviceCount = devices.filter(
    (device) => Boolean(device.fcmToken) && device.isPushEnabled
  ).length;
  const activeDeviceCount = devices.length;
  const hasReachableDevice = socketCount > 0 || pushDeviceCount > 0;
  const existingPresence = await UserPresence.findOne({
    where: { userId: normalizedUserId },
  });

  const displayName = buildDisplayName(userInfo, existingPresence?.displayName);
  const avatar =
    userInfo.avatar ||
    userInfo.profilePic ||
    existingPresence?.avatar ||
    null;
  const metadata = parseMetadata(existingPresence?.metadata) || {};
  const mergedMetadata = {
    ...metadata,
    ...userInfo,
  };

  const status = existingPresence?.currentCallRoomId
    ? 'busy'
    : hasReachableDevice
      ? 'online'
      : 'offline';

  const values = {
    displayName,
    avatar,
    status,
    isAvailable: hasReachableDevice,
    socketCount,
    activeDeviceCount,
    pushDeviceCount,
    lastSeenAt: new Date(),
    lastSocketAt: socketCount > 0 ? new Date() : existingPresence?.lastSocketAt || null,
    metadata: stringifyMetadata(mergedMetadata),
  };

  if (existingPresence) {
    await existingPresence.update(values);
    return existingPresence.reload();
  }

  return UserPresence.create({
    userId: normalizedUserId,
    ...values,
  });
}

async function registerDevice(payload = {}) {
  const userId = normalizeUserId(payload.userId);
  const deviceId = payload.deviceId ? String(payload.deviceId) : null;

  if (!userId || !deviceId) {
    throw new Error('userId and deviceId are required');
  }

  const existing = await CallDevice.findOne({
    where: { userId, deviceId },
  });

  const nextFcmToken = normalizeOptionalToken(payload.fcmToken, existing?.fcmToken || null);
  const nextVoipToken = normalizeOptionalToken(payload.voipToken, existing?.voipToken || null);
  const existingMetadata = parseMetadata(existing?.metadata) || {};
  const nextMetadata =
    payload.userInfo && Object.keys(payload.userInfo).length > 0
      ? { ...existingMetadata, ...payload.userInfo }
      : existingMetadata;

  const values = {
    userId,
    deviceId,
    fcmToken: nextFcmToken,
    voipToken: nextVoipToken,
    socketId: payload.socketId || existing?.socketId || null,
    appName: payload.appName || existing?.appName || null,
    deviceModel: payload.deviceModel || existing?.deviceModel || null,
    devicePlatform: payload.devicePlatform || existing?.devicePlatform || null,
    isLoggedIn: true,
    isOnline: Boolean(payload.socketId || existing?.socketId),
    isPushEnabled: Boolean(nextFcmToken),
    lastSeenAt: new Date(),
    lastLoginAt: existing?.lastLoginAt || new Date(),
    lastLogoutAt: null,
    metadata: stringifyMetadata(nextMetadata),
  };

  let device = existing;
  if (device) {
    await device.update(values);
  } else {
    device = await CallDevice.create(values);
  }

  await syncPresence(userId, payload.userInfo);
  return device.reload();
}

async function markSocketConnected(payload = {}) {
  return registerDevice(payload);
}

async function clearSocket(socketId) {
  if (!socketId) {
    return null;
  }

  const device = await CallDevice.findOne({
    where: { socketId },
  });

  if (!device) {
    return null;
  }

  await device.update({
    socketId: null,
    isOnline: false,
    lastSeenAt: new Date(),
  });

  await syncPresence(device.userId);
  return device;
}

async function logoutDevice(payload = {}) {
  const userId = normalizeUserId(payload.userId);
  const deviceId = payload.deviceId ? String(payload.deviceId) : null;

  if (!userId) {
    throw new Error('userId is required');
  }

  const where = { userId };
  if (deviceId) {
    where.deviceId = deviceId;
  }

  await CallDevice.update(
    {
      socketId: null,
      isOnline: false,
      isLoggedIn: false,
      isPushEnabled: false,
      fcmToken: null,
      voipToken: null,
      lastSeenAt: new Date(),
      lastLogoutAt: new Date(),
    },
    { where }
  );

  await syncPresence(userId);
}

async function getActiveTokensForUser(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return [];
  }

  const devices = await CallDevice.findAll({
    where: {
      userId: normalizedUserId,
      isLoggedIn: true,
      isPushEnabled: true,
      fcmToken: {
        [Op.ne]: null,
      },
    },
  });

  return Array.from(
    new Set(
      devices
        .map((device) => device.fcmToken)
        .filter((token) => typeof token === 'string' && token.trim())
    )
  );
}

async function upsertCallHistory(roomId, payload = {}) {
  if (!roomId) {
    return null;
  }

  const existing = await CallHistory.findOne({
    where: { roomId },
  });

  const currentMetadata = parseMetadata(existing?.metadata) || {};
  const nextMetadata = payload.metadata
    ? { ...currentMetadata, ...payload.metadata }
    : currentMetadata;

  const values = {
    callerId: normalizeUserId(payload.callerId) || existing?.callerId,
    calleeId: normalizeUserId(payload.calleeId) || existing?.calleeId,
    callerName: payload.callerName || existing?.callerName || null,
    calleeName: payload.calleeName || existing?.calleeName || null,
    callType: payload.callType || existing?.callType || 'video',
    status: payload.status || existing?.status || 'ringing',
    endedBy:
      payload.endedBy !== undefined ? normalizeUserId(payload.endedBy) : existing?.endedBy,
    disconnectReason:
      payload.disconnectReason !== undefined
        ? payload.disconnectReason
        : existing?.disconnectReason,
    ringingStartedAt:
      payload.ringingStartedAt || existing?.ringingStartedAt || new Date(),
    answeredAt:
      payload.answeredAt !== undefined ? payload.answeredAt : existing?.answeredAt,
    endedAt: payload.endedAt !== undefined ? payload.endedAt : existing?.endedAt,
    durationSeconds:
      payload.durationSeconds !== undefined
        ? payload.durationSeconds
        : existing?.durationSeconds || 0,
    metadata: stringifyMetadata(nextMetadata),
  };

  if (existing) {
    await existing.update(values);
    return existing.reload();
  }

  return CallHistory.create({
    roomId,
    ...values,
  });
}

async function markCallAccepted(roomId, payload = {}) {
  const history = await upsertCallHistory(roomId, {
    ...payload,
    status: 'accepted',
    answeredAt: payload.answeredAt || new Date(),
  });

  if (!history) {
    return null;
  }

  const participants = [history.callerId, history.calleeId].filter(Boolean);
  await Promise.all(
    participants.map((userId) =>
      UserPresence.update(
        {
          currentCallRoomId: roomId,
          status: 'busy',
          isAvailable: true,
          lastSeenAt: new Date(),
        },
        { where: { userId } }
      )
    )
  );

  return history;
}

async function finalizeCall(roomId, payload = {}) {
  const history = await CallHistory.findOne({
    where: { roomId },
  });

  if (!history) {
    return upsertCallHistory(roomId, {
      ...payload,
      endedAt: payload.endedAt || new Date(),
    });
  }

  const endedAt = payload.endedAt || new Date();
  const answeredAt = payload.answeredAt !== undefined ? payload.answeredAt : history.answeredAt;
  const durationSeconds =
    payload.durationSeconds !== undefined
      ? payload.durationSeconds
      : answeredAt
        ? Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000))
        : 0;

  await history.update({
    status: payload.status || history.status || 'ended',
    endedBy:
      payload.endedBy !== undefined ? normalizeUserId(payload.endedBy) : history.endedBy,
    disconnectReason:
      payload.disconnectReason !== undefined
        ? payload.disconnectReason
        : history.disconnectReason,
    endedAt,
    answeredAt,
    durationSeconds,
    metadata: stringifyMetadata({
      ...(parseMetadata(history.metadata) || {}),
      ...(payload.metadata || {}),
    }),
  });

  const participants = [history.callerId, history.calleeId].filter(Boolean);
  await Promise.all(
    participants.map(async (userId) => {
      const presence = await UserPresence.findOne({ where: { userId } });
      if (presence) {
        await presence.update({
          currentCallRoomId: null,
        });
      }
      await syncPresence(userId);
    })
  );

  return history.reload();
}

async function listPresenceByUserIds(userIds = []) {
  const normalizedIds = Array.from(
    new Set(userIds.map(normalizeUserId).filter(Boolean))
  );

  if (normalizedIds.length === 0) {
    return [];
  }

  const presences = await UserPresence.findAll({
    where: {
      userId: {
        [Op.in]: normalizedIds,
      },
    },
    order: [['displayName', 'ASC']],
  });

  return presences.map((presence) => ({
    userId: presence.userId,
    displayName: presence.displayName,
    avatar: presence.avatar,
    status: presence.status,
    isAvailable: presence.isAvailable,
    socketCount: presence.socketCount,
    activeDeviceCount: presence.activeDeviceCount,
    pushDeviceCount: presence.pushDeviceCount,
    currentCallRoomId: presence.currentCallRoomId,
    lastSeenAt: presence.lastSeenAt,
    metadata: parseMetadata(presence.metadata),
  }));
}

async function listUserCallHistory(userId, limit = 30) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return [];
  }

  const histories = await CallHistory.findAll({
    where: {
      [Op.or]: [{ callerId: normalizedUserId }, { calleeId: normalizedUserId }],
    },
    order: [['updatedAt', 'DESC']],
    limit,
  });

  return histories.map((history) => ({
    id: history.id,
    roomId: history.roomId,
    callerId: history.callerId,
    calleeId: history.calleeId,
    callerName: history.callerName,
    calleeName: history.calleeName,
    callType: history.callType,
    status: history.status,
    endedBy: history.endedBy,
    disconnectReason: history.disconnectReason,
    ringingStartedAt: history.ringingStartedAt,
    answeredAt: history.answeredAt,
    endedAt: history.endedAt,
    durationSeconds: history.durationSeconds,
    metadata: parseMetadata(history.metadata),
    createdAt: history.createdAt,
    updatedAt: history.updatedAt,
  }));
}

async function getDashboardStats(extra = {}) {
  const [availableUsers, onlineUsers, busyUsers] = await Promise.all([
    UserPresence.count({ where: { isAvailable: true } }),
    UserPresence.count({ where: { status: 'online' } }),
    UserPresence.count({ where: { status: 'busy' } }),
  ]);

  return {
    availableUsers,
    onlineUsers,
    busyUsers,
    activeCalls: extra.activeCallsCount || 0,
    connectedSockets: extra.connectedSockets || 0,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildDisplayName,
  clearSocket,
  finalizeCall,
  getActiveTokensForUser,
  getDashboardStats,
  listPresenceByUserIds,
  listUserCallHistory,
  markCallAccepted,
  markSocketConnected,
  logoutDevice,
  normalizeUserId,
  registerDevice,
  syncPresence,
  upsertCallHistory,
};
