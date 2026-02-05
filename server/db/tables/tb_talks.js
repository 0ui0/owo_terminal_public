
import {DataTypes} from "sequelize"
export default async (db)=>{
  const tb_talks = db.define("tb_talks",{
    talksId:{
      type:DataTypes.INTEGER,
      allowNull:false,
      primaryKey:true,
    },
    uid:{
      type:DataTypes.INTEGER,
      allowNull:false,
    },
    contentType:{
      type:DataTypes.STRING,
      allowNull:false,
    },
    content:{
      type:DataTypes.TEXT,
      allowNull:false,
    },
    note:{
      type:DataTypes.TEXT,
      allowNull:true,
    }
  })
  return tb_talks
}