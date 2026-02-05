
export default {
  name: "getOllamaModels",
  func: async (baseUrl = "http://localhost:11434") => {
    try {
      // Ensure no trailing slash
      baseUrl = baseUrl.replace(/\/$/, "")

      // 1. Try API URL
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 3000); // 3s timeout

      let models = []

      try {
        const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          if (data && data.models) {
            models = data.models
          }
        }
      } catch (e) {
        console.warn("Ollama API fetch failed", e)
        return {
          ok: false,
          msg: `连接 Ollama 失败 (${baseUrl})。请确保服务运行中且地址正确。`
        }
      } finally {
        clearTimeout(timeout);
      }

      if (models.length === 0) {
        return { ok: false, msg: "未找到任何 Ollama 模型" }
      }

      // Convert to app model format
      const clientModels = models.map(m => {
        return {
          name: "Ollama: " + m.name,
          model: m.name,
          apiKey: "ollama", // Placeholder
          url: `${baseUrl}/v1`, // Standard compatible endpoint
          prompt: "",
          price: 0,
          tokenRate: 0,
          preTokens: 4000,
          switch: 1,
          system: 0
        }
      })

      return {
        ok: true,
        data: clientModels
      }

    } catch (error) {
      console.error(error)
      return {
        ok: false,
        msg: "系统错误: " + error.message
      }
    }
  }
}
