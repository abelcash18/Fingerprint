       (function(){
            const percentEl = document.getElementById('percent');
            const statusEl = document.getElementById('status');
            const restartBtn = document.getElementById('restart');
            const useBioBtn = document.getElementById('use-bio');
            const fingerprint = document.getElementById('fingerprint');
            const scanContainer = document.querySelector('.scan');

            let value = 0;
            let interval = null;
            let audioCtx = null;

            // create or resume audio context for beeps
            function ensureAudio(){
                if(!audioCtx){
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
            }

            function playBeep(){
                try{
                    ensureAudio();
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.type = 'sine';
                    o.frequency.value = 900;
                    g.gain.value = 0.02;
                    o.connect(g);
                    g.connect(audioCtx.destination);
                    o.start();
                    setTimeout(()=>{ o.stop(); }, 80);
                }catch(e){ /* audio not allowed or unavailable */ }
            }

            function playSuccess(){
                try{
                    ensureAudio();
                    const now = audioCtx.currentTime;
                    const o1 = audioCtx.createOscillator();
                    const o2 = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o1.frequency.value = 600; o2.frequency.value = 950;
                    o1.type = 'sine'; o2.type = 'sine';
                    g.gain.value = 0.04;
                    o1.connect(g); o2.connect(g); g.connect(audioCtx.destination);
                    o1.start(now); o2.start(now);
                    o1.stop(now + 0.18); o2.stop(now + 0.18);
                }catch(e){}
            }

            // deterministic scan: fixed duration and steps
            function startScan({duration = 6000, tick = 120} = {}){
                stopScan();
                value = 0;
                percentEl.textContent = '0%';
                statusEl.textContent = 'Scanning...';
                restartBtn.hidden = true;
                fingerprint.classList.remove('success');
                fingerprint.classList.add('scanning');
                scanContainer.classList.add('scanning');

                const steps = Math.max(1, Math.round(duration / tick));
                const inc = 100 / steps;
                let stepCount = 0;

                interval = setInterval(()=>{
                    stepCount++;
                    value = Math.min(100, +(value + inc).toFixed(2));
                    percentEl.textContent = Math.round(value) + '%';
                    playBeep();
                    if(stepCount >= steps || value >= 100){
                        finishScan();
                    }
                }, tick);
            }

            function stopScan(){
                if(interval){
                    clearInterval(interval);
                    interval = null;
                }
            }

            function finishScan(){
                stopScan();
                fingerprint.classList.remove('scanning');
                fingerprint.classList.add('success');
                scanContainer.classList.remove('scanning');
                scanContainer.classList.add('success');
                statusEl.textContent = 'Access Granted';
                percentEl.textContent = '100%';
                restartBtn.hidden = false;
                playSuccess();
            }

            restartBtn.addEventListener('click', ()=>{
                fingerprint.classList.remove('success');
                scanContainer.classList.remove('success');
                startScan();
            });

            // Helpers for WebAuthn buffer encoding/decoding
            function base64ToBuffer(base64){
                const str = atob(base64);
                const buf = new Uint8Array(str.length);
                for(let i=0;i<str.length;i++) buf[i] = str.charCodeAt(i);
                return buf.buffer;
            }

            function arrayBufferToBase64(buf){
                const bytes = new Uint8Array(buf);
                let str = '';
                for(let i=0;i<bytes.byteLength;i++) str += String.fromCharCode(bytes[i]);
                return btoa(str);
            }

            // WebAuthn via server endpoints for real biometric scanning
            useBioBtn.addEventListener('click', async ()=>{
                stopScan();
                const username = 'demo-user';
                statusEl.textContent = 'Preparing biometric...';
                percentEl.textContent = '';

                try{
                    // Try to get authentication options from server
                    const authOptsResp = await fetch('/generate-authentication-options', {
                        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username})
                    });

                    if(!authOptsResp.ok){
                        // No credential registered — register first
                        statusEl.textContent = 'Registering fingerprint...';
                        const regResp = await fetch('/generate-registration-options', {
                            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username})
                        });
                        if(!regResp.ok) throw new Error('Failed to generate registration options');
                        const regOptions = await regResp.json();
                        
                        // Convert challenge and user.id to ArrayBuffer
                        if(regOptions.challenge) regOptions.challenge = Uint8Array.from(atob(regOptions.challenge), c=>c.charCodeAt(0));
                        if(regOptions.user && regOptions.user.id) regOptions.user.id = Uint8Array.from(atob(regOptions.user.id), c=>c.charCodeAt(0));
                        
                        const cred = await navigator.credentials.create({publicKey: regOptions});
                        if(!cred) throw new Error('Registration cancelled');

                        const attestationResponse = {
                            id: cred.id,
                            rawId: arrayBufferToBase64(cred.rawId),
                            response: {
                                clientDataJSON: arrayBufferToBase64(cred.response.clientDataJSON),
                                attestationObject: arrayBufferToBase64(cred.response.attestationObject),
                            },
                            type: cred.type
                        };

                        const verifyRegResp = await fetch('/verify-registration', {
                            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username, attestationResponse})
                        });
                        const verifyRegJson = await verifyRegResp.json();
                        if(!verifyRegJson.verified) throw new Error('Registration verification failed');

                        statusEl.textContent = 'Fingerprint registered — authenticating...';
                        await new Promise(r => setTimeout(r, 700));
                        useBioBtn.click(); // Retry authentication
                        return;
                    }

                    // Get authentication options
                    const authOptions = await authOptsResp.json();
                    statusEl.textContent = 'Scanning fingerprint...';

                    // Convert challenge and allowCredentials
                    if(authOptions.challenge) authOptions.challenge = base64ToBuffer(authOptions.challenge);
                    if(authOptions.allowCredentials){
                        authOptions.allowCredentials = authOptions.allowCredentials.map(c=>({
                            id: base64ToBuffer(c.id),
                            type: c.type,
                            transports: c.transports
                        }));
                    }

                    const assertion = await navigator.credentials.get({publicKey: authOptions});
                    if(!assertion) throw new Error('Authentication cancelled');

                    const assertionResponse = {
                        id: assertion.id,
                        rawId: arrayBufferToBase64(assertion.rawId),
                        response: {
                            authenticatorData: arrayBufferToBase64(assertion.response.authenticatorData),
                            clientDataJSON: arrayBufferToBase64(assertion.response.clientDataJSON),
                            signature: arrayBufferToBase64(assertion.response.signature),
                            userHandle: assertion.response.userHandle ? arrayBufferToBase64(assertion.response.userHandle) : null
                        },
                        type: assertion.type
                    };

                    const verifyResp = await fetch('/verify-authentication', {
                        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username, assertionResponse})
                    });
                    const verifyJson = await verifyResp.json();

                    if(verifyJson && verifyJson.verified){
                        statusEl.textContent = 'Biometric Verified';
                        percentEl.textContent = '100%';
                        fingerprint.classList.add('success');
                        scanContainer.classList.add('success');
                        playSuccess();
                        restartBtn.hidden = false;
                    }else{
                        statusEl.textContent = 'Verification failed — fallback';
                        setTimeout(()=> startScan(), 900);
                    }
                }catch(err){
                    console.error(err);
                    statusEl.textContent = (err && err.message) ? err.message : 'Biometric failed';
                    setTimeout(()=> startScan(), 900);
                }
            });

            // start automatically
            window.addEventListener('load', ()=> startScan());
        })();
    