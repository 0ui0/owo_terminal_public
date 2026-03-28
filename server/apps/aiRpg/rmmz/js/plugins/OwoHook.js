//=============================================================================
// OwoHook.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Hooks into RPG Maker MZ events and bridges them to the parent window.
 * @author AI
 *
 * @help
 * This plugin disables normal RPG Maker interactions and instead
 * sends a postMessage to the parent iframe when the player hits
 * the action button on an event.
 */

(() => {
    const TAG = "[OwoHook]";
    console.log(`${TAG} Plugin Initializing...`);


    // ==============================================================================
    // 1. Disable Title Screen and Boot Directly to Map
    // ==============================================================================
    Scene_Boot.prototype.startNormalGame = function() {
        this.checkPlayerLocation();
        DataManager.setupNewGame();
        
        // Skip Title Screen
        SceneManager.goto(Scene_Map);
        Window_TitleCommand.initCommandPosition();
    };

    // ==============================================================================
    // 2. Hide Unnecessary UI Elements
    // ==============================================================================
    // Disable the menu button/touch UI
    Scene_Map.prototype.createButtons = function() {
        // Do nothing, preventing the menu button from showing up on mobile/touch
    };

    // Disable opening the menu
    Scene_Map.prototype.callMenu = function() {
        // Do nothing
    };


    // ==============================================================================
    // 3. Hijack Event Interactions (Space / Enter)
    // ==============================================================================
    const _Game_Player_triggerAction = Game_Player.prototype.triggerAction;
    Game_Player.prototype.triggerAction = function() {
        if (this.canMove()) {
            if (this.triggerButtonAction()) {
                return true;
            }
            if (this.triggerTouchAction()) {
                return true;
            }
        }
        return false;
    };


    // Hook into the actual "Check for Events in front of player"
    Game_Player.prototype.triggerButtonAction = function() {
        if (Input.isTriggered("ok")) {
            if (this.getOnOffVehicle()) {
                return true;
            }
            this.checkEventTriggerHere([0]);
            if ($gameMap.setupStartingEvent()) {
                return true;
            }
            // THIS is the main interaction check (facing direction)
            this.checkEventTriggerThere([0, 1, 2]);
            if ($gameMap.setupStartingEvent()) {
                return true;
            }
        }
        return false;
    };


    // Overwrite the event trigger logic specifically for "There" (in front)
    Game_Player.prototype.checkEventTriggerThere = function(triggers) {
        if (this.canStartLocalEvents()) {
            const direction = this.direction();
            const x1 = this.x;
            const y1 = this.y;
            const x2 = $gameMap.roundXWithDirection(x1, direction);
            const y2 = $gameMap.roundYWithDirection(y1, direction);
            this.startMapEvent(x2, y2, triggers, true);
        }
    };

    // This is the core hijack function where we intercept the normal event start
    Game_Player.prototype.startMapEvent = function(x, y, triggers, normal) {
        if (!$gameMap.isEventRunning()) {
            for (const event of $gameMap.eventsXy(x, y)) {
                if (
                    event.isTriggerIn(triggers) &&
                    event.isNormalPriority() === normal
                ) {
                    
                    // ======================================================
                    // OWO HOOK: Stop normal execution, send to parent window
                    // ======================================================
                    const eventData = {
                        eventId: event.eventId(),
                        eventName: event.event().name,
                        x: event.x,
                        y: event.y,
                        mapId: $gameMap.mapId()
                    };
                    
                    console.log(`${TAG} Intercepted Action on Event:`, eventData);

                    // Show Exclamation (balloon ID 1) immediately on the event
                    if ($gameTemp) {
                        $gameTemp.requestBalloon(event, 1);
                    }

                    // Send to Mithril wrapper
                    if (window.parent) {
                        window.parent.postMessage({
                            type: 'owo_action',
                            action: 'triggerEvent',
                            data: eventData
                        }, '*');
                    }

                    // Normally here event.start() would be called to run the RPG Maker event list,
                    // but we DO NOT call it, making the RMMZ event completely dummy.
                    return; 
                }
            }
        }
    };


    // Prevent events from auto-running or parallel running
    Game_Event.prototype.start = function() {
        // Intentionally left blank to disable ALL native Event commands
    };


    // ==============================================================================
    // 4. API for external control (From parent Mithril Wrapper)
    // ==============================================================================
    window.OwoAPI = {
        _messageQueue: [],
        _isProcessingQueue: false,

        // 按显示宽度将长文本拆分成多行（中文字符算2宽度，其他算1）
        _splitTextLines: function(text, maxWidth) {
            if (!text) return [""];
            const lines = [];
            let currentLine = "";
            let currentWidth = 0;

            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (ch === '\n') {
                    lines.push(currentLine);
                    currentLine = "";
                    currentWidth = 0;
                    continue;
                }
                // 中文/全角字符算 2 宽度
                const charWidth = ch.charCodeAt(0) > 0x7F ? 2 : 1;
                if (currentWidth + charWidth > maxWidth) {
                    lines.push(currentLine);
                    currentLine = ch;
                    currentWidth = charWidth;
                } else {
                    currentLine += ch;
                    currentWidth += charWidth;
                }
            }
            if (currentLine) lines.push(currentLine);
            return lines.length > 0 ? lines : [""];
        },

        _processQueue: function() {
            if (this._messageQueue.length === 0) {
                this._isProcessingQueue = false;
                return;
            }
            if ($gameMessage.isBusy()) {
                // Wait and try again
                setTimeout(() => this._processQueue(), 200);
                return;
            }

            this._isProcessingQueue = true;
            const item = this._messageQueue.shift();

            if (item.type === 'message') {
                if (item.faceImage) {
                    $gameMessage.setFaceImage(item.faceImage, item.faceIndex);
                }
                // 自动拆行：有头像时每行约 14 个中文字，无头像约 18 个中文字
                const maxWidth = item.faceImage ? 28 : 36;
                const lines = this._splitTextLines(item.text, maxWidth);
                const maxLinesPerPage = 4;

                // 当前页添加前 4 行
                const firstPageLines = lines.slice(0, maxLinesPerPage);
                for (const line of firstPageLines) {
                    $gameMessage.add(line);
                }

                // 剩余行作为后续消息重新排入队列（倒序插入队首）
                for (let p = Math.ceil(lines.length / maxLinesPerPage) - 1; p >= 1; p--) {
                    const pageLines = lines.slice(p * maxLinesPerPage, (p + 1) * maxLinesPerPage);
                    this._messageQueue.unshift({
                        type: 'message',
                        text: pageLines.join('\n'),
                        faceImage: item.faceImage,
                        faceIndex: item.faceIndex,
                        _preSplit: true // 标记已拆分，避免重复拆
                    });
                }

                setTimeout(() => this._processQueue(), 500);
            } else if (item.type === 'choices') {
                $gameMessage.setChoices(item.choices, item.defaultType, item.cancelType);
                $gameMessage.setChoiceCallback((n) => {
                    console.log(`${TAG} Player selected choice: ${n}`);
                    if (window.parent) {
                        window.parent.postMessage({
                            type: 'owo_action',
                            action: 'choiceSelected',
                            data: { choiceIndex: n, choiceText: item.choices[n] }
                        }, '*');
                    }
                    setTimeout(() => this._processQueue(), 200); // Resume queue after choice
                });
            }
        },

        changeMap: function(mapId, x = 0, y = 0) {
            $gamePlayer.reserveTransfer(mapId, x, y, 0, 0);
        },
        
        showMessage: function(text, faceImage = null, faceIndex = 0) {
            if (!$gameMessage) return;
            this._messageQueue.push({ type: 'message', text, faceImage, faceIndex });
            if (!this._isProcessingQueue) {
                this._processQueue();
            }
        },
        
        clearMessage: function() {
            if ($gameMessage) {
                $gameMessage.clear();
                this._messageQueue = []; // clear pending queues as well
                this._isProcessingQueue = false;
            }
        },
        
        showChoices: function(choices, defaultType = 0, cancelType = 1) {
            if (!$gameMessage) return;
            this._messageQueue.push({ type: 'choices', choices, defaultType, cancelType });
            if (!this._isProcessingQueue) {
                this._processQueue();
            }
        },
        
        setTile: function(x, y, z, tileId) {
            // z: 0=Base(A) 1=Lower(A,B) 2=Upper(B,C) 3=Top(B,C) 4=Shadow 5=Region
            if ($dataMap && $dataMap.data) {
                const width = $dataMap.width;
                const height = $dataMap.height;
                if (x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z <= 5) {
                    const index = (z * height + y) * width + x;
                    $dataMap.data[index] = tileId;
                    
                    // Force the tilemap renderer to refresh
                    if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset) {
                        SceneManager._scene._spriteset._tilemap.refresh();
                    }
                }
            }
        },

        setMapData: function(dataArray) {
            if ($dataMap && $dataMap.data && Array.isArray(dataArray)) {
                if (dataArray.length === $dataMap.data.length) {
                    for (let i = 0; i < dataArray.length; i++) {
                        $dataMap.data[i] = dataArray[i];
                    }
                    if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset) {
                        SceneManager._scene._spriteset._tilemap.refresh();
                    }
                } else {
                    console.error(TAG + " setMapData length mismatch. Expected " + $dataMap.data.length + " but got " + dataArray.length);
                }
            }
        },

        getMapDimensions: function() {
            if ($dataMap) {
                return { width: $dataMap.width, height: $dataMap.height, data: $dataMap.data };
            }
            return null;
        },
        
        spawnEvent: function(x, y, name, imageName, imageIndex) {
            if (!$dataMap || !$gameMap) return -1;
            
            // Generate a free event ID
            let newEventId = 1;
            while ($dataMap.events[newEventId]) {
                newEventId++;
            }
            
            // Craft minimal viable RMMZ Event Data Object
            const eventData = {
                id: newEventId,
                name: name || ("Spawned_" + newEventId),
                note: "<owo_ai>",
                pages: [{
                    conditions: {
                        actorId: 1, actorValid: false, itemId: 1, itemValid: false,
                        switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
                        variableId: 1, variableValid: false, variableValue: 0
                    },
                    directionFix: false,
                    image: {
                        tileId: 0,
                        characterName: imageName || "",
                        characterIndex: imageIndex || 0,
                        direction: 2,
                        pattern: 1
                    },
                    list: [{ code: 0, indent: 0, parameters: [] }],
                    moveFrequency: 3, moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
                    moveSpeed: 3, moveType: 0, priorityType: 1, stepAnime: false,
                    through: false, trigger: 0, walkAnime: true
                }],
                x: x,
                y: y
            };
            
            $dataMap.events[newEventId] = eventData;
            
            // Instantiate in Game logic
            const gameEvent = new Game_Event($gameMap.mapId(), newEventId);
            $gameMap._events[newEventId] = gameEvent;
            
            // Force redraw on sprite map
            if (SceneManager._scene instanceof Scene_Map) {
                const spriteset = SceneManager._scene._spriteset;
                if (spriteset && spriteset._characterSprites) {
                    const sprite = new Sprite_Character(gameEvent);
                    spriteset._characterSprites.push(sprite);
                    spriteset._tilemap.addChild(sprite);
                }
            }
            return newEventId;
        },

        getPlayerPosition: function() {
            if ($gamePlayer) {
                return { x: $gamePlayer.x, y: $gamePlayer.y, mapId: $gameMap.mapId() };
            }
            return null;
        },
        
        playBgm: function(bgmName, volume = 90, pitch = 100) {
            if (AudioManager) {
                const bgm = { name: bgmName, volume: volume, pitch: pitch };
                AudioManager.playBgm(bgm);
            }
        },
        
        playSe: function(seName, volume = 90, pitch = 100) {
            if (AudioManager) {
                const se = { name: seName, volume: volume, pitch: pitch };
                AudioManager.playSe(se);
            }
        }
    };

})();
