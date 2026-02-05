
import AiAsk from "./AiAsk.js";
import options from "../../config/options.js"



export default {
  miao: null,
  initMiao: async function() {
    this.miao = new AiAsk({
      apiKey: "ollama",
      baseURL: "http://192.168.2.88:11434/v1/",
      //model:"qwen2:0.5b"
      model: "qwen2.5:7b"
    });
    //model:"qwen3:1.7b"
    await this.miao.init();
  },
  list: [],
  initList: async function() { //从数据库模型列表初始化模型
    try {
      let aiList = (await options.get("ai_aiList"));
      return aiList.forEach((model, index) => {
        
        if ((this.list)[index] == null) {
          this.list[index] = new AiAsk({
            apiKey: model.apiKey,
            baseURL: model.url,
            model: model.model,
            prompt: model.prompt,
            name: model.name
          })
        }
        this.list[index].init({
          apiKey: model.apiKey,
          baseURL: model.url,
          model: model.model,
          prompt: model.prompt,
          name: model.name
        })
      })
    } catch (error) {
      throw error
    }
  }
};
