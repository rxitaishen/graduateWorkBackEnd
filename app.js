const express = require("express");

const mongoose = require("mongoose");
const getContentCheckResult = require("./baiduAi.js");
const path = require("path");
const fs = require("fs");
const mineType = require("mime-types");
const { exec } = require("child_process");
const multer = require("multer");
const fse = require("fs-extra");
const multiparty = require("multiparty");
const bodyParser = require("body-parser");

var iconv = require("iconv-lite");
var encoding = "cp936";
var binaryEncoding = "binary";

// 初始化比赛
publicCompetion = require("./models/publicCompetion.js");
teamMember = require("./models/teamMember");
project = require("./models/project");
teacher = require("./models/teacher");
student = require("./models/student");
admin = require("./models/adminUser");
// 报名表
signpage = require("./models/signpage");

const app = express();
const UPLOAD_DIR = path.resolve(__dirname, ".", "target");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const extractExt = (filename) =>
  filename.slice(filename.lastIndexOf("."), filename.length);

const createUploadedList = async (fileHash) => {
  const fileDir = path.resolve(UPLOAD_DIR, fileHash);
  return fse.existsSync(fileDir) ? await fse.readdir(fileDir) : [];
};

const pipeStream = (chunkPath, writeStream) => {
  return new Promise((resolve) => {
    const chunkReadStream = fse.createReadStream(chunkPath);
    chunkReadStream.on("end", () => {
      fse.unlinkSync(chunkPath);
      resolve();
    });
    chunkReadStream.pipe(writeStream);
  });
};

const mergeFileChunks = async (targetFilePath, fileHash, chunkSize) => {
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash);
  const chunkNames = await fse.readdir(chunkDir);
  // 根据分片下表排序
  chunkNames.sort((a, b) => a.split("_")[1] - b.split("_")[1]);
  console.log(targetFilePath);

  await fse.writeFileSync(targetFilePath, "");

  await Promise.all(
    chunkNames.map((chunkName, index) => {
      const chunkPath = path.resolve(chunkDir, chunkName);
      return pipeStream(
        chunkPath,
        fse.createWriteStream(targetFilePath, {
          start: index * chunkSize,
        })
      );
    })
  );

  await fse.rmdir(chunkDir);
};

// 处理跨域
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

// 解析请求体
app.use(bodyParser.json());

// 验证文件是否已上传过
app.post("/verify", async (req, res) => {
  const { fileHash, fileName } = req.body;

  const ext = extractExt(fileName);
  const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${ext}`);

  if (fse.existsSync(filePath)) {
    res.json({
      shouldUploadFile: false,
    });
  } else {
    res.json({
      shouldUploadFile: true,
      uploadedChunks: await createUploadedList(fileHash),
    });
  }
});

// 合并文件分片
app.post("/merge", async (req, res) => {
  const { fileHash, fileName, chunkSize } = req.body;
  const ext = extractExt(fileName);
  const targetFilePath = path.resolve(UPLOAD_DIR, `${fileName}`);
  await mergeFileChunks(targetFilePath, fileHash, chunkSize);

  res.json({
    code: 0,
    msg: `file ${fileName} merged.`,
  });
});

// 上传文件分片
app.post("/kk", (req, res) => {
  const multipart = new multiparty.Form();

  multipart.parse(req, async (err, fields, files) => {
    if (err) {
      return;
    }
    const [chunk] = files.chunk;
    const [hash] = fields.hash;
    const [fileHash] = fields.fileHash;
    const chunkDir = path.resolve(UPLOAD_DIR, fileHash);

    if (!fse.existsSync(chunkDir)) {
      await fse.mkdirs(chunkDir);
    }

    await fse.move(chunk.path, `${chunkDir}/${hash}`, { overwrite: true });
    res.status(200).send("received file chunk");
  });
});

app.post("/mainStd/newproject", function (req, res) {
  const params = {
    ...req.body,
  };
  project.create(params, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      res.send("作品提交成功");
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

app.post("/admin/signPageDetailByCallNumber", function (req, res) {
  var t = req.body;
  signpage.findOne({ callNumber: t.callNumber }, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      res.json(tm);
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

//TODO:怎么经常去更新这个元素在新arr里的位置？这里的bug因为上面的i就是固定的了，不会因为arr减少而减少
function TEST_getTitleAndLink(targetText) {
  console.log("%c targetText", "color: red", targetText);
  //const targetText = '关于启动浙江财经大学第十八届大学生电子商务竞赛 ... https://jwc.zufe.edu.cn/sanji-content.jsp?urltype=news.NewsContentUrl&wbtreeid=1082&wbnewsid=8035';

  function getTL(arrTL) {
    // console.log('%c arrTL', 'color: red', arrTL);
    let obj = {};
    try {
      if (arrTL.length == 3) {
        obj = {
          title: arrTL.slice(0, 2).join(" "),
          link: arrTL[2],
        };
      } else {
        obj = {
          title: arrTL[0],
          link: arrTL[1],
        };
      }
    } catch (error) {
      console.log(error);
      console.log("%c arrTL", "color: blue", arrTL);
    }

    return obj;
  }

  const arr = targetText.split(" ");
  const tempArr = [];
  let length = 0;
  let temp = [];
  const tempTitles = [];
  const tempLink = [];
  const gtx = /[\u4e00-\u9fff]+/;

  console.log("%c arr", "color: red", arr);
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].indexOf("https") > -1) {
      tempLink.push(arr[i]);
      // temp = arr.splice(0, i+1 - length);
      // length = length + temp.length;
      // tempArr.push(temp) // TODO:怎么经常去更新这个元素在新arr里的位置？这里的bug因为上面的i就是固定的了，不会因为arr减少而减少
      // console.log('%c length', 'color: yellow', length, i+1 - length);
      // console.log('%c tempArr', 'color: yellow', tempArr);
    } else if (
      gtx.test(arr[i]) ||
      arr[i].indexOf("赛") > -1 ||
      arr[i].indexOf("赛") > -1
    ) {
      tempTitles.push(arr[i]);
    }
    console.log("%c tempTitles", "color: yellow", tempTitles);
    console.log("%c tempLink", "color: yellow", tempLink);
  }

  const newArr = [];

  for (let i = 0; i < tempArr.length; i++) {
    newArr.push(getTL(tempArr[i]));
  }

  return newArr;
}

function getTitleAndLink(targetText) {
  // console.log('%c targetText', 'color: red', targetText);
  //const targetText = '关于启动浙江财经大学第十八届大学生电子商务竞赛 ... https://jwc.zufe.edu.cn/sanji-content.jsp?urltype=news.NewsContentUrl&wbtreeid=1082&wbnewsid=8035';
  const targetDS = targetText.split("==============================");
  console.log(targetDS);
  const result = targetDS.map((tempTarget) => {
    const arr = tempTarget.split(" ");
    const tempArr = [];
    let length = 0;
    let temp = [];
    const tempTitles = [];
    const tempLink = [];
    const gtx = /[\u4e00-\u9fff]+/;

    // console.log('%c arr', 'color: red', arr);
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].indexOf("https") > -1) {
        tempLink.push(arr[i]);
      } else if (
        gtx.test(arr[i]) ||
        arr[i].indexOf("赛") > -1 ||
        arr[i].indexOf("赛") > -1
      ) {
        tempTitles.push(arr[i]);
      }
    }

    const tempObj = { titles: tempTitles, links: tempLink };
    const res = tempObj.titles.map((title, index) => ({
      title: title.trim(),
      link: tempObj.links[index].trim(),
    }));

    return res;
  });
  return result;
}

function getNotices() {
  // 在Node.js中执行Python脚本
  let res = "";
  // let cmd = 'pip install requests --user && pip install bs4 --user && python ./public/爬取通知.py '
  let cmd = "python ./public/爬取通知.py ";

  function myAsyncFunction() {
    return new Promise(function (resolve, reject) {
      exec(cmd, { encoding: binaryEncoding }, (error, stdout, stderr) => {
        if (error) {
          console.error(`执行Python脚本时出错： ${error}`);
          console.error(
            iconv.decode(Buffer.from(stderr, binaryEncoding), encoding)
          );
          reject(error);
        }
        // 打印输出
        const res = iconv.decode(Buffer.from(stdout, binaryEncoding), encoding);
        resolve(res);
      });
    });
  }
  return myAsyncFunction();
}

function getText(proName, callback) {
  const filePath = `./target/${proName}.docx`;
  const fs = require("fs");
  const AdmZip = require("adm-zip"); //引入查看zip文件的包
  const zip = new AdmZip(filePath); //filePath为文件路径
  let contentXml = zip.readAsText("word/document.xml"); //将document.xml读取为text内容；
  let str = "";
  contentXml.match(/<w:t>[\s\S]*?<\/w:t>/gi).forEach((item) => {
    str += item.slice(5, -6);
  });
  callback(str);
}

function baiduAI(proName) {
  console.log(proName);
  return new Promise((resolve, reject) => {
    getText(proName, (text) => {
      getContentCheckResult(text)
        .then((result) => {
          resolve(result);
        })
        .catch((err) => {
          reject(err);
        });
    });
  });
}

//===============链接到mongodb==================//

mongoose.connect("mongodb://localhost/competstore");
var db = mongoose.connection;

//监听事件
mongoose.connection.once("open", function () {
  console.log("数据库连接成功~~~");
});

mongoose.connection.once("close", function () {
  console.log("数据库连接已经断开~~~");
});

//===============用户相关==================//

app.get("/", (req, res) => {
  getNotices()
    .then(function (result) {
      res.send(result);
    })
    .catch(function (error) {
      console.error(error); // 处理错误
    });
});

//登录
app.post(`/login`, (req, res) => {
  var t = req.body;
  student.findOne(
    { userName: t.userName, passWord: t.passWord },
    (err, user) => {
      if (err) {
        //console.log(err);
        throw err;
      }
      if (user) {
        res.send("登录成功");
      } else {
        res.send("登录失败");
      }
    }
  );
});

//登出
app.post(`/logout`, (req, res) => {
  var t = req.body;
  student.findOne({ name: t.userName, pass: t.passWord }, (err, user) => {
    if (err) {
      //console.log(err);
      throw err;
    }
    if (user) {
      res.send("退出成功");
    } else {
      res.send("登录失败");
    }
  });
});

// 注册函数
const userRegister = (t, identy, res) => {
  const stdParams = {
    ...t,
    roleInTeam: "队长",
    teamId: Math.floor(Math.random() * 90000) + 10000,
    projectId: Math.floor(Math.random() * 900) + 100,
  };
  const teacherParams = {
    ...t,
    projectToAudit: [],
  };
  const adminParams = {
    ...t,
  };
  const kuArr = [student, teacher, admin];
  const paramsArr = [stdParams, teacherParams, adminParams];

  kuArr[identy].create(paramsArr[identy], (err, user) => {
    if (err) {
      //console.log(err);
      throw err;
    }
    if (identy === 0) {
      teamMember.create(stdParams, (err, user) => {
        if (err) {
          //console.log(err);
          throw err;
        }
        if (user) {
          console.log("队长注册成功");
        } else {
          console.log("队长注册失败");
        }
      });
    }
    if (user) {
      res.send("注册成功");
    } else {
      res.send("注册失败");
    }
  });
};

//注册
app.post(`/register`, (req, res) => {
  var t = req.body;
  userRegister(t, t.identy, res);
});

//删除用户信息
app.delete("/userDelete/:_id", (req, res) => {
  let query = { _id: req.params._id };
  student.deleteOne(query, (err, user) => {
    if (err) {
      throw err;
    }
    res.json(user);
  });
});

// ===============共用接口==================//

app.post("/public/initCompet", (req, res) => {
  publicCompetion.deleteMany({}, function (err) {
    console.log("集合已清空");
    publicCompetion.create({ ...req.body }, (err, compet) => {
      if (err) {
        //console.log(err);
        throw err;
      }
      if (compet) {
        res.send("竞赛初始化成功");
      } else {
        res.send("竞赛初始化失败");
      }
    });
  });
});

app.get("/public/getCompTime", (req, res) => {
  publicCompetion.find((err, compet) => {
    if (err) {
      //console.log(err);
      throw err;
    }
    if (compet) {
      res.send(compet[0]);
    } else {
      res.send("报名失败");
    }
  });
});

// 文件下载
app.post("/public/download", function (req, res) {
  console.log(req.params, req.body, req.data, req);
  try {
    const filename = `${req.body.proName}.docx`; // 获取要下载的文件名
    const file = path.join(__dirname, "/target/" + filename);
    res.download(file, filename, function (err) {
      if (err) {
        console.error("文件下载失败：", err);
        res.send("找不到文件");
      } else {
        console.log("文件下载成功");
      }
    });
  } catch (e) {
    console.error(e);
  }
});

// 查找一个项目
app.post("/public/findProject", function (req, res) {
  console.log(req.params, req.body, req.data, req);

  project.findOne({ stdNumber: t.stdNumber }, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      res.json(tm);
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// 查找一个项目
app.post("/public/findsignPage", function (req, res) {
  var t = req.body;
  signpage.findOne({ callNumber: t.callNumber }, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      res.json(tm);
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// ===============学生端 主缆===============//
app.get("/mainStd/notice", (req, res) => {
  // res.send('welconm');
  getNotices()
    .then(function (result) {
      res.send(getTitleAndLink(result.substr(1)));
    })
    .catch(function (error) {
      console.error(error); // 处理错误
    });
});

//查询队伍成员/mainStd/member
app.post("/mainStd/member", (req, res, next) => {
  teamMember.find(req.body, (err, teamMembers) => {
    if (err) {
      throw err;
    }
    if (teamMembers) {
      //findone 和find 返回值有区别，当找不到时 find返回空数组，findone返回null
      res.json(teamMembers);
    } else {
      res.send("未找到相关信息");
    }
  });
});

//填写报名表
app.post("/mainStd/sign", (req, res, next) => {
  signpage.create({ ...req.body }, (err, user) => {
    if (err) {
      //console.log(err);
      throw err;
    }
    if (user) {
      console.log("报名成功");
      res.send("报名成功");
    } else {
      console.log("报名失败");
      res.send("报名失败");
    }
  });
});

// ===============文件上传==================//

// 配置 multer
const upload = multer({
  storage: multer.memoryStorage(), // 把文件存储在内存中
});

// 处理文件上传请求
app.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file; // 获取上传的文件
  const fileData = file.buffer; // 获取上传文件的二进制数据
  // 将二进制数据写入到数据库中
  res.send({ message: "File uploaded successfully" });
});

// ===============管理员端==================//

// 报名表检索
app.post("/admin/signPageList", (req, res, next) => {
  signpage.find((err, tm) => {
    if (err) {
      throw err;
    }
    if (tm.length !== 0) {
      console.log("RcArr不为null", tm);
      res.json({
        total: tm.length,
        rows: tm,
      });
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// 报名表详情
app.post(`/admin/signPageDetail`, (req, res) => {
  var t = req.body;
  signpage.findOne({ _id: t._id }, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      res.json(tm);
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// 审核报名表
app.post("/admin/checkSignPage", (req, res, next) => {
  let t = req.body._id;
  signpage.findOne({ _id: t }, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      //findone 和find 返回值有区别，当找不到时 find返回空数组，findone返回null
      signpage.updateOne({ _id: t }, req.body, (err, docs) => {
        if (err) {
          res.send("0");
        }
        /**更新数据成功，紧接着查询数据 */
        signpage.findOne({ _id: t }, (err, t) => {
          if (err) {
            res.send("0");
          }
          res.json(t);
        });
      });
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// 列举项目
app.post("/admin/list", (req, res, next) => {
  project.find((err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      res.json({
        total: tm.length,
        rows: tm,
      });
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// 更新项目（通过、分配专家、智能审核）
app.post("/admin/update", (req, res, next) => {
  console.log("编辑成员", req.body, req);
  let t = req.body._id;
  project.findOne({ _id: t }, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      //findone 和find 返回值有区别，当找不到时 find返回空数组，findone返回null
      project.updateOne({ _id: t }, req.body, (err, docs) => {
        if (err) {
          res.send("0");
        }
        // TODO: 审核退回，防止下次提交的时候重名，其实也可以让上交的时候覆盖文件
        if (req.body.passOrNot == 2) {
          let query = { _id: req.body._id };
          res.send("审核退回，删除对应文件");
          // project.deleteOne(query, (err, project) => {
          //   if (err) {
          //     throw err;
          //   }
          //   if (project !== null) {
          //     res.send("审核退回，删除对应文件");
          //   } else {
          //     console.log("找不到对应文件");
          //   }
          // });
        } else {
          /**更新数据成功，紧接着查询数据 */
          project.findOne({ _id: t }, (err, t) => {
            if (err) {
              res.send("0");
            }
            res.json(t);
          });
        }
      });
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// 获取教师
app.post("/admin/getTeacher", (req, res, next) => {
  teacher.find((err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      const result = tm.map((item) => {
        return { label: item.userName, value: item.workId };
      });
      res.json(result);
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// 一键审核
app.post("/admin/auditByAi", (req, res, next) => {
  baiduAI(req.body.proName)
    .then((result) => {
      result = eval("(" + result + ")");
      console.log(result, typeof result);

      // res.json(result.data);
      if(result.error_msg){
        console.log('文本过长')
        res.send("审核失败");
      }else{
         // res.send("1");
         let t = req.body.proName;
         project.findOne({ proName: t }, (err, tm) => {
           if (err) {
             throw err;
           }
           if (tm !== null) {
             // if
             const resText =
               result.data[0].conclusion + ":" + result.data[0].msg;
             const params = {
               aiScore: resText,
             };
             project.updateOne({ proName: t }, params, (err, docs) => {
               if (err) {
                 res.send("0");
               }
               /**更新数据成功，紧接着查询数据 */
               res.send("审核完成");
               // project.findOne({ proName: t }, (err, t) => {
               //   if (err) {
               //     res.send("0");
               //   }
               //   // 发送的是结果+msg
               //   res.send(resText);
               // });
             });
           } else {
             console.log("proName为null");
             res.send("0");
           }
         });
      }
    })
    .catch((err) => {
      console.error(err);
    });
});

// 一键结算
app.post("/admin/score", (req, res, next) => {
  project.find({}, function (err, pro) {
    if (err) {
      console.log(err);
      res.send("结算失败");
      return;
    }
    try {
      pro.forEach(function (pro) {
        if(!pro.auditScore){
          throw new Error("结算失败，老师未完成评审");
        }
        pro.auditScore = Math.floor(pro.auditScore / pro.auditTeachers.length);
        console.log(pro.auditScore)
        const { auditScore } = pro;
        if (auditScore >= 100) {
          pro.prize = "一等奖";
        } else if (auditScore > 50) {
          pro.prize = "二等奖";
        } else {
          pro.prize = "三等奖";
        }
        pro.save();
        
      });
      res.send("结算完成");
    } catch (e) {
      if (e.message !== 'StopIteration') {
        res.send("结算失败");
      }
    }
    
  });
});

// ===============教师评审==================//
app.post("/myJudge/list", (req, res, next) => {
  let num = Number(req.body.workId);
  console.log("Number", num);
  project.find(
    {
      auditTeachers: num,
    },
    (err, tm) => {
      if (err) {
        throw err;
      }
      if (tm.length) {
        console.log("proName不为null");
        res.json({
          total: tm.length,
          rows: tm,
        });
      } else {
        console.log("nnproName为null");
        res.send("0");
      }
    }
  );
});

// 成员详情
app.post(`/myJudge/detail`, (req, res) => {
  var t = req.body;
  project.findOne({ stdNumber: t.stdNumber }, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      res.json(tm);
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// ===============成员记录==================//

// 该队伍名下所有成员

app.post("/myGroup/list", (req, res, next) => {
  teamMember.find(req.body, (err, RcArr) => {
    console.log(RcArr);
    if (err) {
      throw err;
    }
    if (RcArr.length !== 0) {
      //findone 和find 返回值有区别，当找不到时 find返回空数组，findone返回null
      console.log("RcArr不为null", RcArr);
      res.json({
        total: RcArr.length,
        rows: RcArr,
      });
    } else {
      console.log("RcArr为null");
      res.send("未找到相关信息");
    }
  });
});

// 成员详情
app.post(`/myGroup/detail`, (req, res) => {
  var t = req.body;
  teamMember.findOne({ stdNumber: t.stdNumber }, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      res.json(tm);
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

//删除成员
app.delete("/myGroup/:_id", (req, res) => {
  var query = { _id: req.params._id };
  console.log(query);
  teamMember.deleteOne(query, (err, project) => {
    if (err) {
      throw err;
    }
    if (project !== null) {
      res.json(1);
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// 添加成员
app.post(`/myGroup/add`, (req, res) => {
  console.log(req.body);
  teamMember.create(req.body, (err, user) => {
    if (err) {
      //console.log(err);
      throw err;
    }
    if (user) {
      console.log("队员添加成功");
      res.send("1");
    } else {
      console.log("队员添加失败");
      res.send("0");
    }
  });
});

// 编辑成员
app.post("/myGroup/update", (req, res, next) => {
  console.log("编辑成员", req.body, req);
  let t = req.body._id;
  teamMember.findOne({ _id: t }, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      //findone 和find 返回值有区别，当找不到时 find返回空数组，findone返回null
      teamMember.updateOne({ _id: t }, req.body, (err, docs) => {
        if (err) {
          res.send("0");
        }
        /**更新数据成功，紧接着查询数据 */
        teamMember.findOne({ _id: t }, (err, t) => {
          if (err) {
            res.send("0");
          }
          res.json(t);
        });
      });
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

// ===============分数记录==================//

// 所有分数

app.post("/myScore/list", (req, res, next) => {
  project.find({ passOrNot: 1 }, (err, RcArr) => {
    console.log(RcArr);
    if (err) {
      throw err;
    }
    if (RcArr.length !== 0) {
      //findone 和find 返回值有区别，当找不到时 find返回空数组，findone返回null
      console.log("RcArr不为null", RcArr);
      res.json({
        total: RcArr.length,
        rows: RcArr,
      });
    } else {
      console.log("RcArr为null");
      res.send("未找到相关信息");
    }
  });
});

// 成员详情
app.post(`/myScore/detail`, (req, res) => {
  var t = req.body;
  project.findOne({ stdNumber: t.stdNumber }, (err, tm) => {
    if (err) {
      throw err;
    }
    if (tm !== null) {
      res.json(tm);
    } else {
      console.log("proName为null");
      res.send("0");
    }
  });
});

app.listen(5000);
console.log("Running on port 5000...");
