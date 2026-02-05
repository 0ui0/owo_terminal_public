
import i18n from "../tools/i18n.js"

export default {
  name: "getI18n",
  func: async () => {
    return {
      ok: true,
      dict: i18n.globalDict
    };
  }
};
