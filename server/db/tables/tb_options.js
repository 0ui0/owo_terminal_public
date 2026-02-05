
import {DataTypes} from "sequelize"
export default async (db)=>{
  const tb_options = db.define("tb_options",{
    optionId:{
      type:DataTypes.INTEGER,
      allowNull:false,
      primaryKey:true,
      autoIncrement:true
    },
    key:{
      type:DataTypes.STRING,
      allowNull:false,
    },
    name:{
      type:DataTypes.STRING,
      allowNull:false,
    },
    value:{
      type:DataTypes.TEXT,
      allowNull:false,
      get(){
        return JSON.parse(this.getDataValue("value"))
      },
      set(value){
        return this.setDataValue("value",JSON.stringify(value))
      },
    },
    type:{
      type:DataTypes.STRING,
      allowNull:false,
    },
    /* joi:{
      type:DataTypes.TEXT,
      allowNull:true,
    }, */
    group1:{
      type:DataTypes.STRING,
      allowNull:true,
    },
    group2:{
      type:DataTypes.STRING,
      allowNull:true,
    },
    group3:{
      type:DataTypes.STRING,
      allowNull:true,
    },
    description:{
      type:DataTypes.TEXT,
      allowNull:true,
    },


    
    note:{
      type:DataTypes.TEXT,
      allowNull:true,
    }
  })
  return tb_options
}


