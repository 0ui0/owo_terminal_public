import { DataTypes } from "sequelize"

export default async (db) => {
  const tb_chat_messages = db.define("tb_chat_messages", {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    uuid: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    group: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    chatListId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tid: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    ask: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    snapshotId: {
      type: DataTypes.STRING,
      allowNull: true,
    }
  }, {
    indexes: [
      {
        fields: ["chatListId", "timestamp"]
      },
      {
        fields: ["timestamp"]
      },
      {
        fields: ["tid"]
      }
    ]
  })
  return tb_chat_messages
}
