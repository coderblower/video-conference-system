const callingRepository = require('../services/callingRepository');

function parseUserIds(rawUserIds) {
  if (!rawUserIds) {
    return [];
  }

  if (Array.isArray(rawUserIds)) {
    return rawUserIds;
  }

  return String(rawUserIds)
    .split(',')
    .map((userId) => userId.trim())
    .filter(Boolean);
}

exports.registerDevice = async (req, res) => {
  try {
    const device = await callingRepository.registerDevice(req.body || {});
    res.status(200).json({
      success: true,
      device,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.logoutDevice = async (req, res) => {
  try {
    await callingRepository.logoutDevice(req.body || {});
    res.status(200).json({
      success: true,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getPresence = async (req, res) => {
  try {
    const userIds = parseUserIds(req.query.userIds);
    const presences = await callingRepository.listPresenceByUserIds(userIds);
    res.status(200).json({
      success: true,
      presences,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCallHistory = async (req, res) => {
  try {
    const userId = req.params.userId || req.query.userId;
    const limit = Number(req.query.limit || 30);
    const history = await callingRepository.listUserCallHistory(userId, limit);
    res.status(200).json({
      success: true,
      history,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const dashboard = await callingRepository.getDashboardStats();
    res.status(200).json({
      success: true,
      dashboard,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
