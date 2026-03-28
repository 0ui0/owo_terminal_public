import Joi from "joi";

export default {
    name: "显示RPG对话框",
    id: "aiRpgShowDialogue",

    async fn(argObj) {
        const { value, error } = this.joi().validate(argObj);
        if (error) {
            return "错误：" + error.details[0].message;
        }

        const { appId, text, faceImage, faceIndex } = value;

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
            action: 'show_message',
            args: { text, faceImage, faceIndex }
        });

        return `已发送对话框指令：显示文本 "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`;
    },

    joi() {
        return Joi.object({
            appId: Joi.string().required().description("运行中的 aiRpg 实例 ID"),
            text: Joi.string().required().description("对话框要显示的文本内容（支持部分 markdown）"),
            faceImage: Joi.string().description("头像文件名（如 'Actor1'，对应工程 img/faces/ 目录）"),
            faceIndex: Joi.number().integer().min(0).max(7).description("头像在 2x4 图片网格中的索引（0-7）")
        });
    },

    getDoc() {
        return `在 RPG 画面底部显示对话框。示例：{ text: "你好，冒险者！", faceImage: "Actor1", faceIndex: 0 }`;
    }
}
