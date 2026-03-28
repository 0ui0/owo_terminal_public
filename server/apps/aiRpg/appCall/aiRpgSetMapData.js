import Joi from "joi";

const PREFABS_LIST = [
    "地面", "小草", "小花",
    "大树", "小树",
    "帐篷", "自动栅栏",
    "房屋样板1", "房屋样板2", "房屋样板3",
    "门_样板1", "门_样板2", "门_样板3", "门_样板4"
];

export default {
    name: "应用RPG地图_批量布局",
    id: "aiRpgSetMapData",

    async fn(argObj) {
        const { value, error } = this.joi().validate(argObj);
        if (error) {
            return "错误：" + error.details[0].message;
        }

        const { appId, clearBase, placements } = value;

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
            action: 'set_map_layout',
            args: { clearBase, placements }
        });

        return `已发送批量布局指令，${clearBase ? "清理了旧地图并" : ""}布置了 ${placements.length} 个环境元素。引擎将在一瞬间完成全图渲染刷新。`;
    },

    joi() {
        return Joi.object({
            appId: Joi.string().required().description("运行中的 aiRpg 实例 ID"),
            clearBase: Joi.boolean().default(true).description("是否先用基础草地涂满并清空已有建筑"),
            placements: Joi.array().items(
                Joi.object({
                    prefabName: Joi.string().valid(...PREFABS_LIST).required().description("预制件名。提示：房屋类通常需在 (x+1,y+3) 或 (x+2,y+4) 处手动额外放置 '门'。"),
                    x: Joi.number().integer().min(0).required().description("物品左上 X 坐标"),
                    y: Joi.number().integer().min(0).required().description("物品左上 Y 坐标")
                })
            ).required().description("全量布局列表。引擎会瞬间完成渲染，不会产生过程动画或卡顿。")
        });
    },

    getDoc() {
        return `高效率地图批量布局接口。你可以一次性构思整张地图的村落、森林布局，然后整合提交 placements。引擎会瞬间刷新全图，非常适合大破大立。`;
    }
}

