import Joi from "joi";

const PREFABS_LIST = [
    "地面", "小草", "小花", 
    "大树", "小树", 
    "帐篷", "自动栅栏", 
    "房屋样板1", "房屋样板2", "房屋样板3",
    "门_样板1", "门_样板2", "门_样板3", "门_样板4"
];

export default {
    name: "建造RPG预制件",
    id: "aiRpgBuild",

    async fn(argObj) {
        const { value, error } = this.joi().validate(argObj);
        if (error) {
            return "错误：" + error.details[0].message;
        }

        const { appId, prefabName, x, y } = value;

        const appManager = (await import("../../../apps/appManager.js")).default;
        const ioServer = (await import("../../../ioServer/ioServer.js")).default;

        const app = appManager.get(appId);
        if (!app) {
            return `失败：App ${appId} 未找到或未运行。`;
        }
        if (app.type !== 'aiRpg') {
            return `失败：App ${appId} 不是 aiRpg 实例。`;
        }

        ioServer.io.emit('app:dispatch', {
            appId: appId,
            action: 'build_prefab',
            args: { prefabName, x, y }
        });

        return `已发送建造指令：在坐标 (${x}, ${y}) 建造预制件 "${prefabName}"。请等待前端渲染完成。`;
    },

    joi() {
        return Joi.object({
            appId: Joi.string().required().description("运行中的 aiRpg App 实例 ID"),
            prefabName: Joi.string().valid(...PREFABS_LIST).required().description(`预制件名称，可选：${PREFABS_LIST.join(", ")}`),
            x: Joi.number().integer().min(0).required().description("目标 X 坐标（0-indexed）"),
            y: Joi.number().integer().min(0).required().description("目标 Y 坐标（0-indexed）")
        });
    },

    getDoc() {
        return `在 RPG 地图上建造指定的预制件（建筑、装饰物等）。

可用预制件列表：
- 地面、小草、小花 (1x1)
- 大树 (2x2)、小树 (1x2)
- 帐篷 (3x3)、自动栅栏 (3x3)
- 房屋样板1 (3x4)、房屋样板2 (3x4)、房屋样板3 (5x5)
- 门_样板1/2/3/4 (1x1)

注意：建造大型预制件时，请确保目标位置有足够空间，避免覆盖重要内容。`;
    }
}
