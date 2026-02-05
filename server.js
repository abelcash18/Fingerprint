const express = require('express');
const cors = require('cors');
const base64url = require('base64url');
const {generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse} = require('@simplewebauthn/server');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// In-memory user store for demo only
const users = new Map();
const rpName = 'Fingerprint Demo';
const rpID = 'localhost';
const origin = 'http://localhost:8000'; // adjust if using different port

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

app.post('/generate-registration-options', (req, res) => {
  const {username} = req.body;
  if(!username) return res.status(400).json({error: 'Missing username'});
  let user = users.get(username);
  if(!user){
    user = {id: base64url(Buffer.from(username)), username, devices: []};
    users.set(username, user);
  }

  const options = generateRegistrationOptions({
    rpName,
    rpID,
    userID: user.id,
    userName: user.username,
    attestationType: 'none',
    authenticatorSelection: { userVerification: 'preferred' },
  });

  user.currentChallenge = options.challenge;
  return res.json(options);
});

app.post('/verify-registration', async (req, res) => {
  const {username, attestationResponse} = req.body;
  const user = users.get(username);
  if(!user) return res.status(400).json({error: 'Unknown user'});
  try{
    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    const {verified, registrationInfo} = verification;
    if(verified && registrationInfo){
      const {credentialPublicKey, credentialID, counter} = registrationInfo;
      user.devices.push({credentialID, credentialPublicKey, counter});
      return res.json({verified: true});
    }
    return res.json({verified: false});
  }catch(e){
    return res.status(400).json({error: e.message});
  }
});

app.post('/generate-authentication-options', (req, res) => {
  const {username} = req.body;
  const user = users.get(username);
  if(!user) return res.status(400).json({error: 'Unknown user'});

  const options = generateAuthenticationOptions({
    timeout: 60000,
    rpID,
    userVerification: 'preferred',
    allowCredentials: user.devices.map(d => ({id: d.credentialID, type: 'public-key'})),
  });
  user.currentChallenge = options.challenge;
  return res.json(options);
});

app.post('/verify-authentication', async (req, res) => {
  const {username, assertionResponse} = req.body;
  const user = users.get(username);
  if(!user) return res.status(400).json({error: 'Unknown user'});

  try{
    const dbCred = user.devices.find(d => d.credentialID && Buffer.compare(Buffer.from(d.credentialID), Buffer.from(assertionResponse.rawId)));
    // For demo, pick first device
    const expectedCred = user.devices[0];

    const verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: expectedCred,
    });

    if(verification.verified){
      return res.json({verified: true});
    }
    return res.json({verified: false});
  }catch(e){
    return res.status(400).json({error: e.message});
  }
});

const port = process.env.PORT || 8000;
app.listen(port, ()=> console.log('Server running on port', port));
