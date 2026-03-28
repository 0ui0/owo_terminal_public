import Joi from "joi";

export default {
  name: "启动AI_RPG_Engine",
  id: "aiRpgLaunch",

  async fn(argObj) {
    const { value, error } = this.joi().validate(argObj);
    if (error) {
      return "错误：" + error.details[0].message;
    }

    const appManager = (await import("../../../apps/appManager.js")).default;
    const { mapId } = value;

    let res = await appManager.launch('aiRpg', {
      data: {
        initialMapId: mapId
      }
    });

    if (res.ok) {
      return `RPG App launched successfully with ID: ${res.app.id}. You can now use aiRpgUpdateScene to customize it.`;
    } else {
      return `Failed to launch RPG App: ${res.msg}`;
    }
  },

  joi() {
    return Joi.object({
      mapId: Joi.number().default(1).description("可选的初始地图 ID（默认为 1）")
    });
  },

  getDoc() {
    return `启动rpg游戏`;
  }
}
