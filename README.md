# Fingerprint Scanner Demo with WebAuthn

A biometric fingerprint scanner UI with demo scanning animation and real WebAuthn integration for platform authenticators (fingerprint, face, PIN, etc.).

## Features

- **Animated UI**: Scan-line animation, fingerprint SVG background, and progress tracking
- **Audio feedback**: Beeps during scanning and success tone when complete
- **WebAuthn Integration**: Real system biometric scanner access via Web Authentication API
- **Server-backed**: Registration and authentication flows via Node.js Express server
- **Fallback**: Auto-falls back to simulated scan if WebAuthn is unavailable or cancelled

## Requirements

- Node.js 14+
- npm or yarn

## Installation

1. Navigate to the project folder:
   ```bash
   cd c:\Users\User\Desktop\Fingerprint
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Demo

Start the server:
```bash
npm start
```

The server will start on `http://localhost:8000`. Open it in your browser.

### How to use:

1. **Automatic scan** starts on page load (simulated progress)
2. **Use Biometric button**: Initiates real WebAuthn flow
   - First time: Shows registration prompt to capture your fingerprint/face
   - Subsequent times: Prompts for authentication using your stored biometric
3. **Restart button**: Restarts the simulated scan

## How it works

### Simulated Scan
- Fixed 6-second duration with deterministic progress increments
- Audio beep on each step, success tone at 100%
- Fingerprint background overlay appears while scanning

### WebAuthn Flow
1. **Register**: Server provides registration options → browser calls `navigator.credentials.create()` → user touches sensor → server verifies attestation
2. **Authenticate**: Server provides challenge → browser calls `navigator.credentials.get()` → user touches sensor → server verifies signature

Uses `@simplewebauthn/server` for secure challenge/response handling.

## File structure

```
index.html      - UI markup (buttons, status display, SVG fingerprint)
index.css       - Styles, animations, scanning background
index.js        - Client-side logic (scanning, audio, WebAuthn)
server.js       - Node.js WebAuthn endpoints
package.json    - Dependencies
README.md       - This file
```

## Browser Compatibility

- **WebAuthn**: Chrome/Edge 67+, Safari 13+, Firefox 60+
- **Audio API**: Most modern browsers
- **Requires**: HTTPS (or localhost for testing)

## Notes

- This is a demo implementation for learning/testing purposes
- Storage is in-memory; credentials are lost on server restart
- Real deployments should use a proper database and HTTPS
- Challenge handling follows WebAuthn best practices via simplewebauthn library
