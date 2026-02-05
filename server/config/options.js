import db from "../db/db.js"

export default {
  data: null,
  json: null,
  pull: async function() {
    try {

      this.data = (await db.tb_options.findAll());
      this.json = {};
      return this.data.forEach((option) => {
        return this.json[option.key] = option;
      });
    } catch (error) {
      throw error
    }
  },
  set: async function(key, value) {
    var err, option;
    try {
      if (!this.data) {
        await this.pull();
      }
      option = this.data.find((option) => {
        return option.key === key;
      });
      option.value = value;
      await option.save();
      return (await this.pull());
    } catch (error) {
      //console.log "设置options",@json[key].value
      err = error;
      throw err;
    }
  },
  get: async function(key) {
    var err, option;
    try {
      if (!this.data) {
        await this.pull();
      }
      option = this.json[key];
      if (option) {
        return option.value;
      } else {
        throw new Error(`获取设置${key}失败`);
      }
    } catch (error) {
      err = error;
      throw err;
    }
  }
};

