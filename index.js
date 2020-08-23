var fs = require('fs');
var http = require('http');
var proc = require('child_process');
var crypt = require('crypto');

var reps = ["f1.mcgl.ru", "f2.mcgl.ru", "f3.mcgl.ru"];
var first = 0;
var cons;

var accessKey = "";

var algorithm = 'aes192', password = 'd6F3Efeq';
function encrypt(text){
    var cipher = crypt.createCipher(algorithm, password)
    var crypted = cipher.update(text,'utf8','hex')
    crypted += cipher.final('hex');
    return crypted;
}

function decrypt(text){
    var decipher = crypt.createDecipher(algorithm, password)
    var dec = decipher.update(text,'hex','utf8')
    dec += decipher.final('utf8');
    return dec;
}

function mkdir(path, root) {
    var dirs = path.replace(new RegExp("\\\\", 'g'), "/").split('/');
    var dir = dirs.shift();
    var root = (root || '') + dir + '/';

    try { fs.mkdirSync(root); }
    catch (e) {
        //dir wasn't made, something went wrong
        if(!fs.statSync(root).isDirectory()) throw new Error(e);
    }

    return dirs.length == 1 || mkdir(dirs.join('/'), root);
}

function ready(rep) {
    new Builder($("login")).on("oninput", function(){
        window.localStorage['login'] = encrypt(this.value);
    }).on("onblur", updateProfile);
    new Builder($("pass")).on("oninput", function(){
        window.localStorage['pass'] = encrypt(this.value);
    }).on("onblur", updateProfile);
    new Builder($("java")).on("oninput", function(){
        window.localStorage['java'] = this.value;
    });
    $("login").value = window.localStorage['login'] ? decrypt(window.localStorage['login']) : "";
    $("pass").value = window.localStorage['pass'] ? decrypt(window.localStorage['pass']) : "";
    $("java").value = window.localStorage['java'] ? window.localStorage['java'] : "java";
    if($("login").value)
        updateProfile();

    cons = new Builder($("console"));
}

function level(exp) {
    if(!exp)
        return 0;
    start = 100.0
	l = 1
	while(exp > start) {
		l ++
		start *= 1.5
	}
	return l
}

function updateProfile() {
    $.post("http://forum.minecraft-galaxy.ru/mcrun/", {user: $("login").value, pass: $("pass").value}, function(data){
        var user = JSON.parse(data);
        accessKey = user.key;
        if(accessKey)
            $("reppanel").show();
        $("make").innerHTML = level(user.make);
        $("crush").innerHTML = level(user.crush);
        $("avatar").src = user.ava ? "http://forum.minecraft-galaxy.ru/img/avatars/" + user.uid : "http://forum.minecraft-galaxy.ru/img/noavatar.png";
        $("restoreurl").href= "http://forum.minecraft-galaxy.ru/restore/?l=" + $("login").value;
    });
}

function settings() {
    // alert("in progress...")
}

function console() {
    $("console").style.display = $("console").style.display == "block" ? "none" : "block";
}

function getUserHome() {
    var home = require('os').homedir();
    var mcgl = "MCGL/MinecraftLauncher2/";
    if(process.platform == "linux")
        return home + "/.config/" + mcgl;
    if(process.platform == "darwin")
        return home + "/Library/Preferences/" + mcgl;
    return home + "\\AppData\\Roaming\\" + mcgl;
}

function getRepDir() {
    return getUserHome() + "repository/";
}

function parseVersion(rep, data) {
    logInfo("Локальный репозиторий: " + getRepDir());
    logInfo("Сравнение хешей...");
    var md5 = data.substring(0, 32);

    var locFile = getRepDir() + rep + "/version.md5";
    var localmd5 = fs.existsSync(locFile) ? fs.readFileSync(locFile, "utf8") : "";
    var locmd5 = localmd5.substring(0, 32);
    if(locmd5 != md5 || rep == "mclient") {
        beginUpdate(rep);
        fs.writeFileSync(locFile, data, "utf8");
    }
    else {
        runGame(rep);
    }
}

var index = 0;
var loadCounter = 0;

function progress(value) {
    $("progress").childNodes[0].innerHTML = value + "%";
    $("progress").childNodes[0].style.width = value + "%";
}

function updateFiles(rep, forUpdate, onupdate) {
    var updateFileName = getRepDir() + rep + "/" + forUpdate[index];
    mkdir(updateFileName);
    var file = fs.createWriteStream(updateFileName);
    $("text").innerHTML = "Загрузка: " + forUpdate[index];
    var options = {
        hostname: reps[first],
        port: 80,
        path: encodeURI("/" + rep + "/" + forUpdate[index]),
        method: 'GET',
        timeout: 3000,
        headers: {
            'Authorization': 'Basic ' + new Buffer($("login").value + ":" + accessKey).toString('base64')
        }
    };
    var request = http.get(options, (response) => {
        loadCounter++;
        response.pipe(file);
        response.on('end', () => {
            file.end();

            loadCounter--;

            if(loadCounter == 0 && index == forUpdate.length) {
                $("text").innerHTML = "Выполнено";
                onupdate();
            }
        });

        logInfo("Обновлен файл: " + forUpdate[index]);
        
        index++;
        progress(Math.round((index / forUpdate.length)*100));
        if(index < forUpdate.length) {
            updateFiles(rep, forUpdate, onupdate);
        }
    });
}

function update(rep, forUpdate, onupdate) {
    logInfo("Обновление...");
    progress(0);
    $("text").innerHTML = "Найдено обновление...";
    $("progress").parentNode.style.display = "block";
    index = 0;
    loadCounter = 0;
    updateFiles(rep, forUpdate, onupdate);
}

function updateCheck(rep, list) {
    logInfo("Поиск новых и обновленных файлов...");
    var locFile = getRepDir() + rep + "/update_f.lst";
    var localList = fs.existsSync(locFile) ? fs.readFileSync(locFile, "utf8") : "";
    var filesLocal = localList.split("\n");
    var hash = {};
    for(let file of filesLocal) {
        var fileMD5 = file.substring(0, 32);
        var filePath = file.substring(32).trim();
        if(filePath)
            hash[filePath] = fileMD5;
    }

    var needUpdateFiles = 0;
    var newFiles = 0;
    var files = list.split("\n");
    var forUpdate = [];
    var hashNew = {};
    for(let file of files) {
        var fileMD5 = file.substring(0, 32);
        var filePath = file.substring(32).trim();
        if(filePath)
            hashNew[filePath] = fileMD5;
        if(filePath) {
            if(hash[filePath]) {
                if(hash[filePath] != fileMD5) {
                    needUpdateFiles++;
                    forUpdate.push(filePath);
                }
            }
            else {
                newFiles++;
                forUpdate.push(filePath);
            }
        }
    }
    var wasRemove = 0;
    for(let file in hash) {
        var filePath = getRepDir() + rep + file.substring(1);
        if(file && !hashNew[file] && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            wasRemove++;
        }
    }

    logInfo("Найдено файлов: измененных - " + needUpdateFiles + ", новых - " + newFiles + ", удалено - " + wasRemove);
    if(needUpdateFiles || newFiles) {
        update(rep, forUpdate, () => {
            fs.writeFileSync(locFile, list, "utf8");
            runGame(rep);
            setTimeout(() => $("progress").parentNode.style.display = "none", 3000);
        });
    }
    else {
        runGame(rep);
    }
}

function logInfo(text) {
    cons.div("line").html(text);
    cons.element.scrollTop = 65536;
}

function logError(text) {
    cons.div("error").html(text);
    cons.element.scrollTop = 65536;
}

function logAppend(text) {
    cons.child(cons.childs()-1).element.innerHTML += text;
}

var mc = null;
function runGame(rep, opt) {
    logInfo("Запуск клиента...");
    var args = [];
    if(opt)
        args.push(opt);
    mc = proc.spawn(
        $("java").value, args.concat(["-jar", "Minecraft.jar", $("login").value, $("pass").value]),
        {
            cwd: getRepDir() + rep,
            detached: true
        }
    );
    new Builder($("run")).htmlAttr("enabled", false);
    mc.stdout.on('data', (data) => {
        for(let line of data.toString().split("\n")) {
            logInfo(line);
            if(line.startsWith("Rerun client"))
                runGame(rep, "-Xmx1024M");
        }
    });
    mc.stderr.on('data', (data) => {
        for(let line of data.toString().split("\n"))
            logError(line);
    });
    mc.on('close', (code) => {
        if(code)
            logInfo("Exit code: " + code);
        mc = null;
        switchButtins(true, false);
    });
    mc.on('error', (err) => {
        logError('Failed to start mcgl.');
        logError(err);
    });
}

function beginUpdate(rep) {
    logInfo("Проверка списка файлов...");
    get("/" + rep + "/update.lst", (data) => {
        updateCheck(rep, data);
    });
}

function switchButtins(run, stop) {
    if(run)
        $("run").show();
    else
        $("run").hide();
    if(stop)
        $("stop").show();
    else
        $("stop").hide();
}

function stop() {
    if(mc) {
        mc.kill();
        mc = null;
    }
}

function run() {
    rep = $("rep").value;

    switchButtins(false, true);
    cons.html("");
    if(first == reps.length)
        first = 0;
    logInfo("Проверка обновления репозитория " + rep);
    get(
        "/" + rep + "/version.md5",
        (data) => parseVersion(rep, data),
        () => {
            first++;
            if(first < reps.length) {
                run(rep);
        }
    });
}

function readMD5(fileMD5, dir, file, oncheck) {
    if(!fs.existsSync(dir + file)) {
        logError("Отсутствует: " + file);
        oncheck();
        return;
    }

    var crypto = require('crypto');

    const hash = crypto.createHash('md5');
    const input = fs.createReadStream(dir + file);
    input.on('readable', () => {
        const data = input.read();
        if (data)
            hash.update(data);
        else {
            if(fileMD5 != hash.digest('hex'))
                logError("Изменен: " + file);
            oncheck();
        }
    });
}

function check() {
    rep = $("rep").value;
    logInfo("Проверка файлов текущего репозитория...");
    var locFile = getRepDir() + rep + "/update_f.lst";
    var localList = fs.existsSync(locFile) ? fs.readFileSync(locFile, "utf8") : "";
    var filesLocal = localList.split("\n");
    var count = 0, total = 0;
    for(let file of filesLocal) {
        var fileMD5 = file.substring(0, 32);
        var filePath = file.substring(32).trim();
        if(filePath) {
            count++;
            readMD5(fileMD5, getRepDir() + rep + "/", filePath, () => {
                total++;
                count--;
                if(count == 0)
                    logInfo("Проверка окончена. Проверено " + total + " файлов.");
            });
        }
    }
    
}

var get = function(url, load, errproc) {
    var options = {
        hostname: reps[first],
        port: 80,
        path: url,
        method: 'GET',
        timeout: 3000,
        headers: {
            'Authorization': 'Basic ' + new Buffer("admin:21232f297a57a5a743894a0e4a801fc3").toString('base64')
        }
    };
    http.get(options, (resp) => {
        if(resp.statusCode == 200) {
            resp.setEncoding('utf8');
            let rawData = '';
            resp.on('data', (chunk) => rawData += chunk);
            resp.on('end', () => load(rawData));
        }
        else {
            logError("Failed to load[" + resp.statusCode + "]: " + url);
            if(errproc) errproc();
        }
    }).on('error', (e) => {
        logError("Failed to load[" + e.message + "]: " + url);
        if(errproc) errproc();
    });
};