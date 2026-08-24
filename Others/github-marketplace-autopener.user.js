// ==UserScript==
// @name        GitHub Marketplace Auto-Opener (Upgraded)
// @namespace   GitHub Marketplace
// @version     2.0.0
// @match       https://github.com/marketplace*
// @grant       none
// @author      Nabhan
// @description Smart, future-proof automation without hardcoded sleeps.
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        // Bulletproof selector: targets the URL pattern, not fragile CSS classes
        linkSelector  : 'a[href^="/marketplace/models/"]',
        inputSelector : 'input[aria-label="Mini Playground Prompt Input"]',
        messageToType : 'Hello World',
        typeDelay     : 80,
        windowWidth   : 900,
        windowHeight  : 650,
    };

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // 🎯 The Smart Wait Weapon
    async function waitForElement(selector, timeout = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(100); // Micro-nap
        }
        return null; // Fail gracefully if it never shows up
    }

    // ─── POPUP PAGE LOGIC ───────────────────────────────────────────
    if (window.opener && location.pathname.includes('/marketplace/models/')) {

        async function run() {
            // Instantly strikes when the input appears. No blind 3-second nap.
            const input = await waitForElement(CONFIG.inputSelector, 5000);
            if (!input) return console.error("Target input not found.");

            input.focus();
            await sleep(200);

            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));

            // Type like a human
            for (const char of CONFIG.messageToType) {
                input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                setter.call(input, input.value + char);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                await sleep(CONFIG.typeDelay);
            }

            // Note: If you ever want it to be 100% autonomous, just add `window.close();` here.
        }

        // Run immediately or wait for DOM to be ready
        document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', run) : run();
    }

    // ─── MAIN PAGE LOGIC ────────────────────────────────────────────
    if (!window.opener && location.pathname === '/marketplace') {

        // Inject Start button
        const btn = document.createElement('button');
        btn.textContent = '▶ Start Auto-Opener';
        btn.style.cssText = `
            position: fixed; top: 15px; right: 15px; z-index: 999999;
            background: #238636; color: #fff; border: none;
            padding: 10px 16px; border-radius: 8px;
            font-size: 13px; font-weight: 700; cursor: pointer;
        `;
        document.body.appendChild(btn);

        btn.addEventListener('click', async () => {
            // Grab all model links directly, skipping the wrapper cards entirely
            const links = [...document.querySelectorAll(CONFIG.linkSelector)];
            if (!links.length) return alert('No model links found!');

            btn.disabled = true;

            for (let i = 0; i < links.length; i++) {
                btn.textContent = `🔄 Running ${i + 1}/${links.length} — close popup to continue`;

                // Highlight the parent container so you know which one is active
                const card = links[i].closest('article') || links[i].parentElement;
                if (card) card.style.outline = '3px solid #58a6ff';

                await openAndWait(links[i].href);

                if (card) card.style.outline = '';
                await sleep(500); // Brief pause before firing the next popup
            }

            btn.textContent = '✅ All done!';
        });

        function openAndWait(url) {
            return new Promise((resolve) => {
                const left = Math.round((screen.width  - CONFIG.windowWidth)  / 2);
                const top  = Math.round((screen.height - CONFIG.windowHeight) / 2);

                const popup = window.open(
                    url,
                    `ao_${Date.now()}`,
                    `width=${CONFIG.windowWidth},height=${CONFIG.windowHeight},left=${left},top=${top}`
                );

                if (!popup) {
                    alert('Popup blocked! Please allow popups for github.com');
                    return resolve();
                }

                // Clean, brutal polling. No messy postMessage logic required.
                const poll = setInterval(() => {
                    if (popup.closed) {
                        clearInterval(poll);
                        resolve();
                    }
                }, 300);
            });
        }
    }
})();
