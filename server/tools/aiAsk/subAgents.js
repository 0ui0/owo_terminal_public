const subAgents = new Map();

export default {
  /**
   * Add a sub-agent instance
   * @param {Number} id - The chatListId
   * @param {Object} agent - The AiAsk instance
   */
  add(id, agent) {
    subAgents.set(id, agent);
  },

  /**
   * Get a sub-agent instance
   * @param {Number} id 
   * @returns {Object|undefined}
   */
  get(id) {
    return subAgents.get(id);
  },

  /**
   * Remove a sub-agent instance
   * @param {Number} id 
   */
  remove(id) {
    const agent = subAgents.get(id);
    if (agent) {
      // If AiAsk has a cleanup method, call it here
    }
    subAgents.delete(id);
  },

  /**
   * Get all agents map
   * @returns {Map}
   */
  getAll() {
    return subAgents;
  }
}
