import aiRpgData from "./aiRpgData.js"

const TAG = "[aiRpg Frontend]";

let prefabsData = null;

const loadPrefabs = async () => {
    if (prefabsData) return prefabsData;
    try {
        const res = await fetch('/api/apps/aiRpg/rmmz/data/prefabs.json');
        prefabsData = await res.json();
        console.log(`${TAG} Prefabs loaded:`, Object.keys(prefabsData));
        return prefabsData;
    } catch (err) {
        console.error(`${TAG} Failed to load prefabs:`, err);
        return null;
    }
};

const buildPrefab = (iframe, prefabName, startX, startY) => {
    if (!prefabsData || !prefabsData[prefabName]) {
        console.error(`${TAG} Prefab not found: ${prefabName}`);
        return { success: false, error: `Prefab "${prefabName}" not found` };
    }

    const prefab = prefabsData[prefabName];
    const { width, height, data } = prefab;
    const owoAPI = iframe.contentWindow?.OwoAPI;

    if (!owoAPI) {
        console.error(`${TAG} OwoAPI not available in iframe`);
        return { success: false, error: "OwoAPI not ready" };
    }

    console.log(`${TAG} Building prefab "${prefabName}" at (${startX}, ${startY}), size: ${width}x${height}`);

    const layers = 6;
    for (let z = 0; z < layers; z++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (z * height + y) * width + x;
                const tileId = data[index];

                const targetX = startX + x;
                const targetY = startY + y;

                // For base layer(0), only write if tileId !== 0.
                // For upper layers(1-5), write always (0 will act as eraser).
                if (z > 0 || tileId !== 0) {
                    owoAPI.setTile(targetX, targetY, z, tileId);
                }
            }
        }
    }

    console.log(`${TAG} Prefab "${prefabName}" built successfully`);
    return { success: true, prefab: prefabName, x: startX, y: startY };
};

export default ({ appId, m, Notice, ioSocket, comData, commonData, settingData, Box, iconPark }) => {
    let stats = null;
    let iframe = null;
    let isAiProcessing = false;
    let floatingTexts = [];
    let textIdCounter = 0;

    const redraw = () => m.redraw();

    const unlockAi = () => {
        if (isAiProcessing) {
            isAiProcessing = false;
            redraw();
        }
    };

    const addFloatingText = (text, color) => {
        const id = textIdCounter++;
        floatingTexts.push({ id, text, color });
        redraw();
        setTimeout(() => {
            floatingTexts = floatingTexts.filter(t => t.id !== id);
            redraw();
        }, 3500);
    };

    const handleIframeMessage = async (event) => {
        if (event.data && event.data.type === 'owo_action') {
            console.log(`${TAG} Received Action from Iframe:`, event.data);

            if (isAiProcessing) {
                addFloatingText("AI 思考中，请稍候...", "#ffb74d");
                return;
            }

            if (event.data.action === 'triggerEvent') {
                isAiProcessing = true;
                redraw();
                await settingData.fnCall("appDispatch", [appId, "triggerEvent", event.data.data]);
                setTimeout(unlockAi, 15000); // safety fallback unlock
            }

            if (event.data.action === 'choiceSelected') {
                isAiProcessing = true;
                redraw();
                await settingData.fnCall("appDispatch", [appId, "choiceSelected", event.data.data]);
                setTimeout(unlockAi, 15000);
            }
        }
    };

    const instanceInterface = {
        onDispatch: (msg, callback) => {
            console.log(`${TAG} onDispatch:`, msg);
            const { action, args } = msg;

            switch (action) {
                case 'build_prefab': {
                    unlockAi();
                    const { prefabName, x, y } = args;
                    const result = buildPrefab(iframe, prefabName, x, y);
                    if (callback) callback(result);
                    break;
                }

                case 'scene_updated': {
                    unlockAi();
                    const { mapId, events } = args;
                    console.log(`${TAG} Scene updated: mapId=${mapId}, events=`, events);

                    const owoAPI = iframe?.contentWindow?.OwoAPI;
                    if (owoAPI?.spawnEvent && events?.length > 0) {
                        const spawnedIds = [];
                        for (const evt of events) {
                            const eid = owoAPI.spawnEvent(evt.x, evt.y, evt.name, evt.imageName, evt.imageIndex);
                            if (eid > 0) spawnedIds.push(eid);
                        }
                        console.log(`${TAG} Spawned ${spawnedIds.length} events:`, spawnedIds);
                    }

                    if (callback) callback({ ok: true });
                    break;
                }

                case 'stats_updated': {
                    unlockAi();
                    // Diff checks for floating text updates
                    if (stats && args) {
                        if (args.hp !== stats.hp) {
                            const diff = args.hp - stats.hp;
                            addFloatingText(`HP ${diff > 0 ? '+' : ''}${diff}`, diff > 0 ? '#81c784' : '#e57373');
                        }
                        if (args.mp !== stats.mp) {
                            const diff = args.mp - stats.mp;
                            addFloatingText(`MP ${diff > 0 ? '+' : ''}${diff}`, diff > 0 ? '#64b5f6' : '#e57373');
                        }
                        if (args.gold !== stats.gold) {
                            const diff = args.gold - stats.gold;
                            addFloatingText(`金币 ${diff > 0 ? '+' : ''}${diff}`, diff > 0 ? '#ffd54f' : '#e57373');
                        }
                    }
                    stats = args;
                    redraw();
                    if (callback) callback({ ok: true });
                    break;
                }

                case 'show_message': {
                    unlockAi();
                    const { text, faceImage, faceIndex } = args;
                    const owoAPI = iframe?.contentWindow?.OwoAPI;
                    if (owoAPI?.showMessage) {
                        owoAPI.showMessage(text, faceImage, faceIndex);
                    } else {
                        console.warn(`${TAG} OwoAPI.showMessage not available`);
                    }
                    if (callback) callback({ ok: true });
                    break;
                }

                case 'show_choices': {
                    unlockAi();
                    const { choices, defaultType, cancelType } = args;
                    const owoAPI = iframe?.contentWindow?.OwoAPI;
                    if (owoAPI?.showChoices) {
                        owoAPI.showChoices(choices, defaultType, cancelType);
                    } else {
                        console.warn(`${TAG} OwoAPI.showChoices not available`);
                    }
                    if (callback) callback({ ok: true });
                    break;
                }

                case 'change_map': {
                    unlockAi();
                    const { mapId, x, y } = args;
                    const owoAPI = iframe?.contentWindow?.OwoAPI;
                    if (owoAPI?.changeMap) {
                        owoAPI.changeMap(mapId, x, y);
                    }
                    if (callback) callback({ ok: true });
                    break;
                }

                case 'spawn_event': {
                    unlockAi();
                    const { x, y, name, imageName, imageIndex } = args;
                    const owoAPI = iframe?.contentWindow?.OwoAPI;
                    let eventId = -1;
                    if (owoAPI?.spawnEvent) {
                        eventId = owoAPI.spawnEvent(x, y, name, imageName, imageIndex);
                    }
                    if (callback) callback({ ok: eventId > 0, eventId });
                    break;
                }

                case 'set_map_layout': {
                    unlockAi();
                    const { clearBase, placements } = args;
                    const owoAPI = iframe?.contentWindow?.OwoAPI;
                    if (owoAPI?.getMapDimensions && owoAPI?.setMapData && owoAPI?.getPlayerPosition && prefabsData) {
                        const playerPos = owoAPI.getPlayerPosition();
                        const dim = owoAPI.getMapDimensions();
                        if (dim && dim.data && playerPos) {
                            const { width, height, data } = dim;
                            const newData = [...data];

                            // Check for collisions with player
                            for (const p of placements) {
                                const prefab = prefabsData[p.prefabName];
                                if (!prefab) continue;
                                const pw = prefab.width;
                                const ph = prefab.height;

                                // Simple collision check: if player is within the bounding box of a non-ground placement
                                if (p.prefabName !== "地面" && p.prefabName !== "小草" && p.prefabName !== "小花") {
                                    if (playerPos.x >= p.x && playerPos.x < p.x + pw &&
                                        playerPos.y >= p.y && playerPos.y < p.y + ph) {
                                        const errorMsg = `无法在 (${p.x}, ${p.y}) 放置 [${p.prefabName}]，因为这会将玩家 (${playerPos.x}, ${playerPos.y}) 困在建筑内。请选择其他位置。`;
                                        addFloatingText(errorMsg, "#e57373");
                                        if (callback) callback({ ok: false, error: errorMsg });
                                        return;
                                    }
                                }
                            }

                            // 1. Clear Map if requested
                            if (clearBase) {
                                const basePrefab = prefabsData["地面"];
                                const baseTileId = basePrefab && basePrefab.data && basePrefab.data[0] ? basePrefab.data[0] : 2854;
                                for (let i = 0; i < newData.length; i++) {
                                    // only fill floor at layer 0 (z=0)
                                    const layer = Math.floor(i / (width * height));
                                    newData[i] = (layer === 0) ? baseTileId : 0;
                                }
                            }

                            // 2. Apply placements
                            for (const p of placements) {
                                const prefab = prefabsData[p.prefabName];
                                if (!prefab) continue;
                                const pw = prefab.width;
                                const ph = prefab.height;
                                const pd = prefab.data;

                                for (let z = 0; z < 6; z++) {
                                    for (let py = 0; py < ph; py++) {
                                        for (let px = 0; px < pw; px++) {
                                            const indexP = (z * ph + py) * pw + px;
                                            const tileId = pd[indexP];

                                            const targetX = p.x + px;
                                            const targetY = p.y + py;

                                            // Check boundaries
                                            if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                                                const indexM = (z * height + targetY) * width + targetX;
                                                // Erasure logc: if z > 0 or tileId is not 0
                                                if (z > 0 || tileId !== 0) {
                                                    newData[indexM] = tileId;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            // 3. Commit
                            owoAPI.setMapData(newData);
                        }
                    }
                    if (callback) callback({ ok: true });
                    break;
                }

                case 'getHTML': {
                    const html = iframe ? iframe.innerHTML : "";
                    if (callback) callback({ ok: true, data: html });
                    break;
                }

                default:
                    console.log(`${TAG} Unknown action: ${action}`);
                    if (callback) callback({ ok: false, error: "Unknown action" });
            }
        }
    };

    const init = () => {
        aiRpgData.addTool("commonData", commonData);
        aiRpgData.registerInstances(appId, instanceInterface);
        if (commonData && commonData.registerApp) commonData.registerApp(appId, aiRpgData);

        window.addEventListener('message', handleIframeMessage);
        loadPrefabs();

        // Start player position sync loop
        window.aiRpgPlayerSyncInterval = setInterval(async () => {
            const owoAPI = iframe?.contentWindow?.OwoAPI;
            if (owoAPI?.getPlayerPosition) {
                const pos = owoAPI.getPlayerPosition();
                if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
                    await settingData.fnCall("appDispatch", [appId, "syncPlayer", pos]);
                }
            }
        }, 1000);
    };

    init();

    return {
        oninit(vnode) {
            if (vnode.attrs.data?.stats) {
                stats = vnode.attrs.data.stats;
            }
        },
        onremove() {
            window.removeEventListener('message', handleIframeMessage);
            clearInterval(window.aiRpgPlayerSyncInterval);
            delete window.aiRpgPlayerSyncInterval;
            aiRpgData.unregisterInstances(appId, commonData);
        },
        view(vnode) {
            return m("div", {
                style: {
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "#000",
                    color: "#fff",
                    fontFamily: "monospace",
                    overflow: "hidden"
                }
            }, [
                m("div", {
                    style: {
                        height: "30px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 10px",
                        backgroundColor: "#222",
                        borderBottom: "1px solid #444",
                        flexShrink: 0
                    }
                }, [
                    m("span", { style: { fontWeight: "bold", marginRight: "10px" } }, `AI RPG Engine [${appId}]`),
                    m("span", { style: { color: "#888", fontSize: "12px" } }, "LLM Driven Game Master")
                ]),

                m("div", {
                    style: {
                        display: "flex",
                        flex: 1,
                        overflow: "hidden"
                    }
                }, [
                    m("div", {
                        style: {
                            flex: 1,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            backgroundColor: "#111"
                        }
                    }, [
                        m("style", `
                            @keyframes aiRpgFloatUp {
                                0% { opacity: 0; transform: translate(-50%, 20px) scale(0.8); }
                                10% { opacity: 1; transform: translate(-50%, 0px) scale(1.1); }
                                20% { opacity: 1; transform: translate(-50%, -5px) scale(1); }
                                80% { opacity: 1; transform: translate(-50%, -40px); }
                                100% { opacity: 0; transform: translate(-50%, -60px); }
                            }
                        `),
                        m("div", { style: { position: "relative", width: "816px", height: "624px" } },
                            [
                                m("iframe", {
                                    key: "rpg-iframe",
                                    src: `/api/apps/aiRpg/rmmz/index.html`,
                                    style: {
                                        width: "100%",
                                        height: "100%",
                                        border: "none",
                                        boxShadow: "0 0 10px rgba(0,0,0,0.5)"
                                    },
                                    onload: (e) => {
                                        iframe = e.target;
                                        console.log(`${TAG} Iframe loaded RMMZ engine.`);
                                    }
                                }),

                                // AI Processing Notice Banner
                                isAiProcessing ? m("div", {
                                    key: "ai-banner",
                                    style: {
                                        position: "absolute",
                                        top: "15px",
                                        right: "15px",
                                        backgroundColor: "rgba(0,0,0,0.8)",
                                        color: "#ffb74d",
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        fontSize: "14px",
                                        fontWeight: "bold",
                                        pointerEvents: "none",
                                        zIndex: 100,
                                        border: "1px solid #ffb74d",
                                        boxShadow: "0 2px 8px rgba(255,183,77,0.3)"
                                    }
                                }, [
                                    m("span", { style: { marginRight: "5px" } }, "⚙️"),
                                    "AI 正在编织剧情..."
                                ]) : null,

                                // Floating Texts
                                ...floatingTexts.map((ft, index) => m("div", {
                                    key: "float-" + ft.id,
                                    style: {
                                        position: "absolute",
                                        left: "50%",
                                        top: `calc(35% - ${index * 40}px)`,
                                        transform: "translateX(-50%)",
                                        color: ft.color,
                                        fontSize: "32px",
                                        fontWeight: "900",
                                        textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 4px 10px rgba(0,0,0,0.8)",
                                        pointerEvents: "none",
                                        zIndex: 101,
                                        animation: "aiRpgFloatUp 3.5s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards"
                                    }
                                }, ft.text))
                            ].filter(Boolean)
                        )
                    ]),

                    m("div", {
                        style: {
                            width: "250px",
                            backgroundColor: "#1a1a1a",
                            borderLeft: "1px solid #444",
                            padding: "15px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                            overflowY: "auto"
                        }
                    }, [
                        m("h3", { style: { margin: "0 0 10px 0", color: "#64b5f6", fontSize: "16px" } }, "Player Stats"),

                        m("div", { style: { fontSize: "14px" } }, [
                            m("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "5px" } }, [
                                m("span", "HP"),
                                m("span", { style: { color: "#81c784" } }, `${stats?.hp || 100} / ${stats?.maxHp || 100}`)
                            ]),
                            m("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "5px" } }, [
                                m("span", "MP"),
                                m("span", { style: { color: "#64b5f6" } }, `${stats?.mp || 50} / ${stats?.maxMp || 50}`)
                            ]),
                            m("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "15px" } }, [
                                m("span", "Gold"),
                                m("span", { style: { color: "#ffd54f" } }, `${stats?.gold || 0} G`)
                            ])
                        ]),

                        m("h4", { style: { margin: "0 0 5px 0", color: "#ffb74d", fontSize: "14px" } }, "Inventory"),
                        m("div", {
                            style: { fontSize: "12px", color: "#bbb", fontStyle: "italic" }
                        }, stats?.inventory?.length > 0
                            ? stats.inventory.map(item => m("div", item))
                            : "Empty"
                        )
                    ])
                ])
            ]);
        }
    };
};
