const express = require('express');
const AWS = require('aws-sdk');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const AWS_REGION = String(process.env.AWS_REGION || 'ap-south-1').trim() || 'ap-south-1';
const EC2_ENDPOINT = `https://ec2.${AWS_REGION}.amazonaws.com`;

function requireAwsConfig() {
  const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY || '').trim();
  const secretAccessKey = String(process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY || '').trim();
  const sessionToken = String(process.env.AWS_SESSION_TOKEN || '').trim();
  const instanceId = String(process.env.EC2_INSTANCE_ID || '').trim();

  if (!accessKeyId || !secretAccessKey || !instanceId) {
    const error = new Error('AWS live class server configuration is incomplete. Set AWS_ACCESS_KEY_ID or AWS_ACCESS_KEY, AWS_SECRET_ACCESS_KEY or AWS_SECRET_KEY, and EC2_INSTANCE_ID.');
    error.statusCode = 500;
    throw error;
  }

  return { accessKeyId, secretAccessKey, sessionToken, instanceId };
}

function normalizeAwsError(error) {
  const message = String(error?.message || '').trim();
  const code = String(error?.code || '').trim();

  if (code === 'UnknownEndpoint' || /Inaccessible host/i.test(message)) {
    const nextError = new Error(`Unable to reach AWS EC2 endpoint for region ${AWS_REGION}. Check AWS_REGION, internet/DNS access from the backend, and that the EC2 service endpoint ${EC2_ENDPOINT} is reachable.`);
    nextError.statusCode = 502;
    return nextError;
  }

  if (code === 'AuthFailure' || code === 'UnauthorizedOperation' || code === 'InvalidClientTokenId' || code === 'SignatureDoesNotMatch') {
    const nextError = new Error('AWS credentials were rejected while contacting EC2. Verify the configured access key, secret key, and IAM permissions for this instance.');
    nextError.statusCode = 502;
    return nextError;
  }

  return error;
}

function createEc2Client() {
  const { accessKeyId, secretAccessKey, sessionToken } = requireAwsConfig();
  return new AWS.EC2({
    region: AWS_REGION,
    accessKeyId,
    secretAccessKey,
    sessionToken: sessionToken || undefined,
    endpoint: new AWS.Endpoint(EC2_ENDPOINT),
    sslEnabled: true,
    signatureVersion: 'v4',
    maxRetries: 2,
    httpOptions: {
      timeout: 15000,
      connectTimeout: 5000
    }
  });
}

async function describeInstance() {
  const { instanceId } = requireAwsConfig();
  const ec2 = createEc2Client();
  const response = await ec2.describeInstances({ InstanceIds: [instanceId] }).promise().catch((error) => {
    throw normalizeAwsError(error);
  });
  const reservation = Array.isArray(response.Reservations) ? response.Reservations[0] : null;
  const instance = Array.isArray(reservation?.Instances) ? reservation.Instances[0] : null;

  if (!instance) {
    const error = new Error('Configured EC2 instance was not found.');
    error.statusCode = 404;
    throw error;
  }

  return instance;
}

function serializeInstance(instance) {
  return {
    instanceId: String(instance?.InstanceId || '').trim(),
    state: String(instance?.State?.Name || 'unknown').trim(),
    publicIpAddress: String(instance?.PublicIpAddress || '').trim(),
    publicDnsName: String(instance?.PublicDnsName || '').trim(),
    launchTime: instance?.LaunchTime || null,
    instanceType: String(instance?.InstanceType || '').trim(),
    availabilityZone: String(instance?.Placement?.AvailabilityZone || '').trim(),
    region: AWS_REGION
  };
}

async function stopServerIfRunning() {
  const { instanceId } = requireAwsConfig();
  const ec2 = createEc2Client();
  const instance = await describeInstance();
  const currentState = String(instance?.State?.Name || '').trim();

  if (currentState === 'stopped' || currentState === 'stopping') {
    return {
      ok: true,
      message: currentState === 'stopped' ? 'EC2 instance is already stopped.' : 'EC2 instance is already stopping.',
      server: serializeInstance(instance)
    };
  }

  await ec2.stopInstances({ InstanceIds: [instanceId] }).promise().catch((error) => {
    throw normalizeAwsError(error);
  });

  return {
    ok: true,
    message: 'EC2 instance stop requested successfully.',
    server: {
      ...serializeInstance(instance),
      state: 'stopping'
    }
  };
}

router.get('/server-status', authenticateToken(), async (req, res) => {
  try {
    const instance = await describeInstance();
    return res.json({ ok: true, server: serializeInstance(instance) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to get EC2 server status.' });
  }
});

router.post('/start-server', authenticateToken('admin'), async (req, res) => {
  try {
    const { instanceId } = requireAwsConfig();
    const ec2 = createEc2Client();
    const instance = await describeInstance();
    const currentState = String(instance?.State?.Name || '').trim();

    if (currentState === 'running' || currentState === 'pending') {
      return res.json({
        ok: true,
        message: currentState === 'running' ? 'EC2 instance is already running.' : 'EC2 instance is already starting.',
        server: serializeInstance(instance)
      });
    }

    await ec2.startInstances({ InstanceIds: [instanceId] }).promise().catch((error) => {
      throw normalizeAwsError(error);
    });
    return res.json({
      ok: true,
      message: 'EC2 instance start requested successfully.',
      server: {
        ...serializeInstance(instance),
        state: 'pending'
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to start EC2 instance.' });
  }
});

router.post('/stop-server', authenticateToken('admin'), async (req, res) => {
  try {
    return res.json(await stopServerIfRunning());
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to stop EC2 instance.' });
  }
});

router.describeInstance = describeInstance;
router.serializeInstance = serializeInstance;
router.stopServerIfRunning = stopServerIfRunning;

module.exports = router;