// ==UserScript==
// @name         Cookie Auto-Merger & JSON Editor
// @version      3.3
// @description  Farm-Bot
// @author       Photon#3452
// @match        *://*.cookieapp.ru/*
// @match        *://cookie-app.ru/*
// @icon         https://www.vk.com/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let interceptedResolve = null;
    let interceptedData = null;
    let uiTextArea = null;
    let uiStatusText = null;
    let uiSendBtn = null;

    function modifyGameData(data) {
        if (!data || !data.game) return data;

        if (Array.isArray(data.game.prices)) {
            data.game.prices.forEach(p => {
                p.price = 0;
                p.pow = 0;
            });
        } else if (data.game.prices && typeof data.game.prices === 'object') {
            if ('price' in data.game.prices) data.game.prices.price = 0;
            if ('pow' in data.game.prices) data.game.prices.pow = 0;
        }

        let locations = data.game.locations || data.locations;
        if (Array.isArray(locations)) {
            if (locations.length === 0) {
                while (locations.length < 24) {
                    locations.push({ plate: 9999 });
                }
            } else {
                locations.forEach(loc => {
                    if (loc) {
                        loc.plate = 9999;
                    }
                });
            }
        } else if (locations && typeof locations === 'object') {
            Object.keys(locations).forEach(key => {
                if (locations[key]) {
                    locations[key].plate = 9999;
                }
            });
        }

        return data;
    }

    function processInterceptedInit(data, resolveFn) {
        let processedData = modifyGameData(data);
        interceptedData = processedData;

        if (uiTextArea) {
            uiTextArea.value = JSON.stringify(processedData, null, 2);
        }

        const shouldPause = localStorage.getItem('cookie_pause_on_init') === 'true';

        if (shouldPause && resolveFn) {
            interceptedResolve = resolveFn;
            if (uiStatusText) {
                uiStatusText.innerText = 'Пакет задерживается! Отредактируйте и нажмите Отправить.';
                uiStatusText.style.color = '#f9e2af';
            }
            if (uiSendBtn) {
                uiSendBtn.disabled = false;
                uiSendBtn.style.opacity = '1';
            }
        } else {
            if (uiStatusText) {
                uiStatusText.innerText = 'Пакет обработан автоматически';
                uiStatusText.style.color = '#a6e3a1';
            }
            if (resolveFn) {
                resolveFn(processedData);
            }
        }
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = args[0];
        const options = args[1] || {};

        if (options.method === 'OPTIONS') {
            return originalFetch(...args);
        }

        if (typeof url === 'string' && url.includes('/api/') && url.includes('/init')) {
            try {
                const response = await originalFetch(...args);
                if (response.status === 200) {
                    let data = await response.clone().json();

                    return new Promise((resolve) => {
                        processInterceptedInit(data, (finalData) => {
                            const newHeaders = new Headers(response.headers);
                            newHeaders.delete('content-length');
                            resolve(new Response(JSON.stringify(finalData), {
                                status: response.status,
                                statusText: response.statusText,
                                headers: newHeaders
                            }));
                        });
                    });
                }
                return response;
            } catch (e) {
                return originalFetch(...args);
            }
        }
        return originalFetch(...args);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (method !== 'OPTIONS' && typeof url === 'string' && url.includes('/api/') && url.includes('/init')) {
            this.addEventListener('readystatechange', function() {
                if (this.readyState === 4 && this.status === 200) {
                    try {
                        let data = JSON.parse(this.responseText);
                        let finalData = data;

                        processInterceptedInit(data, null);

                        const shouldPause = localStorage.getItem('cookie_pause_on_init') === 'true';
                        if (shouldPause) {
                            alert('XHR init приостановлен. Отредактируйте JSON в панели и нажмите OK для отправки.');
                            if (uiTextArea) {
                                try { finalData = JSON.parse(uiTextArea.value); } catch(err) {}
                            }
                        } else {
                            finalData = modifyGameData(data);
                        }

                        const responseString = JSON.stringify(finalData);
                        Object.defineProperty(this, 'responseText', { get: () => responseString, configurable: true });
                        Object.defineProperty(this, 'response', { get: () => responseString, configurable: true });
                    } catch (e) {}
                }
            });
        }
        return originalOpen.apply(this, [method, url, ...args]);
    };

    if (!document.querySelector('.cookie-app') && !window.location.hostname.includes('cookieapp.ru')) {
        return;
    }

    const mockMethods = [
        'VKWebAppShowStoryBox',
        'VKWebAppShowWallPostBox',
        'VKWebAppShowOrderBox',
        'VKWebAppAddToHomeScreen',
        'VKWebAppShowBannerAd',
        'VKWebAppShowNativeAds'
    ];

    const patchBridge = bridge => {
        if (!bridge || bridge._patched) return;
        const originalSend = bridge.send;
        if (typeof originalSend === 'function') {
            bridge.send = function(method, params) {
                if (mockMethods.includes(method)) {
                    return Promise.resolve({ result: true });
                }
                return originalSend.apply(this, arguments);
            };
            bridge._patched = true;
        }
    };

    const patchVK = vk => {
        if (!vk || vk._patched) return;
        vk.callMethod = function() {
            return;
        };
        vk._patched = true;
    };

    let currentBridge = window.vkBridge;
    if (currentBridge) patchBridge(currentBridge);
    Object.defineProperty(window, 'vkBridge', {
        get: () => currentBridge,
        set: val => {
            currentBridge = val;
            patchBridge(currentBridge);
        },
        configurable: true
    });

    let currentConnect = window.VKConnect;
    if (currentConnect) patchBridge(currentConnect);
    Object.defineProperty(window, 'VKConnect', {
        get: () => currentConnect,
        set: val => {
            currentConnect = val;
            patchBridge(currentConnect);
        },
        configurable: true
    });

    let currentVK = window.VK;
    if (currentVK) patchVK(currentVK);
    Object.defineProperty(window, 'VK', {
        get: () => currentVK,
        set: val => {
            currentVK = val;
            patchVK(currentVK);
        },
        configurable: true
    });

    const initScript = () => {
        if (!document.querySelector('.cookie-app')) return;

        const delay = ms => new Promise(r => setTimeout(r, ms));

        const existingPanel = document.getElementById('cookie-merger-panel');
        if (existingPanel) existingPanel.remove();

        function findPairs() {
            const container = document.querySelector('.plate-container');
            if (!container) return [];
            const items = Array.from(container.querySelectorAll('.biscuit-item'));
            const groups = {};

            items.forEach(item => {
                const classList = Array.from(item.classList);
                const typeClass = classList.find(c => c.startsWith('biscuit-icon-type-'));
                if (typeClass) {
                    const type = typeClass.replace('biscuit-icon-type-', '');
                    if (!groups[type]) groups[type] = [];
                    groups[type].push(item);
                }
            });

            const sortedTypes = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
            const result = [];
            sortedTypes.forEach(type => {
                const list = groups[type];
                while (list.length >= 2) {
                    result.push([list.pop(), list.pop()]);
                }
            });
            return result;
        }

        function createMockEvent(el, type, x, y) {
            const isTouch = type.startsWith('touch');
            const opt = {
                bubbles: true,
                cancelable: !isTouch,
                clientX: x,
                clientY: y,
                screenX: x,
                screenY: y,
                view: window,
                button: 0,
                buttons: 1,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            };

            let native;
            if (type.startsWith('pointer')) {
                native = new PointerEvent(type, opt);
            } else if (type.startsWith('mouse')) {
                native = new MouseEvent(type, opt);
            } else {
                const touch = new Touch({
                    identifier: 1,
                    target: el,
                    clientX: x,
                    clientY: y,
                    screenX: x,
                    screenY: y,
                    pageX: x + window.scrollX,
                    pageY: y + window.scrollY
                });
                native = new TouchEvent(type, {
                    bubbles: true,
                    cancelable: false,
                    view: window,
                    touches: [touch],
                    targetTouches: [touch],
                    changedTouches: [touch]
                });
            }

            const override = (obj, prop, val) => {
                Object.defineProperty(obj, prop, { get: () => val, configurable: true });
            };

            override(native, 'clientX', x);
            override(native, 'clientY', y);
            override(native, 'pageX', x + window.scrollX);
            override(native, 'pageY', y + window.scrollY);
            override(native, 'target', el);
            override(native, 'currentTarget', el);
            override(native, 'cancelable', !isTouch);

            Object.defineProperty(native, 'preventDefault', { value: () => {}, configurable: true });
            Object.defineProperty(native, 'stopPropagation', { value: () => {}, configurable: true });

            return {
                target: el,
                currentTarget: el,
                clientX: x,
                clientY: y,
                pageX: x + window.scrollX,
                pageY: y + window.scrollY,
                button: 0,
                buttons: 1,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                bubbles: true,
                cancelable: !isTouch,
                preventDefault: () => {},
                stopPropagation: () => {},
                persist: () => {},
                nativeEvent: native
            };
        }

        function triggerReactEvent(el, suffix, mockEvent) {
            if (!el) return;
            const key = Object.keys(el).find(k => k.startsWith('__reactProps') || k.startsWith('__reactFiber'));
            if (!key) return;
            const root = el[key];
            const candidates = [root, root.memoizedProps, root.pendingProps].filter(Boolean);

            candidates.forEach(props => {
                for (const prop in props) {
                    if (prop.startsWith('on') && prop.toLowerCase().endsWith(suffix.toLowerCase()) && typeof props[prop] === 'function') {
                        try {
                            props[prop](mockEvent);
                        } catch (e) {}
                    }
                }
            });
        }

        function executeEvent(el, type, x, y) {
            const ev = createMockEvent(el, type, x, y);
            try { el.dispatchEvent(ev.nativeEvent); } catch (e) {}
            const suffix = type.replace('pointer', '').replace('mouse', '').replace('touch', '');
            triggerReactEvent(el, suffix, ev);
        }

        function clickItem(item) {
            if (!item) return;
            try { item.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' }); } catch (e) {}

            const r = item.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            const evClick = createMockEvent(item, 'click', x, y);

            triggerReactEvent(item, 'click', evClick);
            triggerReactEvent(item, 'down', evClick);
            triggerReactEvent(item, 'start', evClick);
            triggerReactEvent(item, 'up', evClick);
            triggerReactEvent(item, 'end', evClick);

            try { item.click(); } catch (e) {}
        }

        function handlePopups() {
            const whirlpool = document.querySelector('.whirlpool, .biggest-page');
            if (whirlpool) {
                const proceedBtn = whirlpool.querySelector('.proceed-button');
                if (proceedBtn && proceedBtn.textContent.trim() === 'Отлично!') {
                    clickItem(proceedBtn);
                    setTimeout(() => {
                        if (whirlpool && whirlpool.parentNode) whirlpool.style.display = 'none';
                    }, 200);
                }
            }
        }

        function handleQuests() {
            const tracker = document.querySelector('.button-task-tracker');
            if (!tracker) return;
            const animate = tracker.querySelector('.task-complete-animate');
            if (animate && animate.classList.contains('active')) clickItem(tracker);
        }

        function autoBuy() {
            const noSpace = document.querySelector('.no-free-space');
            if (noSpace && noSpace.classList.contains('active')) return;

            const tabShop = document.querySelector('.tab-shop');
            const menuShop = document.querySelector('.menu-shop');
            if (!menuShop && tabShop) {
                tabShop.click();
                return;
            }

            const shopItems = Array.from(document.querySelectorAll('.menu-shop .menu-shop-item'));
            if (shopItems.length === 0) return;

            const strategy = buyTypeSelect.value;
            if (strategy === 'last') {
                const lastItem = shopItems[shopItems.length - 1];
                if (lastItem) clickItem(lastItem);
            } else if (strategy === 'first') {
                const firstItem = shopItems[0];
                if (firstItem) clickItem(firstItem);
            } else if (strategy === 'fixed') {
                const targetLevelStr = String(buyLevelInput.value);
                const targetItem = shopItems.find(item => {
                    const typeEl = item.querySelector('.type');
                    return typeEl && typeEl.textContent.trim() === targetLevelStr;
                });
                if (targetItem) clickItem(targetItem);
            } else if (strategy === 'affordable') {
                const affordableItem = shopItems.slice().reverse().find(item => {
                    const isDisabled = item.classList.contains('disabled') || item.classList.contains('locked');
                    const style = window.getComputedStyle(item);
                    const isGreyed = style.opacity && parseFloat(style.opacity) < 0.9;
                    const isFilterGrey = style.filter && (style.filter.includes('grayscale') || style.filter.includes('blur'));
                    return !isDisabled && !isGreyed && !isFilterGrey;
                });
                if (affordableItem) {
                    clickItem(affordableItem);
                } else {
                    const firstItem = shopItems[0];
                    if (firstItem) clickItem(firstItem);
                }
            }
        }

        async function triggerDrag(from, to) {
            const r1 = from.getBoundingClientRect();
            const r2 = to.getBoundingClientRect();
            const x1 = r1.left + r1.width / 2;
            const y1 = r1.top + r1.height / 2;
            const x2 = r2.left + r2.width / 2;
            const y2 = r2.top + r2.height / 2;

            const fromParent = from.parentNode || from;
            const toParent = to.parentNode || to;

            executeEvent(from, 'touchstart', x1, y1);
            executeEvent(from, 'pointerdown', x1, y1);
            executeEvent(from, 'mousedown', x1, y1);
            executeEvent(fromParent, 'touchstart', x1, y1);
            executeEvent(fromParent, 'pointerdown', x1, y1);
            executeEvent(fromParent, 'mousedown', x1, y1);
            await delay(10);

            const targets = [from, fromParent, toParent, to, document, window];
            const movedItem = document.querySelector('.moved-biscuit-item');
            if (movedItem) targets.push(movedItem);
            targets.forEach(t => {
                executeEvent(t, 'touchmove', x2, y2);
                executeEvent(t, 'pointermove', x2, y2);
                executeEvent(t, 'mousemove', x2, y2);
            });
            await delay(10);

            executeEvent(to, 'pointerover', x2, y2);
            executeEvent(to, 'mouseover', x2, y2);
            executeEvent(toParent, 'pointerover', x2, y2);
            executeEvent(toParent, 'mouseover', x2, y2);
            await delay(10);

            try { from.releasePointerCapture(1); } catch (e) {}
            try { fromParent.releasePointerCapture(1); } catch (e) {}
            if (movedItem) { try { movedItem.releasePointerCapture(1); } catch (e) {} }

            const upTargets = [from, fromParent, to, toParent, document.getElementById('root'), document, window];
            if (movedItem) upTargets.push(movedItem);
            upTargets.forEach(target => {
                if (!target) return;
                executeEvent(target, 'touchend', x2, y2);
                executeEvent(target, 'pointerup', x2, y2);
                executeEvent(target, 'mouseup', x2, y2);
            });
            await delay(10);

            executeEvent(to, 'click', x2, y2);
            executeEvent(toParent, 'click', x2, y2);
        }

        const panel = document.createElement('div');
        panel.id = 'cookie-merger-panel';
        Object.assign(panel.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: '999999',
            backgroundColor: '#181825',
            color: '#cdd6f4',
            borderRadius: '10px',
            padding: '15px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            fontFamily: 'system-ui, sans-serif',
            width: '280px',
            userSelect: 'none',
            border: '1px solid #45475a'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            fontWeight: 'bold',
            marginBottom: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px'
        });
        header.innerText = 'Cookie Merger v2';

        const closeBtn = document.createElement('button');
        closeBtn.innerText = '✕';
        Object.assign(closeBtn.style, {
            background: 'none',
            border: 'none',
            color: '#f38ba8',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
        });
        closeBtn.addEventListener('click', () => { panel.style.display = 'none'; });
        header.appendChild(closeBtn);
        panel.appendChild(header);

        const container = document.createElement('div');
        Object.assign(container.style, { display: 'flex', flexDirection: 'column', gap: '10px' });

        const row1 = document.createElement('label');
        Object.assign(row1.style, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' });
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = localStorage.getItem('cookie_merge_active') === 'true';
        row1.appendChild(checkbox);
        row1.appendChild(document.createTextNode('Авто-слияние'));
        container.appendChild(row1);

        const rowBuy = document.createElement('label');
        Object.assign(rowBuy.style, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' });
        const buyCheckbox = document.createElement('input');
        buyCheckbox.type = 'checkbox';
        buyCheckbox.checked = localStorage.getItem('cookie_buy_active') === 'true';
        rowBuy.appendChild(buyCheckbox);
        rowBuy.appendChild(document.createTextNode('Авто-покупка'));
        container.appendChild(rowBuy);

        const rowBuyType = document.createElement('div');
        Object.assign(rowBuyType.style, { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' });
        const buyTypeLabel = document.createElement('span');
        buyTypeLabel.innerText = 'Режим авто-покупки:';
        rowBuyType.appendChild(buyTypeLabel);

        const buyTypeSelect = document.createElement('select');
        Object.assign(buyTypeSelect.style, {
            backgroundColor: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '4px', padding: '2px 4px', fontSize: '12px', cursor: 'pointer', outline: 'none'
        });

        const optLast = document.createElement('option'); optLast.value = 'last'; optLast.innerText = 'Самая последняя'; buyTypeSelect.appendChild(optLast);
        const optFirst = document.createElement('option'); optFirst.value = 'first'; optFirst.innerText = 'Самая первая (ур. 1)'; buyTypeSelect.appendChild(optFirst);
        const optFixed = document.createElement('option'); optFixed.value = 'fixed'; optFixed.innerText = 'Выбранный уровень'; buyTypeSelect.appendChild(optFixed);
        const optAffordable = document.createElement('option'); optAffordable.value = 'affordable'; optAffordable.innerText = 'Доступная по балансу'; buyTypeSelect.appendChild(optAffordable);

        buyTypeSelect.value = localStorage.getItem('cookie_buy_type') || 'last';
        rowBuyType.appendChild(buyTypeSelect);
        container.appendChild(rowBuyType);

        const rowBuyLevel = document.createElement('div');
        Object.assign(rowBuyLevel.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' });
        const buyLevelLabel = document.createElement('span');
        buyLevelLabel.innerText = 'Уровень покупки:';
        rowBuyLevel.appendChild(buyLevelLabel);

        const buyLevelInput = document.createElement('input');
        buyLevelInput.type = 'number'; buyLevelInput.min = '1'; buyLevelInput.max = '284';
        buyLevelInput.value = localStorage.getItem('cookie_buy_level') || '1';
        Object.assign(buyLevelInput.style, {
            backgroundColor: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '4px', width: '50px', padding: '2px 4px', textAlign: 'center', outline: 'none'
        });
        rowBuyLevel.appendChild(buyLevelInput);
        container.appendChild(rowBuyLevel);

        const toggleBuyLevelRow = () => { rowBuyLevel.style.display = buyTypeSelect.value === 'fixed' ? 'flex' : 'none'; };
        toggleBuyLevelRow();
        buyTypeSelect.addEventListener('change', () => {
            localStorage.setItem('cookie_buy_type', buyTypeSelect.value);
            toggleBuyLevelRow();
        });
        buyLevelInput.addEventListener('input', () => { localStorage.setItem('cookie_buy_level', buyLevelInput.value); });

        const rowQuest = document.createElement('label');
        Object.assign(rowQuest.style, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' });
        const questCheckbox = document.createElement('input');
        questCheckbox.type = 'checkbox';
        questCheckbox.checked = localStorage.getItem('cookie_quest_active') === 'true';
        rowQuest.appendChild(questCheckbox);
        rowQuest.appendChild(document.createTextNode('Авто-квесты'));
        container.appendChild(rowQuest);

        const rowSkip = document.createElement('label');
        Object.assign(rowSkip.style, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' });
        const skipCheckbox = document.createElement('input');
        skipCheckbox.type = 'checkbox';
        skipCheckbox.checked = localStorage.getItem('cookie_skip_active') === 'true';
        rowSkip.appendChild(skipCheckbox);
        rowSkip.appendChild(document.createTextNode('Авто-скип'));
        container.appendChild(rowSkip);

        const hr = document.createElement('div');
        Object.assign(hr.style, { borderTop: '1px solid #45475a', margin: '5px 0' });
        container.appendChild(hr);

        const rowPauseInit = document.createElement('label');
        Object.assign(rowPauseInit.style, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#fab387' });
        const pauseInitCheckbox = document.createElement('input');
        pauseInitCheckbox.type = 'checkbox';
        pauseInitCheckbox.checked = localStorage.getItem('cookie_pause_on_init') === 'true';
        rowPauseInit.appendChild(pauseInitCheckbox);
        rowPauseInit.appendChild(document.createTextNode('Пауза при загрузке'));
        container.appendChild(rowPauseInit);

        uiStatusText = document.createElement('div');
        Object.assign(uiStatusText.style, { fontSize: '11px', color: '#a6adc8', minHeight: '15px' });
        uiStatusText.innerText = 'Ожидание пакета init...';
        container.appendChild(uiStatusText);

        uiTextArea = document.createElement('textarea');
        Object.assign(uiTextArea.style, {
            width: '100%', height: '120px', backgroundColor: '#11111b', color: '#a6e3a1',
            border: '1px solid #45475a', borderRadius: '6px', fontFamily: 'monospace',
            fontSize: '11px', padding: '5px', resize: 'vertical', outline: 'none', boxSizing: 'border-box'
        });
        uiTextArea.placeholder = '{ "status": "No data intercepted yet" }';
        container.appendChild(uiTextArea);

        uiSendBtn = document.createElement('button');
        uiSendBtn.innerText = 'Отправить пакет в игру';
        uiSendBtn.disabled = true;
        Object.assign(uiSendBtn.style, {
            width: '100%', padding: '6px', backgroundColor: '#a6e3a1', color: '#11111b',
            border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
            fontSize: '12px', opacity: '0.5', transition: 'opacity 0.2s'
        });
        container.appendChild(uiSendBtn);

        uiSendBtn.addEventListener('click', () => {
            if (interceptedResolve) {
                try {
                    let editedData = JSON.parse(uiTextArea.value);
                    interceptedResolve(editedData);
                    uiStatusText.innerText = 'Пакет успешно отправлен!';
                    uiStatusText.style.color = '#a6e3a1';
                } catch (err) {
                    uiStatusText.innerText = 'Ошибка JSON! Исправьте синтаксис.';
                    uiStatusText.style.color = '#f38ba8';
                    return;
                }
                interceptedResolve = null;
                uiSendBtn.disabled = true;
                uiSendBtn.style.opacity = '0.5';
            }
        });

        if (interceptedData) {
            uiTextArea.value = JSON.stringify(interceptedData, null, 2);
            if (interceptedResolve) {
                uiSendBtn.disabled = false;
                uiSendBtn.style.opacity = '1';
                uiStatusText.innerText = 'Пакет задерживается! Отредактируйте и нажмите Отправить.';
                uiStatusText.style.color = '#f9e2af';
            } else {
                uiStatusText.innerText = 'Отображен прошлый сохраненный пакет';
            }
        }

        const row2 = document.createElement('div');
        Object.assign(row2.style, { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' });
        const delayLabel = document.createElement('span');
        row2.appendChild(delayLabel);

        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = '0'; slider.max = '3000'; slider.step = '100';
        slider.value = localStorage.getItem('cookie_merge_delay') || '1000';
        Object.assign(slider.style, { cursor: 'pointer', width: '100%' });
        row2.appendChild(slider);
        container.appendChild(row2);

        const updateLabel = () => { delayLabel.innerText = 'Задержка бота: ' + slider.value + ' мс'; };
        updateLabel();

        panel.appendChild(container);
        document.body.appendChild(panel);

        checkbox.addEventListener('change', () => { localStorage.setItem('cookie_merge_active', checkbox.checked); });
        buyCheckbox.addEventListener('change', () => { localStorage.setItem('cookie_buy_active', buyCheckbox.checked); });
        skipCheckbox.addEventListener('change', () => { localStorage.setItem('cookie_skip_active', skipCheckbox.checked); });
        questCheckbox.addEventListener('change', () => { localStorage.setItem('cookie_quest_active', questCheckbox.checked); });
        pauseInitCheckbox.addEventListener('change', () => { localStorage.setItem('cookie_pause_on_init', pauseInitCheckbox.checked); });
        slider.addEventListener('input', () => { updateLabel(); localStorage.setItem('cookie_merge_delay', slider.value); });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'F2' || e.key === '`') panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });

        let active = false;
        async function loop() {
            if (!active) {
                active = true;
                if (skipCheckbox.checked) { try { handlePopups(); } catch (e) {} }
                if (questCheckbox.checked) { try { handleQuests(); } catch (e) {} }
                if (buyCheckbox.checked) { try { autoBuy(); } catch (e) {} }
                if (checkbox.checked) {
                    const pairs = findPairs();
                    if (pairs.length > 0) {
                        const [b1, b2] = pairs[0];
                        await triggerDrag(b1, b2);
                    }
                }
                active = false;
            }
            setTimeout(loop, parseInt(slider.value));
        }
        loop();
    };

    window.addEventListener('DOMContentLoaded', () => { initScript(); });
    setTimeout(() => { initScript(); }, 1500);
})();