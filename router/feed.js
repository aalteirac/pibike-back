const Koa = require('koa');
const fs = require('fs')
const router = require('koa-router')();
const app = new Koa();
const json2csv = require('json2csv');
const WebSocket = require('ws');
const enigma = require('enigma.js');
const schema = require('enigma.js/schemas/3.2.json');
const os = require('os');
const fse = require('fs-extra');
const http = require('http');
const https = require('https');
const Ant = require('aai-ant-plus');
const uploader=require('../uploader')
const stick = new Ant.GarminStick3;
const cadenceSensor = new Ant.CadenceSensor(stick);
const speedSensor = new Ant.SpeedSensor(stick);
const hrSensor = new Ant.HeartRateSensor(stick);
const filePath = '/home/pi/qlik/data/bike.csv';
const filePathInit = '/home/pi/qlik/data/bikeInit.csv';
const host = '127.0.0.1';
const docName='bikeR.qvf';
const docReadName='bike.qvf';
const appsPath='/home/pi/qlik/Sense/Apps/';

var fields = ['RiderID','Company', 'TimeStamp', 'HeartRate', 'Power Watts', 'Speed', 'Cadence','Distance'];
var count = 0;
var curapp;
var curappRead;
var simulationRunning=null;
var reloadInterval=5000;
var reloadTick=6;
var rider={};
var isBiking=false;
var curSpeed="None";
var curCadence="None";
const trigReloadURL="https://demosapi.qlik.com/api/qdt-core/reload/";


async function initANT(){
    speedSensor.setWheelCircumference(1.1018);
    speedSensor.on('speedData', async data => {
        if(isBiking && simulationRunning==null) {
            //write(rider, rider.cadence|"null", data.CalculatedSpeed,data.CalculatedSpeed*2.50);
            await write(rider, rider.cadence|"null", data.CalculatedSpeed,data.CalculatedDistance);
            count++;
            if(count==reloadTick) {
                await reloadApp();
                count=0;
            }
        }
        if(simulationRunning==null)curSpeed=data.CalculatedSpeed
    });

    cadenceSensor.on('cadenceData', data => {
        //console.log(data.CalculatedCadence, isBiking, simulationRunning);
        if(isBiking && data.CalculatedCadence>=0){
            rider.cadence=data.CalculatedCadence;
        }
        else{
            if(isBiking && data.CalculatedCadence<0 )
                rider.cadence=rider.cadence;
            else
                rider.cadence=0;
        }
        if(simulationRunning==null){
            if(data.CalculatedCadence<0) {
                curCadence = curCadence;
                //console.log("glitch");
            }
            else {
                curCadence = data.CalculatedCadence;
            }
        }
    });

    hrSensor.on('hbData', data => {
        rider.hr=data.ComputedHeartRate;
        //console.log(data.ComputedHeartRate)
    });


    stick.on('startup', function () {
        console.log('startup');
        speedSensor.attach(0, 0)
        setTimeout(()=>{
            cadenceSensor.attach(1, 0);
        },2000)
        setTimeout(()=>{
            hrSensor.attach(2, 0);
        },2000)
    });

    if (!stick.open()) {
        console.log('Stick not found!');
    }
}

async function httpGet(theUrl) {
    return new Promise((resolve, reject)=> {
        http.get(theUrl, (resp) => {
            let data = '';
            resp.on('data', (chunk) => {
                data += chunk;
            });
            resp.on('end', () => {
                resolve(data)
            });

        }).on("error", (err) => {
            reject(err)
        });
    })
}

async function httpsGet(theUrl) {
    return new Promise((resolve, reject)=> {
        const opHS = {
            hostname: 'demosapi.qlik.com',
            path: '/api/qdt-core/reload',
            method: 'GET',
            rejectUnauthorized: false
        };
        https.get(opHS, (resp) => {
            let data = '';
            resp.on('data', (chunk) => {
                data += chunk;
            });
            resp.on('end', () => {
                resolve(data)
            });

        }).on("error", (err) => {
            reject(err)
        });
    })
}

async function reloadApp() {
	return new Promise(async (resolve, reject)=> {
    if (!curapp) {
			const session = enigma.create({
				schema,
				url: `ws://${host}:9076/app`,
				createSocket: url => new WebSocket(url),
			});
			const qix = await session.open();
		
			curapp = await qix.openDoc(docName);
			console.log(curapp.id);
		}
		
		 await curapp.doReload().catch(
			(err) => {
				curapp=null;
				console.log(err);
				reject();
			});	
		var res =await curapp.doSave().catch(
			(errsave) => {
				curapp=null;
				console.log(errsave);
				reject();
			});
		//console.log(res)	
		resolve();
	})
    //return await fse.copy(appsPath+docName, appsPath+docReadName)
}

function randomTS(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomInt(min, max) {
    return (Math.random() * (max - min + 1) + min).toFixed(2);
}

function getRndLine(rider,cadence,speed,dist) {
    var hr=randomInt(55, 200);
    if(rider.hr)
        hr=rider.hr;
    return line =
    {
        'RiderID': rider.name,
        'Company': rider.org,
        'TimeStamp': new Date().valueOf(),
        'HeartRate': hr,
        'Power Watts': randomInt(50, 200),
        'Speed': speed,
        'Cadence': cadence,
        'Distance':dist
    }
}

async function write(rider,cadence,speed,dist) {
    var line;
    return new Promise((resolve, reject)=> {
        var toCsv = {
            data: getRndLine(rider,cadence,speed,dist),
            fields: fields,
            quotes: '',
            eol: "\r\n",
            hasCSVColumnTitle: false
        };
        fs.stat(filePath, function (err, stat) {
            if (err == null) {
                var csv = json2csv(toCsv);
                fs.appendFile(filePath, csv, function (err) {
                    if (err) reject(err);
                    resolve('The data was appended to file: ' + JSON.stringify(line));
                });
            }
            else {
                fields = (fields);
                var csv = json2csv(toCsv);
                fs.writeFile(filePath, fields + "\r\n" + csv, function (err, stat) {
                    if (err) reject(err);
                    resolve('file saved');
                });
            }
        });
    })
}

async function resetState(){
    return new Promise((resolve, reject)=> {
        fs.stat(filePath, async function (err, stat) {
            if (err == null) {
                fs.unlink(filePath, async function (err) {
                    if (err) {
                        reject(err)
                    }
                    else {
                        await fse.copy(filePathInit, filePath)
                        reloadApp();
                        resolve({result: "restored"});
                    }
                });
            }
            else {
                reject(err)
            }
        })
    })
}

async function deleteCSV() {
    return new Promise((resolve, reject)=> {
        fs.stat(filePath, async function (err, stat) {
            if (err == null) {
                fs.unlink(filePath, async function (err) {
                    if (err) {
                        reject(err)
                    }
                    else {
                        resolve({result: "deleted"});
                    }
                });
            }
            else {
                reject(err)
            }
        })
    })
}

async function simulateSensor(rider){
    curSpeed=randomInt(7,15)
    curCadence= curSpeed*randomInt(2,3.3)
    await write(rider,curCadence,curSpeed,curSpeed*2.23);
    curSpeed=randomInt(7,15)
    curCadence= curSpeed*randomInt(2,3.3)
    await write(rider,curCadence,curSpeed,curSpeed*2.23);
    await reloadApp();
}

router.get('/stat', async (ctx, next) => {
    var res=await httpGet(`http://${host}:9076/healthcheck`);
    var nr=JSON.parse(res)
    var hr="...";
    if(rider.hr)
        hr=rider.hr;
    nr.hr=hr;
    nr.cadence=curCadence;
    nr.speed=curSpeed;
    nr.isBiking=isBiking;
    nr.curBikerName= rider.name;
    ctx.body = nr;
    await next();
})

router.get('/stop', async (ctx, next) => {
    try {
        if(simulationRunning) {
            isBiking=false;
            clearInterval(simulationRunning);
            simulationRunning=null;
            ctx.body = {result:"timer stopped"};
            await next();
        }
        else{
            isBiking=false;
            ctx.body = {result:"timer already stopped"};
            await next();
        }
    } catch (error) {
        ctx.body = error;
        await next();
    }
});

router.get('/simu', async (ctx, next) => {

    try {
        if(ctx.request.query["r"] && ctx.request.query["t"] && ctx.request.query["rc"]&& !isBiking){
            clearInterval(simulationRunning);
            simulationRunning=null;
            rider.name=decodeURIComponent( ctx.request.query["r"])
            rider.org=decodeURIComponent( ctx.request.query["rc"])
            isBiking=true;
            simulationRunning = setInterval(()=> {
                simulateSensor(rider);
            }, reloadInterval)
            setTimeout(()=>{
                clearInterval(simulationRunning);
                simulationRunning=null;
                count=0;
                isBiking=false;
                curCadence=0;
                curSpeed=0;
                uploader.upload().then(()=>{
                    httpsGet(trigReloadURL).then((res)=>{
                        console.log(res)
                    })
                });
            },parseInt(ctx.request.query["t"]))
            ctx.body = {result:"Started"};
            await next();
        }
        else{
            ctx.body = {result:" Run already in progress or missing parameter(s)"};
            await next();
        }

    } catch (error) {
        ctx.body = error;
        await next();
    }
});

router.get('/rld', async (ctx, next) => {

    try {
        if(!isBiking){
            reloadApp();
            ctx.body = {result:"Reload triggered"};
            await next();
        }
        else{
            ctx.body = {result:" Run in progress, wait..."};
            await next();
        }

    } catch (error) {
        ctx.body = error;
        await next();
    }
});

router.get('/restart', async (ctx, next) => {

    try {
        if(ctx.request.query["r"] && ctx.request.query["t"] && ctx.request.query["rc"]&& !isBiking){
            clearInterval(simulationRunning);
            simulationRunning=null;
            rider.name=decodeURIComponent( ctx.request.query["r"])
            rider.org=decodeURIComponent( ctx.request.query["rc"])
            isBiking=true;
            setTimeout(()=>{
                count=0;
                isBiking=false;
                uploader.upload().then(()=>{
                    httpsGet(trigReloadURL).then((res)=>{
                        console.log(res)
                    })
                });
            },parseInt(ctx.request.query["t"]))
            ctx.body = {result:"Started"};
            await next();
        }
        else{
            ctx.body = {result:" Run already in progress or missing parameter(s)"};
            await next();
        }

    } catch (error) {
        ctx.body = error;
        await next();
    }
});

router.get('/restore', async (ctx, next) => {
    try {
        var res= await resetState();
        ctx.body = res;
        await next();
    } catch (error) {
        ctx.body = error;
        await next();
    }
});
initANT();
app.use(router.routes()); // route middleware
module.exports = app;