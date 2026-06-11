export default function createAPI(apiName, config = {}) {
  const tableName = config.tableName || `icat_${apiName}s`
  const idName = config.idName || `${apiName}id`
  const cnName = config.cnName || "数据"

  // get
  const getPath = config.getPath || null
  const getParams = config.getParams || {}
  const getQuery = config.getQuery || {}
  const getOptions = config.getOptions || {}

  const getFindAll = config.getFindAll || (() => ({}))
  const getFindAllOrder = config.getFindAllOrder || (() => ([]))
  const getFindAllWhere = config.getFindAllWhere || (() => ({}))

  const getFindOne = config.getFindOne || (() => ({}))
  const getFindOneWhere = config.getFindOneWhere || (() => ({}))

  const getAllCount = config.getAllCount || (() => ([]))
  const getAllCountWhere = config.getAllCountWhere || (() => ({}))

  const getBeforeCreateData = config.getBeforeCreateData || (() => {})
  const getAfterCreateData = config.getAfterCreateData || (() => {})
  const getChangeReturnData = config.getChangeReturnData || (() => {})

  // set
  const setPath = config.setPath || null
  const setParams = config.setParams || {}
  const setPayload = config.setPayload || {}
  const setOptions = config.setOptions || {}
  const setFields = config.setFields || []
  const setUpdateData = config.setUpdateData || (() => {})
  const setCreateData = config.setCreateData || (() => {})

  const setBeforeUpdateData = config.setBeforeUpdateData || (() => {})
  const setAfterUpdateData = config.setAfterUpdateData || (() => {})
  const setChangeReturnData = config.setChangeReturnData || (() => {})
  const setAfterCommitTransaction = config.setAfterCommitTransaction || (() => {})

  const setFindOne = config.setFindOne || (() => ({}))
  const setFindOneWhere = config.setFindOneWhere || (() => ({}))

  // del
  const delPath = config.delPath || null
  const delParams = config.delParams || {}
  const delPayload = config.delPayload || {}
  const delOptions = config.delOptions || {}

  const delBeforeDeleteData = config.delBeforeDeleteData || (() => {})
  const delAfterDeleteData = config.delAfterDeleteData || (() => {})
  const delChangeReturnData = config.delChangeReturnData || (() => {})

  const getAPI = {
    method: "get",
    path: getPath
      ? (typeof getPath === "function" ? getPath({ tableName, idName, cnName }) : getPath)
      : `/api/${apiName}s/get/{${idName}?}`,
    options: {
      validate: {
        params: Joi.object({
          [idName]: Joi.string().optional(),
          ...getParams
        }),
        query: Joi.object({
          offset: Joi.number().integer().min(0).default(0),
          limit: Joi.number().integer().max(150).default(32),
          order: Joi.string().pattern(/desc|asc/i).default("asc"),
          cacheRandom: Joi.string().optional(),
          ...getQuery
        })
      },
      ...getOptions
    },
    handler: async (req, h) => {
      const db = config.db || req.server.db
      const que = req.query
      const par = req.params
      const auth = req.auth.credentials
      try {
        const sendParams = { req, h, db, que, par, auth, config }

        await getBeforeCreateData(sendParams)
        if (sendParams.stop) return sendParams.stop

        let data = null
        if (par[idName]) {
          data = await db[tableName].findOne({
            where: {
              [idName]: par[idName],
              ...(await getFindOneWhere(sendParams))
            },
            ...(await getFindOne(sendParams))
          })
        } else {
          data = await db[tableName].findAll({
            order: [
              [idName, que.order],
              ...(await getFindAllOrder(sendParams))
            ],
            limit: Number(que.limit),
            offset: Number(que.offset),
            where: {
              ...(await getFindAllWhere(sendParams))
            },
            ...getFindAll(sendParams)
          })
        }

        const allCount = await db[tableName].count({
          where: {
            ...(await getAllCountWhere(sendParams))
          },
          ...getAllCount(sendParams)
        })

        sendParams.data = data
        await getAfterCreateData(sendParams)
        if (sendParams.stop) return sendParams.stop

        const returnData = {
          ok: true,
          data: sendParams.data,
          allCount: allCount
        }
        sendParams.returnData = returnData
        await getChangeReturnData(sendParams)

        return sendParams.returnData
      } catch (err) {
        console.error(err)
        return { ok: false, msg: "服务器内部错误" }
      }
    }
  }

  const setAPI = {
    method: "post",
    path: setPath
      ? (typeof setPath === "function" ? setPath({ tableName, idName, cnName }) : setPath)
      : `/api/${apiName}s/set/{${idName}?}`,
    options: {
      payload: { maxBytes: 50 * 1024 * 1024 },
      validate: {
        params: Joi.object({
          [idName]: Joi.string().optional(),
          ...setParams
        }),
        payload: Joi.object({
          ...setPayload
        }).unknown(true)
      },
      ...setOptions
    },
    handler: async (req, h) => {
      const db = config.db || req.server.db
      const que = req.payload
      const par = req.params
      const auth = req.auth.credentials

      const sendParams = { req, h, db, que, par, auth, config }
      if (!setFields || setFields.length === 0) {
        console.error("缺少允许设置的字段setFields")
        return { ok: false, msg: "setFields错误，请检查服务器" }
      }

      let t = null
      try {
        t = await db.db.transaction()
        sendParams.t = t
        let data = null

        await setBeforeUpdateData(sendParams)
        if (sendParams.stop) {
          await t.rollback()
          return sendParams.stop
        }

        if (par[idName]) {
          data = await db[tableName].findOne({
            where: {
              [idName]: par[idName],
              ...(await setFindOneWhere(sendParams))
            },
            transaction: t,
            ...(await setFindOne(sendParams))
          })

          if (data) {
            for (const field of setFields) {
              if (que[field] !== undefined) {
                data[field] = que[field]
              }
            }
            sendParams.updateData = data
            await setUpdateData(sendParams)
            await data.save({ transaction: t })
          }
        } else {
          const content = {}
          for (const field of setFields) {
            content[field] = que[field]
          }
          sendParams.createData = content
          await setCreateData(sendParams)
          data = await db[tableName].create(content, { transaction: t })
        }

        await setAfterUpdateData(sendParams)
        if (sendParams.stop) {
          await t.rollback()
          return sendParams.stop
        }

        sendParams.returnData = {
          ok: true,
          data: data,
          msg: `${cnName}修改成功`,
          ...(!par[idName] ? { [idName]: data[idName] } : {})
        }

        await setChangeReturnData(sendParams)
        await t.commit()
        await setAfterCommitTransaction(sendParams)
        return sendParams.returnData
      } catch (err) {
        console.error(err)
        if (t) await t.rollback()
        return { ok: false, msg: "服务器内部错误" }
      }
    }
  }

  const delAPI = {
    method: "post",
    path: delPath
      ? (typeof delPath === "function" ? delPath({ tableName, idName, cnName }) : delPath)
      : `/api/${apiName}s/del/{${idName}}`,
    options: {
      validate: {
        params: Joi.object({
          [idName]: Joi.string().required(),
          ...delParams
        }),
        ...(Object.keys(delPayload).length > 0 ? { payload: Joi.object({ ...delPayload }) } : {})
      },
      ...delOptions
    },
    handler: async (req, h) => {
      const db = config.db || req.server.db
      const que = req.query
      const par = req.params
      const auth = req.auth.credentials

      const sendParams = { req, h, db, que, par, auth, config }
      let t = null
      try {
        t = await db.db.transaction()
        sendParams.t = t

        await delBeforeDeleteData(sendParams)
        if (sendParams.stop) {
          await t.rollback()
          return sendParams.stop
        }

        const data = await db[tableName].findOne({
          where: { [idName]: par[idName] },
          transaction: t
        })

        if (!data) {
          await t.commit()
          return { ok: false, msg: `${cnName}不存在` }
        }

        await data.destroy({ transaction: t })
        await delAfterDeleteData(sendParams)
        if (sendParams.stop) {
          await t.rollback()
          return sendParams.stop
        }

        sendParams.returnData = { ok: true, msg: `${cnName}删除成功` }
        await delChangeReturnData(sendParams)
        await t.commit()
        return sendParams.returnData
      } catch (err) {
        console.error(err)
        if (t) await t.rollback()
        return { ok: false, msg: "服务器内部错误" }
      }
    }
  }

  return { get: getAPI, set: setAPI, del: delAPI }
}
