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

            // Try WebAuthn biometric auth. Note: requires HTTPS and a previously-registered credential.
            useBioBtn.addEventListener('click', async ()=>{
                stopScan();
                statusEl.textContent = 'Waiting for biometric...';
                percentEl.textContent = '';
                // Attempt platform authenticator
                if(!window.PublicKeyCredential || !navigator.credentials){
                    statusEl.textContent = 'WebAuthn not supported — falling back';
                    setTimeout(()=> startScan(), 900);
                    return;
                }

                try{
                    // create a random challenge for this demo — a real app must use server-provided challenge
                    const challenge = new Uint8Array(32);
                    window.crypto.getRandomValues(challenge);
                    const publicKey = {
                        challenge: challenge,
                        timeout: 60000,
                        userVerification: 'preferred'
                    };

                    const cred = await navigator.credentials.get({publicKey});
                    if(cred){
                        // success — show granted state
                        statusEl.textContent = 'Biometric Verified';
                        percentEl.textContent = '100%';
                        fingerprint.classList.add('success');
                        scanContainer.classList.add('success');
                        playSuccess();
                        restartBtn.hidden = false;
                    }else{
                        statusEl.textContent = 'No credential — fallback to scan';
                        setTimeout(()=> startScan(), 800);
                    }
                }catch(err){
                    // NotAllowedError or other — fallback
                    statusEl.textContent = (err && err.message) ? err.message : 'Biometric failed';
                    setTimeout(()=> startScan(), 900);
                }
            });

            // start automatically
            window.addEventListener('load', ()=> startScan());
        })();
    