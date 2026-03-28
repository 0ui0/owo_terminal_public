import Joi from "joi";
import comData from "../../../comData/comData.js";
import aiBasic from "../../../tools/aiAsk/basic.js";
import subAgents from "../../../tools/aiAsk/subAgents.js";

export default {
    name: "显示RPG选项对话框",
    id: "aiRpgShowChoices",

    async fn(argObj) {
        const { value, error } = this.joi().validate(argObj);
        if (error) {
            return "错误：" + error.details[0].message;
        }

        const { appId, choices, defaultType, cancelType } = value;

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
            action: 'show_choices',
            args: { choices, defaultType, cancelType }
        });

        // 强行切断大模型当前回复流，等待玩家进行选择
        const targetListId = comData.data.get().targetChatListId || 0;
        let targetModel = targetListId > 0 ? subAgents.get(targetListId) : aiBasic.list.find((model) => model.name === comData.data.get().currentModel);
        if (targetModel) {
            targetModel.stopRun();
        }

        return `已发送选项对话框指令：显示 ${choices.length} 个选项 [${choices.join(', ')}]。玩家选择后将发送消息通知你。`;
    },

    joi() {
        return Joi.object({
            appId: Joi.string().required().description("运行中的 aiRpg 实例 ID"),
            choices: Joi.array().items(Joi.string()).min(2).max(6).required().description("选项列表（2-6 个字符串选项）"),
            defaultType: Joi.number().integer().min(0).default(0).description("默认选中项索引（按确定键时直接选中）"),
            cancelType: Joi.number().integer().min(-1).default(-1).description("取消时返回的索引（-1 表示取消时返回最后一个选项）")
        });
    },

    getDoc() {
        return `在 RPG 游戏中显示选项对话框，让玩家进行选择。`;
    }
}
