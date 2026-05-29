
import i18n from "../tools/i18n.js"

export default {
  name: "getI18n",
  func: async () => {
    return {
      ok: true,
      msg: "i18n 语言包已同步",
      dict: i18n.globalDict
    };
  }
};
