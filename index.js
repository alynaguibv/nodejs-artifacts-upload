String.prototype.escapeRegExp = function escapeRegExp(str) {
    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
};
String.prototype.replaceAll = function (search, replacement) {
    let target = this;
    return target.replace(new RegExp(target.escapeRegExp(search), 'g'), replacement);
};
const PropertiesReader = require('properties-reader'),
    properties = PropertiesReader('properties.props'),
    path = require('path'), sep = path.sep, log = console, rimraf = require("rimraf"),
    df = require('dateformat'),
    {IncomingWebhook} = require('@slack/client'), exec = require('child_process').exec,
    spawn = require('child_process').spawn, git = require("nodegit"), args = process.argv.slice(2);
const constants = {
    encodingMethod: 'utf8',
    versionFileURL: "versionFileURL",
    slackURL: "slackURL",
    commandToAssembleAPK: "commandToAssembleAPK",
    dropboxPath: "/MeinVodafone/",
    dropboxAccessToken: "dropboxAccessToken",
    projectDirectory: "projectDirectory",
    configDir: sep + 'app' + sep + 'src' + sep + 'main' + sep + 'assets' + sep + 'config',
    cmsMapping: [{localFile: "android_abbreviation.json", remoteId: "abbreviations"},
        {localFile: "android_campaign.json", remoteId: "campaign"},
        {localFile: "android_config.json", remoteId: "config"},
        {localFile: "android_content.json", remoteId: "content"},
        {localFile: "android_deeplink.json", remoteId: "deeplink"},
        {localFile: "android_help.json", remoteId: "help"},
        {localFile: "android_maintenance.json", remoteId: "maintenance"},
        {localFile: "android_menu.json", remoteId: "menu"},
        {localFile: "android_netzfeedback.json", remoteId: "netz_feedback"},
        {localFile: "android_tariff_prepaid.json", remoteId: "prepaid_tariff"},
        {localFile: "android_red_plus.json", remoteId: "redplus"},
        {localFile: "android_roaming.json", remoteId: "roaming"},
        {localFile: "android_services.json", remoteId: "service_option"},
        {localFile: "sim.json", remoteId: "sim"},
        {localFile: "android_tariff.json", remoteId: "tariff"},
        {localFile: "android_tariffoption.json", remoteId: "tariff_option"},
        {localFile: "android_yolo.json", remoteId: "yolo"}]
};
const webhook = new IncomingWebhook(properties.get(constants.slackURL));
const https = require('https');
const http = require('http');
const fs = require('fs');
const fetch = require('isomorphic-fetch');
const dropbox = require('dropbox').Dropbox;
const dbx = new dropbox({
    accessToken: properties.get(constants.dropboxAccessToken),
    fetch: fetch
});

let getParentDir = function () {
    let arr = __dirname.split(sep);
    let parent = "";
    for (let i = 0; i < arr.length - 1; i++) {
        parent += arr[i] + (i === arr.length - 2 ? '' : sep);
    }
    return parent;
}, getProjectDir = function () {
    return getParentDir() + sep + properties.get(constants.projectDirectory);
}, getOrDownloadFile = function (url, dest, cb) {
    return new Promise(function (resolve, reject) {
        let request = url.indexOf('https') > -1 ? https : http;
        request.get(url, function (response) {
            let body = '';
            log.log('Downloading file: ' + url);
            response.setEncoding(constants.encodingMethod);
            response.on("data", function (chunk) {
                body += chunk;
            });
            response.on("end", function () {
                if (dest) {
                    let exists = fs.existsSync(dest);
                    if (exists) {
                        fs.readFile(dest, constants.encodingMethod, function (err, contents) {
                            if (contents.toString().valueOf() !== body.toString().valueOf()) {
                                fs.writeFileSync(dest, body);
                            } else {
                                resolve({url: url, fileWritten: false})
                            }
                        });
                    } else {
                        resolve({response: body, error: "File not exists"})
                    }
                } else {
                    resolve({response: body})
                }
            })
        }).on('error', function (err) { // Handle errors
            if (dest) {
                fs.unlink(dest); // Delete the file async. (But we don't check the result)
                log.error("Can't download file: " + url + " According to error: " + err);
                if (cb) cb(err.message);
            }
            reject(err);
        });
    })
}, updateLocalCMSWithLiveCMS = function () {
    return new Promise(function (resolve, reject) {
        getOrDownloadFile(properties.get(constants.versionFileURL)).then(function (result) {
            let assetsPath = getProjectDir() + constants.configDir;
            let getArr = [], jResult = [];
            if (result.response) {
                jResult = JSON.parse(result.response);
            }
            constants.cmsMapping.forEach(function (mapping) {
                if (jResult.items) {
                    let items = jResult.items;
                    items.forEach(function (versionItem) {
                        if (versionItem.id.toString() === mapping.remoteId.toString()) {
                            getArr.push({url: versionItem.resource, dest: assetsPath + sep + mapping.localFile});
                        }
                    })
                }
            });
            Promise.all(getArr.map(async item => {
                getOrDownloadFile(item.url, item.dest).then(function (result) {

                }, function (err) {

                })
            })).then(function (result) {
                log.log(result);
                resolve(result);
            }, function (err) {
                log.error(err);
                reject(result);
            })
        }, function (err) {
            log.error(err);
            reject(err);
        });

    });
}, listDropBoxFiles = function (path) {
    return new Promise(function (resolve, reject) {
        dbx.filesListFolder({path: path}).then(function (response) {
            log.log(response);
            resolve(response);
        }).catch(function (error) {
            log.error(error);
            reject(error);
        });
    })
}, createDropBoxFolder = function (path) {
    return new Promise(function (resolve, reject) {
        dbx.filesCreateFolderV2({path: path}).then(function (response) {
            log.log(response);
            resolve(response);
        }).catch(function (error) {
            log.error(error);
            reject(error);
        })
    });
}, uploadFileToDropBox = function (srcFile, destFile) {
    return new Promise(function (resolve, reject) {
        fs.readFile(srcFile, constants.encodingMethod, function (err, contents) {
            if (err) {
                log.log('Error: ', err);
            } else
                dbx.filesUpload({path: destFile, contents: contents}).then(function (response) {
                    log.log(response);
                    resolve(response);
                }).catch(function (err) {
                    log.log(err);
                    reject(err);
                });
        });
    })
}, postMessageToSlackChannel = function (message) {
    return new Promise(function (resolve, reject) {
        webhook.send(message, function (err, res) {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    })
}, getMyDateTime = function () {
    return df(new Date(), "yyyymmddHHMM");
}, executeCommand = function (command) {
    let list = command.split(' '), list2 = [], com = '';
    if (list && list.length > 0) {
        com = list[0];
        for (let i = 1; i < list.length; i++) {
            list2.push(list[i]);
        }
    } else {
        com = command;
    }
    return new Promise(function (resolve, reject) {
        let child = spawn(com, list2);
        child.stdout.setEncoding(constants.encodingMethod);
        child.stdout.on('data', function (chunk) {
            log.log(chunk);
        });
        child.stderr.on('error', function (err) {
            reject(err);
        });
        child.stdout.on('close', function (code) {
            resolve(code);
        });
    });
}, produceAPK = function () {
    process.chdir(getProjectDir());
    return new Promise(function (resolve, reject) {
        executeCommand(properties.get(constants.commandToAssembleAPK)).then(function (code) {
            log.log(code);
            resolve(code);
        }).catch(function (err) {
            log.log(err);
            reject(err);
        });
    });
}, uploadAPKToDropbox = function () {
    return new Promise(function (resolve, reject) {
        findInDir(getProjectDir(), /\.apk$/).then(function (findResult) {
            if (findResult.list.length) {
                proceedAPKPath(findResult.list[0]);
            } else {
                reject();
            }
        }).catch(function(e){
			log.log(e);
			reject(e);
		});

        function proceedAPKPath(apkPath) {
            let apkPathArr = apkPath.split('.apk');
            let newPath = apkPathArr[0] + getMyDateTime() + '.apk';
            let arr = newPath.split(sep);
            let apkDName = arr[arr.length - 1];
            fs.renameSync(apkPath, newPath);
            uploadFileToDropBox(newPath, constants.dropboxPath + apkDName).then(function (result) {
                dbx.sharingCreateSharedLinkWithSettings({path: constants.dropboxPath + apkDName}).then(function (linkResult) {
                    if (linkResult.url) {
                        postMessageToSlackChannel(linkResult.link).then(function (slackResult) {
                            resolve(slackResult);
                        }).catch(function (r) {
                            reject(r);
                        })
                    }
                }).catch(function (err) {
                    reject(err);
                });
            }).catch(function (err) {
                reject(err);
            });
        }


    });
}, removeBuildFolder = function () {
    return new Promise(function (resolve) {
        let buildPath = getProjectDir() + sep + "app" + sep + "build";
        if (fs.existsSync(buildPath)) {
            rimraf(buildPath, function () {
                resolve(1);
            });
        } else {
            resolve(0);
        }
    });
}, findInDir = function (startPath, filter) {
    return new Promise(function (resolve) {

        let foundList = [], startTime = (new Date()).getTime();
        fun(startPath, filter, function (fileName) {
            foundList.push(fileName);
        });
        log.log(foundList.length);
        let finishTime = (new Date()).getTime() - startTime;
        resolve({list: foundList, time: finishTime});

        function fun(startPath, filter, callback) {
            if (!fs.existsSync(startPath)) {
                return;
            }
            let files = fs.readdirSync(startPath);
            for (let i = 0; i < files.length; i++) {
                let filename = path.join(startPath, files[i]);
                let stat = fs.lstatSync(filename);
                if (stat.isDirectory()) {
                    fun(filename, filter, callback); //recurse
                } else if (filter.test(filename)) callback(filename);
            }
        }
    });
}, checkoutDevBranch = function () {
    return new Promise(function (resolve, reject) {
        git.Repository.open(path.resolve(getProjectDir(), getProjectDir() + "/.git")).then(function (repo) {
            if (repo) {
                repo.checkoutBranch("master", {}).then(function () {
                    resolve(repo);
                }).catch(function (err) {
                    log.error(err);
                    reject(err);
                })
            }
        }).catch(function (err) {
            log.error(err);
            reject(err);
        });
    });
}, handleChangesBranch = function () {
    checkoutDevBranch().then(function (repo) {
        repo.getHeadCommit().then(function (commit) {
            repo.getBranch("update-local-CMS-with-live-CMS_", function (branch, branchRepo) {
                if (branchRepo === undefined) {
                    repo.createBranch("update-local-CMS-with-live-CMS_", commit, false).then(function (done) {
                        log.log(done);
                        proceedBranch();
                    }).catch(function (err) {
                        log.error(err);
                        proceedBranch();
                    });
                } else proceedBranch();

                function proceedBranch() {
                    repo.refreshIndex(function (l, index) {
                        index.writeTree().then(function (Oid) {

                        });
                    });
                }
            });
        }).catch(function (err) {
            log.error(err);
        });
    }).catch(function (err) {
        log.error(err);
    });
};

 removeBuildFolder().then(function (removeResult) {
     updateLocalCMSWithLiveCMS().then(function (res) {
         // produceAPK().then(function (produceResult) {
         //     uploadAPKToDropbox().then(function (uploadResult) {
         //     }).catch(function (err) {
         //     });
         // }).catch(function (err) {
         // });
     }).catch(function (err) {
     });
 }).catch(function () {
 });