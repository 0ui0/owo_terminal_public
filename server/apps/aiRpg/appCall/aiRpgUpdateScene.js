import Joi from "joi";

export default {
  name: "更新RPG场景_地图和事件",
  id: "aiRpgUpdateScene",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj);
    if (error) {
      return "错误：" + error.details[0].message;
    }

    const { appId, mapId, events } = value;

    const appManager = (await import("../../../apps/appManager.js")).default;
    const ioServer = (await import("../../../ioServer/ioServer.js")).default;

    const app = appManager.get(appId);
    if (!app) {
      return `Failed: App ${appId} not found or not running.`;
    }

    if (app.type !== 'aiRpg') {
      return `Failed: App ${appId} is not an aiRpg instance.`;
    }

    const appDef = appManager.appDefs.get('aiRpg');

    // Call the bound updateScene method we created earlier on the backend module
    let res = await appDef.backend.updateScene({ mapId, events }, appDef, appId, ioServer.io);

    if (res.success) {
      return "Scene data synced. Frontend RPG Maker iframe will update shortly.";
    } else {
      return `Failed to sync scene: ${res.reason}`;
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("运行中的 aiRpg 实例 ID"),
      mapId: Joi.number().required().description("目标地图 ID（须与 RMMZ 编辑器中的工程地图 ID 一致）"),
      events: Joi.array().items(
        Joi.object({
          id: Joi.number().required().description("唯一事件 ID"),
          x: Joi.number().required().description("X 坐标（0 开始）"),
          y: Joi.number().required().description("Y 坐标（0 开始）"),
          name: Joi.string().required().description("NPC 或物品名称（用于互动上下文）"),
          imageName: Joi.string().required().description("图像文件名（如 'Actor1', 'Monster1', '!Chest'）"),
          imageIndex: Joi.number().required().description("图像网格索引（0-7）")
        })
      ).description("要在地图上生成的 NPC、敌人或物品列表")
    });
  },

  getDoc() {
    return `全量更新 RPG 场景数据，包括切换地图 ID 和重新布防所有事件。通过 WebSocket 瞬间同步到前端。`;
  }
}
