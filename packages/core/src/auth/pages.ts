export function registrationPage(options: Record<string, unknown>): string {
  const optionsJson = JSON.stringify(options);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChainVault - Register Passkey</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .card { background: #1e293b; border-radius: 12px; padding: 2rem; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; margin-bottom: 1.5rem; }
    #status { margin-top: 1rem; padding: 1rem; border-radius: 8px; }
    .success { background: #064e3b; color: #6ee7b7; }
    .error { background: #7f1d1d; color: #fca5a5; }
    .pending { background: #1e3a5f; color: #93c5fd; }
  </style>
</head>
<body>
  <div class="card">
    <h1>ChainVault MCP</h1>
    <p>Registering your passkey...</p>
    <div id="status" class="pending">Initiating WebAuthn ceremony...</div>
  </div>
  <script>
    (async () => {
      const status = document.getElementById('status');
      try {
        const options = ${optionsJson};
        // Decode challenge
        options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
        // Decode user.id
        if (options.user && options.user.id) {
          options.user.id = Uint8Array.from(atob(options.user.id.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
        }
        const credential = await navigator.credentials.create({ publicKey: options });
        const response = credential.response;
        const result = {
          id: credential.id,
          rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
          type: credential.type,
          response: {
            attestationObject: btoa(String.fromCharCode(...new Uint8Array(response.attestationObject))),
            clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
          },
        };
        const res = await fetch('/callback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
        if (res.ok) {
          status.textContent = 'Passkey registered successfully! You may close this tab.';
          status.className = 'success';
        } else {
          throw new Error('Server rejected the credential');
        }
      } catch (err) {
        status.textContent = 'Registration failed: ' + (err.message || err);
        status.className = 'error';
      }
    })();
  </script>
</body>
</html>`;
}

export function authenticationPage(options: Record<string, unknown>): string {
  const optionsJson = JSON.stringify(options);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChainVault - Authenticate</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .card { background: #1e293b; border-radius: 12px; padding: 2rem; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; margin-bottom: 1.5rem; }
    #status { margin-top: 1rem; padding: 1rem; border-radius: 8px; }
    .success { background: #064e3b; color: #6ee7b7; }
    .error { background: #7f1d1d; color: #fca5a5; }
    .pending { background: #1e3a5f; color: #93c5fd; }
  </style>
</head>
<body>
  <div class="card">
    <h1>ChainVault MCP</h1>
    <p>Authenticating with your passkey...</p>
    <div id="status" class="pending">Initiating WebAuthn ceremony...</div>
  </div>
  <script>
    (async () => {
      const status = document.getElementById('status');
      try {
        const options = ${optionsJson};
        // Decode challenge
        options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
        // Decode allowCredentials ids
        if (options.allowCredentials) {
          options.allowCredentials = options.allowCredentials.map(c => ({
            ...c,
            id: Uint8Array.from(atob(c.id.replace(/-/g,'+').replace(/_/g,'/')), ch => ch.charCodeAt(0)),
          }));
        }
        const credential = await navigator.credentials.get({ publicKey: options });
        const response = credential.response;
        const result = {
          id: credential.id,
          rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
          type: credential.type,
          response: {
            authenticatorData: btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData))),
            clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
            signature: btoa(String.fromCharCode(...new Uint8Array(response.signature))),
            userHandle: response.userHandle ? btoa(String.fromCharCode(...new Uint8Array(response.userHandle))) : null,
          },
        };
        const res = await fetch('/callback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
        if (res.ok) {
          status.textContent = 'Authentication successful! You may close this tab.';
          status.className = 'success';
        } else {
          throw new Error('Server rejected the credential');
        }
      } catch (err) {
        status.textContent = 'Authentication failed: ' + (err.message || err);
        status.className = 'error';
      }
    })();
  </script>
</body>
</html>`;
}
