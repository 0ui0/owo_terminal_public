import Joi from "joi";

export default {
  name: "更新RPG玩家角色状态",
  id: "aiRpgUpdateStats",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj);
    if (error) {
      return "错误：" + error.details[0].message;
    }

    const { appId, hp, maxHp, mp, maxMp, gold, inventory } = value;

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

    const statsObj = { hp, maxHp, mp, maxMp, gold, inventory };
    Object.keys(statsObj).forEach(key => statsObj[key] === undefined && delete statsObj[key]);

    // Call the updateStats method we designed on the backend
    let res = await appDef.backend.updateStats(statsObj, appDef, appId, ioServer.io);

    if (res.success) {
      return "Player stats panel updated successfully.";
    } else {
      return "Failed to update player stats.";
    }
  },

  joi() {
    return Joi.object({
      appId: Joi.string().required().description("运行中的 aiRpg 实例 ID"),
      hp: Joi.number().description("当前 HP"),
      maxHp: Joi.number().description("最大 HP"),
      mp: Joi.number().description("当前 MP"),
      maxMp: Joi.number().description("最大 MP"),
      gold: Joi.number().description("当前金钱"),
      inventory: Joi.array().items(Joi.string()).description("物品数组，例如 ['1x 小型药剂', '铁剑']")
    });
  },

  getDoc() {
    return `更新 RPG 玩家的属性状态（HP、MP、金钱）和背包界面。`;
  }
}
