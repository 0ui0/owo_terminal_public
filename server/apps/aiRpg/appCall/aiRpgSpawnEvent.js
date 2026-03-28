import Joi from "joi";

export default {
    name: "应用RPG生成交互事件",
    id: "aiRpgSpawnEvent",

    async fn(argObj) {
        const { value, error } = this.joi().validate(argObj);
        if (error) {
            return "错误：" + error.details[0].message;
        }

        const { appId, x, y, name, imageName, imageIndex } = value;

        const appManager = (await import("../../../apps/appManager.js")).default;
        const ioServer = (await import("../../../ioServer/ioServer.js")).default;

        const app = appManager.get(appId);
        if (!app) {
            return `失败：App ${appId} 未找到或未运行。`;
        }
        if (app.type !== 'aiRpg') {
            return `失败：App ${appId} 不是 aiRpg 实例。`;
        }

        // Emit through websockets to the frontend instance
        const eventData = { x, y, name, imageName, imageIndex };
        ioServer.io.emit('app:dispatch', {
            appId: appId,
            action: 'spawn_event',
            args: eventData
        });

        return `已于坐标 (${x}, ${y}) 生成带有 [${name}] 标签的实体 (${imageName}:${imageIndex})。玩家可以靠近与之交互。`;
    },

    joi() {
        return Joi.object({
            appId: Joi.string().required().description("运行中的 aiRpg 实例 ID"),
            x: Joi.number().integer().min(0).required().description("X 坐标（请根据实时情报，避开玩家当前位置坐标，否则会卡死玩家）"),
            y: Joi.number().integer().min(0).required().description("Y 坐标（严禁与玩家当前坐标完全重叠）"),
            name: Joi.string().required().description("实体的显示名称（如：神秘宝箱、村长，用户点击时你会收到此名称）"),
            imageName: Joi.string().allow("").default("").description("图像文件名（留空则为隐形触发器）。人物: 'Actor1'~'Actor3', 'People1'~'People4'。物件: '!Chest', '!Door1', '!Switch1' 等。"),
            imageIndex: Joi.number().integer().min(0).max(7).default(0).description("图像索引（0-7），指在图片网格中的具体角色位置")
        });
    },

    getDoc() {
        return `在当前 RPG 地图中召唤一个可交互实体（Event）。当玩家靠近并点击该实体时，你会收到一条交互系统消息。注意：务必避开玩家立足点。`;
    }
}
