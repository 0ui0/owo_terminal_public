import { socketOnChat } from "../../ioServer/ioApis/chat/ioApi_chat.js";
import comData from "../../comData/comData.js";
import appManager from "../appManager.js";

const TAG = "App_aiRpg";

export default {
    async init(app, appManager) {
        // Initialize state
        app.data.sceneData = null; // Stores current map, tiles, events
        app.data.playerStats = null; // Stores hp, mp, etc.
        console.log(`[${TAG}] App ${app.id} initialized.`);
    },

    async dispatch({ app, action, args, appManager, io }) {
        console.log(`[${TAG}] Dispatch Action: ${action}`, args);

        switch (action) {
            case 'triggerEvent': {
                const { eventId, eventName, x, y, mapId } = args;
                console.log(`[${TAG}] Player triggered event ${eventName} (ID: ${eventId}) at x:${x}, y:${y} on map ${mapId}`);

                const posInfo = app.data.playerPos ? `[系统情报：当前玩家站立在坐标 X:${app.data.playerPos.x}, Y:${app.data.playerPos.y}。若你需要在他附近生成建筑或事件，请避开这个中心点以免发生卡死。] ` : '';
                const messageToAI = `${posInfo}[aiRpg:${app.id}] 玩家在坐标 (x:${x}, y:${y}) 碰触/调查了地图上的物件 [${eventName}]。这是一次自由交互，请你作为 GameMaster (DM) 根据当前地图的设定和玩家的举动，动态生成接下来的剧情发展后果，如：直接向用户讲话、弹出一个选项 (使用 aiRpgShowChoices 工具)、或者甚至使用 aiRpgBuild 工具在旁边突然变出一个宝箱/怪物。请尽量生动和自然！`;

                const targetListId = comData.data.get().targetChatListId || 0;

                socketOnChat({
                    inputText: messageToAI,
                    name: "头显界面(AI-RPG)",
                    group: "user",
                    sendMode: "agent",
                    call: null,
                    isSystemCall: true,
                    targetChatListId: targetListId
                }).catch(err => {
                    console.error(`[${TAG}] 唤醒 AI 失败:`, err);
                });

                return { success: true, message: "Event routed to AI Game Master." };
            }
            case 'choiceSelected': {
                const { choiceIndex, choiceText } = args;
                console.log(`[${TAG}] Player selected choice ${choiceIndex}: ${choiceText}`);

                const posInfo = app.data.playerPos ? `[系统情报：当前玩家站立在坐标 X:${app.data.playerPos.x}, Y:${app.data.playerPos.y}。] ` : '';
                const messageToAI = `${posInfo}[aiRpg:${app.id}] 对于你给出的剧情分支，玩家做出了选择，选了第 ${choiceIndex} 项: "${choiceText}"。请顺着这个选择推进故事走向。`;

                const targetListId = comData.data.get().targetChatListId || 0;

                socketOnChat({
                    inputText: messageToAI,
                    name: "头显界面(AI-RPG)",
                    group: "user",
                    sendMode: "agent",
                    call: null,
                    isSystemCall: true,
                    targetChatListId: targetListId
                }).catch(err => {
                    console.error(`[${TAG}] 唤醒 AI 失败:`, err);
                });

                return { success: true, message: "Choice routed to AI Game Master." };
            }
            case 'syncPlayer': {
                const { x, y, mapId } = args;
                app.data.playerPos = { x, y, mapId };
                // We do not log this purely positional sync to avoid too much noise, just return success
                return { success: true };
            }
            case 'log': {
                console.log(`[${TAG}] Frontend Log: ${args.message}`);
                return { success: true };
            }
            case 'action_complete': {
                return { success: true };
            }
            case 'get_scene': {
                return { success: true, sceneData: app.data.sceneData };
            }
            case 'get_stats': {
                return { success: true, playerStats: app.data.playerStats };
            }
            default:
                return { success: false, reason: "unknown action" };
        }
    },

    async updateScene({ mapId, events }, appDef, appId, io) {
        const app = appManager.get(appId);
        if (app) app.data.sceneData = { mapId, events };

        io.emit('app:dispatch', {
            appId: appId,
            action: 'scene_updated',
            args: { mapId, events }
        });
        return { success: true };
    },

    async updateStats(stats, appDef, appId, io) {
        const app = appManager.get(appId);
        if (app) app.data.playerStats = stats;

        io.emit('app:dispatch', {
             appId: appId,
             action: 'stats_updated',
             args: stats
        });
        return { success: true };
    }
}
