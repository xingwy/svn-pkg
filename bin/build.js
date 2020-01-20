"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const iconv = __importStar(require("iconv-lite"));
const child = __importStar(require("child_process"));
const JsZip = require("jszip");
const moment = require("mement");
const argparse = require("argparse");
/**-----------------------------------常量配置-----------------------------------*/
const TIME = {
    ONE_DAY: 86400 * 1000
};
const DateType = {
    date: "YYYY-MM-DD",
    time: "YYYY-<=MM-DD-HHmm"
};
const Separator = {
    win32: "------------------------------------------------------------------------\r\n",
    linux: "------------------------------------------------------------------------\n"
};
const ImgType = [".jpg", ".bmp", ".png", ".gif", ".pcx", ".tga", ".exif", ".svg", ".psd", ".raw"];
/**----------------------------------命令行参数----------------------------------*/
const _argparse = new argparse.ArgumentParser({
    version: "0.0.1",
    addHelp: true
});
_argparse.addArgument(["svnurl"], { type: "string", defaultValue: "", nargs: "?", help: "svn地址" });
_argparse.addArgument(["day"], { type: "int", defaultValue: 7, nargs: "?", help: "时间段" });
_argparse.addArgument(["--user"], { type: "string", defaultValue: "", nargs: "?", help: "账户" });
_argparse.addArgument(["--pass"], { type: "string", defaultValue: "", nargs: "?", help: "密码" });
_argparse.addArgument(["--path"], { type: "string", defaultValue: "", nargs: "?", help: "仓库路径" });
_argparse.addArgument(["--ui"], { type: "int", defaultValue: 1, nargs: "?", help: "使用界面" });
_argparse.addArgument(["--flag"], { type: "int", defaultValue: 1, nargs: "?", help: "日期标志" });
_argparse.addArgument(["--odir"], { type: "string", defaultValue: "", nargs: "?", help: "输出目录" });
_argparse.addArgument(["--edir"], { defaultValue: [], nargs: "+", help: "排除目录" });
/**-----------------------------------工具函数-----------------------------------*/
/**
 * 执行cmd命令
 */
const cmd_exec = async (args) => {
    return new Promise((done, fail) => {
        args.push({
            maxBuffer: 20000 * 1024,
            encoding: "binary"
        });
        args.push(function (err, data, errInfo) {
            err ? fail({ err, info: iconv.decode(Buffer.from(errInfo, "binary"), "936") }) : done(iconv.decode(Buffer.from(data, "binary"), "936"));
        });
        // 子进程执行命令
        child.exec.apply(child, args);
    });
};
const cmd_spawn = async (args) => {
    return new Promise((done, fail) => {
        let sp_cmd;
        try {
            let params = args.shift().split(" ").map((item) => item.trim()).filter((item) => item);
            let cmd_name = params.shift();
            sp_cmd = child.spawn.apply(child, [cmd_name, params, {}]);
        }
        catch (error) {
            fail(error && error.toString());
        }
        sp_cmd.stdout.on("data", (data) => {
            if (data && data.length) {
                let str = iconv.decode(Buffer.from(data, "binary"), "936");
                str = str.substring(0, str.length - 1);
                console.info(`spawn run log:${str}`);
            }
        });
        sp_cmd.stderr.on("data", (data) => {
            if (data) {
                fail(iconv.decode(Buffer.from(data, "binary"), "936"));
            }
        });
        sp_cmd.on("exit", (code) => {
            console.info(`spawn exit, code:${code}`);
        });
        sp_cmd.on("close", (code) => {
            console.info(`spawn close, exit code:${code}`);
        });
    });
};
// 获取MD5字符
const md5 = (buf) => crypto.createHash("md5").update(buf).digest("hex");
// 格式化日期
const formatDate = (type, ts) => moment(ts || (new Date()).getTime()).format(DateType[type]);
// 绝对路径
const resolve = (dirs) => {
    if (!Array.isArray(dirs)) {
        dirs = [dirs];
    }
    return path.join(process.cwd(), ...dirs);
};
// 文件压缩
const zip = async (cfg, obj, files) => {
    for (let f of files) {
        try {
            // 删除记录不改变
            if (f.type === "D") {
                continue;
            }
            // 目录不改变
            let status = await file.status(resolve(f.dir));
            if (!status || status.isDirectory()) {
                continue;
            }
            let index = f.dir.indexOf(cfg.md5Name);
            let content = await file.read(resolve(f.dir));
            obj.file(path.normalize(f.dir).substring(cfg.md5Name.length + index + 1), content);
        }
        catch (error) {
            throw error;
        }
    }
    console.info(`Tip: join in directory list, wait compression`);
    // 配置压缩属性
    let data = await obj.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }, (metadata) => {
        if (metadata.currentFile) {
            console.info(`${metadata.currentFile}: ${metadata.percent.toFixed(2)}%`);
        }
    });
    await file.write(resolve([cfg.odir, `${cfg.ofile}.zip`]), data);
    console.info(`Tip: file compressed successfully, outfile: 【${resolve(cfg.odir)}/${cfg.ofile}}.zip】`);
};
/**
 * 文件操作
 */
const file = {
    read: async (dir) => {
        return new Promise((ok, fail) => {
            fs.readFile(dir, (err, data) => {
                if (err) {
                    fail(`Fail to read file, dir:${dir}`);
                }
                ok(data);
            });
        });
    },
    write: async (dir, data, encoding = "utf-8") => {
        return new Promise((ok, fail) => {
            fs.writeFile(dir, data, { encoding }, (err) => {
                if (err) {
                    fail(`Fail to write, dir:${dir}, data:${data.toString()}`);
                }
                ok();
            });
        });
    },
    appendLog: async (dir, data, encoding = "utf-8") => {
        return new Promise((ok, fail) => {
            fs.appendFile(dir, data, { encoding }, (err) => {
                if (err) {
                    fail(`Fail to append log, dir:${dir}, data:${data.toString()}`);
                }
                ok();
            });
        });
    },
    status: async (dir) => {
        return new Promise((ok, fail) => {
            fs.stat(dir, (err, data) => {
                if (err) {
                    ok(false);
                }
                ok(data);
            });
        });
    },
};
/**
 * svn 操作
 */
const svn = {
    cmd_checkout: async (cfg) => {
        let cmd_pull;
        if (os.platform() === "win32" && cfg.ui) {
            cmd_pull = `TortoiseProc.exe /command:checkout /path:${resolve(cfg.src)} /url:${cfg.url} /closeonend:1 blockpathadjustments`;
            try {
                return await cmd_exec([cmd_pull]);
            }
            catch (error) {
                throw `Warehouse pull failed, use ui, url:${cfg.url} user: ${cfg.user} pass:${cfg.pass} reason:${error && error.toString()}`;
            }
        }
        else {
            cmd_pull = `svn checkout ${cfg.url} --username=${cfg.user} --password=${cfg.pass} ${resolve(cfg.src)}`;
            try {
                return await cmd_spawn([cmd_pull]);
            }
            catch (error) {
                throw `Warehouse pull failed, without using ui, url:${cfg.url} user: ${cfg.user} pass:${cfg.pass} reason:${error && error.toString()}`;
            }
        }
    },
    cmd_update: async (cfg) => {
        let cmd_update;
        if (os.platform() === "win32" && cfg.ui) {
            cmd_update = `TortoiseProc.exe /command:update /path:${resolve(cfg.src)} /url:${cfg.url} /closeonend:1`;
            try {
                return await cmd_exec([cmd_update]);
            }
            catch (error) {
                throw `Warehouse update failed, use ui, url:${cfg.url} user: ${cfg.user} pass:${cfg.pass} reason:${error && error.toString()}`;
            }
        }
        else {
            cmd_update = `svn update ${resolve(cfg.url)}`;
            try {
                return await cmd_spawn([cmd_update]);
            }
            catch (error) {
                throw `Warehouse update failed, without using ui, url:${cfg.url} user: ${cfg.user} pass:${cfg.pass} reason:${error && error.toString()}`;
            }
        }
    },
    cmd_diff: async (cfg, begin, end) => {
        // 计算不同版本信息，并写入缓存
        let cmd_diff;
        if (typeof begin === "string") {
            cmd_diff = `svn diff -r{${begin}}${end ? ":{" + end + "}" : ""} --summarize ${cfg.svn.src}`;
        }
        else {
            cmd_diff = `svn diff -r{${begin}}${end ? ":" + end : ""} --summarize ${cfg.svn.src}`;
        }
        try {
            return await cmd_exec([cmd_diff]);
        }
        catch (error) {
            throw `Diff files failed, begin:${begin} end:${end} reason:${error && error.toString()}`;
        }
    },
    cmd_log: async (url, begin, end) => {
        let cmd_log;
        try {
            if (typeof begin === "string") {
                cmd_log = `svn log ${url} -r {${begin}}:{${end}}`;
            }
            else {
                cmd_log = `svn log ${url} -r ${begin}:${end}`;
            }
            return await cmd_exec([cmd_log]);
        }
        catch (error) {
            throw `Get log failed, begin:${begin} end:${end} reason:${error && error.toString()}`;
        }
    },
};
/**-----------------------------------构建步骤-----------------------------------*/
/**
 * 执行前准备
 */
const prepare = async (url, cfg) => {
    // 拉去代码仓库
    console.info(`Tip: prepare to update, url：${url} cfg:${JSON.stringify(cfg)}`);
    try {
        let param = Object.assign(cfg.svn, { url });
        let status = await file.status(resolve(cfg.svn.src));
        if (status && status.isDirectory()) {
            await svn.cmd_update(param);
        }
        else {
            await svn.cmd_checkout(param);
        }
        console.info(`Tip: code update successfully, outdir:${resolve(cfg.svn.src)}`);
    }
    catch (error) {
        throw error && error.toString();
    }
};
// 获取起止版本号
const getRange = async (url, begin, end) => {
    try {
        let infos = await svn.cmd_log(url, begin, end);
        let list = infos.split(Separator[os.platform()]);
        list = list.map((item) => {
            return item.split("|")[0].trim().substring(1);
        })
            .filter((str) => {
            return str !== "";
        })
            .map(Number);
        if (list.length >= 2) {
            let res_begin = list.shift();
            let res_end = list.pop();
            return [res_begin, res_end];
        }
        else {
            return [list[0] || -1, list[0] || -1];
        }
    }
    catch (error) {
        throw error && error.toString();
    }
};
// 列出目录下所有文件
const getFilesList = async (cfg, dir, fileList = []) => {
    for (let efile of cfg.edir) {
        if (path.join(dir, "").includes(path.join(efile, ""))) {
            return [];
        }
    }
    let files = fs.readdirSync(resolve(dir));
    for (let f of files) {
        let fullPath = path.join(dir, f);
        let status = await file.status(fullPath);
        if (status && status.isDirectory()) {
            await getFilesList(cfg, fullPath, fileList);
        }
        else {
            fileList.push({ dir: dir + "/" + f, type: "A" });
        }
    }
    return fileList;
};
// 文件比较
const diff = async (cfg, begin, end) => {
    console.info(`Tip: start to diff files between two versions, begin:${begin} end:${end} cfg:${JSON.stringify(cfg)}`);
    try {
        let diffFile;
        try {
            diffFile = await svn.cmd_diff(cfg, begin, end);
        }
        catch (error) {
            diffFile = await svn.cmd_diff(cfg, begin, end);
        }
        // 处理输出日志
        let list = diffFile.split("\n")
            .map((item) => {
            item = item.trim();
            let obj = {};
            obj.type = item[0];
            obj.dir = item.substring(1).trim();
            return obj;
        })
            .filter((item) => {
            // 过滤掉排除文件
            let dir = item.dir;
            if (!dir) {
                return false;
            }
            for (let efile of cfg.edir) {
                if (path.join(dir, "").includes(path.join(efile, ""))) {
                    return false;
                }
            }
            return true;
        });
        return list;
    }
    catch (error) {
        throw error && error.toString();
    }
};
_argparse.addArgument(["svnurl"], { type: "string", defaultValue: "", nargs: "?", help: "svn地址" });
_argparse.addArgument(["day"], { type: "int", defaultValue: 7, nargs: "?", help: "时间段" });
_argparse.addArgument(["--user"], { type: "string", defaultValue: "", nargs: "?", help: "账户" });
_argparse.addArgument(["--pass"], { type: "string", defaultValue: "", nargs: "?", help: "密码" });
_argparse.addArgument(["--path"], { type: "string", defaultValue: "", nargs: "?", help: "仓库路径" });
_argparse.addArgument(["--ui"], { type: "int", defaultValue: 1, nargs: "?", help: "使用界面" });
_argparse.addArgument(["--flag"], { type: "int", defaultValue: 1, nargs: "?", help: "日期标志" });
_argparse.addArgument(["--odir"], { type: "string", defaultValue: "", nargs: "?", help: "输出目录" });
_argparse.addArgument(["--edir"], { defaultValue: [], nargs: "+", help: "排除目录" });
/**-----------------------------------执行函数-----------------------------------*/
(async function start() {
    // 命令行参数
    let _args = _argparse.parseArgs();
    // 变量声明
    let zipCache = new JsZip();
    // 日期
    let day = _args["day"];
    if (day < 0) {
        throw new Error(`Value <day> is error, please input correct vaule`);
    }
    // 获取这个仓库的根目录 数据定义
    let url = _args["svnurl"];
    let flag = _args["flag"];
    let begin = formatDate("date", Date.now() - day * TIME.ONE_DAY);
    let end = formatDate("date", Date.now() + TIME.ONE_DAY);
    // config 配置
    let cfg = {};
    // 输出目录
    cfg.odir = _args["odir"];
    // 排除文件列表
    cfg.edir = _args["edir"];
    cfg.md5Name = path.basename(url) + "_" + md5(url).substring(0, 5);
    // svn相关配置
    cfg.svn = {
        src: path.normalize(_args["path"]) + cfg.md5Name,
        user: _args["user"],
        pass: _args["pass"],
        ui: _args["ui"]
    };
    /*执行步骤*/
    // 拉取代码
    await prepare(url, cfg);
    // 获取变更数据
    let fileList;
    if (day === 0) {
        // 直接复制最新仓库
        fileList = await getFilesList(cfg, cfg.svn.src);
        begin = "1970-12-31";
        end = formatDate("date", Date.now() + TIME.ONE_DAY);
    }
    else {
        // 对比版本
        fileList = await diff(cfg, begin, end);
    }
    let range = await getRange(url, begin, end);
    // 压缩文件
    cfg.ofile = path.basename(url) + (flag ? `_${formatDate("time")}_v${range[0]}_v${range[1]}` : "");
    await zip(cfg, zipCache, fileList);
    // 追加日志记录
    let log = `user:${cfg.svn.user}\npass:${cfg.svn.pass}\nsvn:${url}\nbegin:${begin}\nend:${end}`;
    await file.appendLog(resolve(`./data/store/log/${cfg.md5Name}.log`), log);
}().catch(console.error));
//# sourceMappingURL=build.js.map