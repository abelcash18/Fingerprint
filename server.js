const express = require('express');
const cors = require('cors');
const base64url = require('base64url');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const users = new Map();
const rpName = 'Fingerprint Demo';

// Ensure your Client origin and rpID match domains perfectly
// If accessing client via 127.0.0.1, use '127.0.0.1' as your rpID
const rpID = '127.0.0.1'; 
const origin = 'http://127.0.0.1:5500'; 

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

// 1. Generate Registration Options
app.post('/generate-registration-options', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Missing username' });

  let user = users.get(username);
  if (!user) {
    user = { id: base64url(Buffer.from(username)), username, devices: [] };
    users.set(username, user);
  }

  try {
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: user.id,
      userName: user.username,
      attestationType: 'none',
      authenticatorSelection: { 
        userVerification: 'preferred',
        residentKey: 'preferred'
      },
    });

    user.currentChallenge = options.challenge;
    return res.json(options);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Verify Registration
app.post('/verify-registration', async (req, res) => {
  const { username, attestationResponse } = req.body;
  const user = users.get(username);
  if (!user) return res.status(400).json({ error: 'Unknown user' });

  try {
    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    const { verified, registrationInfo } = verification;
    if (verified && registrationInfo) {
      const { credentialPublicKey, credentialID, counter } = registrationInfo;
      
      // Store public key as a buffer/uint8array structure safely
      user.devices.push({ 
        credentialID, 
        credentialPublicKey, 
        counter 
      });
      
      user.currentChallenge = null; // Clear challenge after use
      return res.json({ verified: true });
    }
    return res.json({ verified: false });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// 3. Generate Authentication Options
app.post('/generate-authentication-options', async (req, res) => {
  const { username } = req.body;
  const user = users.get(username);
  if (!user || user.devices.length === 0) {
    return res.status(400).json({ error: 'User has no registered biometric devices' });
  }

  try {
    const options = await generateAuthenticationOptions({
      timeout: 60000,
      rpID,
      userVerification: 'preferred',
      allowCredentials: user.devices.map(d => ({
        id: d.credentialID,
        type: 'public-key'
      })),
    });

    user.currentChallenge = options.challenge;
    return res.json(options);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Verify Authentication
app.post('/verify-authentication', async (req, res) => {
  const { username, assertionResponse } = req.body;
  const user = users.get(username);
  if (!user) return res.status(400).json({ error: 'Unknown user' });

  try {
    // Find matching device out of array matching the assertion ID
    const expectedCred = user.devices.find(d => {
      const savedId = typeof d.credentialID === 'string' ? d.credentialID : base64url.encode(d.credentialID);
      return savedId === assertionResponse.id;
    });

    if (!expectedCred) return res.status(400).json({ error: 'Credential not recognized for user' });

    const verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: expectedCred,
    });

    if (verification.verified) {
      // Update device signature counter to prevent replay attacks
      expectedCred.counter = verification.authenticationInfo.newCounter;
      user.currentChallenge = null; 
      return res.json({ verified: true });
    }
    return res.json({ verified: false });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`Server running on port ${port}`));